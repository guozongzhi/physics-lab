"""使用临时文件 SQLite 与独立连接，验证真实写竞争（不接触应用数据库）。"""
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.database import Base
from app.models import CoinTransaction, Group
from app.services import InsufficientCoins, add_tx


@pytest.fixture
def sessions(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path / 'concurrent.db'}", connect_args={'check_same_thread': False, 'timeout': 10})
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False)
    with factory() as db:
        db.add(Group(id='g', name='并发组', total_coins=100, initial_coins=100))
        db.commit()
    try:
        yield factory
    finally:
        engine.dispose()


def test_concurrent_credits_do_not_lose_updates(sessions):
    ready = Barrier(4)
    def credit(index):
        with sessions() as db:
            # 四个连接先读到相同旧余额，再一起写。
            assert db.get(Group, 'g').total_coins == 100
            ready.wait(timeout=5)
            add_tx(db, 'g', source='teacher_set', ref_id=str(index), delta=10, note='测试')
            db.commit()
    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(credit, range(4)))
    with sessions() as db:
        assert db.get(Group, 'g').total_coins == 140
        txs = db.query(CoinTransaction).all()
        assert len(txs) == 4 and sum(t.delta for t in txs) == 40
        assert sorted(t.balance_after for t in txs) == [110, 120, 130, 140]


def test_competing_debits_cannot_spend_same_balance(sessions):
    ready = Barrier(2)
    def debit(index):
        with sessions() as db:
            assert db.get(Group, 'g').total_coins == 100
            ready.wait(timeout=5)
            try:
                add_tx(db, 'g', source='transfer', ref_id=str(index), delta=-80, note='测试', allow_partial_debit=False)
                db.commit()
                return True
            except InsufficientCoins:
                db.rollback()
                return False
    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(debit, range(2)))
    assert sorted(outcomes) == [False, True]
    with sessions() as db:
        assert db.get(Group, 'g').total_coins == 20
        assert db.query(CoinTransaction).count() == 1


def test_rollback_reverts_balance_and_ledger(sessions):
    with sessions() as db:
        add_tx(db, 'g', source='teacher_set', ref_id='rollback', delta=10, note='测试')
        db.flush()
        db.rollback()
    with sessions() as db:
        assert db.get(Group, 'g').total_coins == 100
        assert db.query(CoinTransaction).count() == 0


def test_concurrent_transfer_reviews_settle_once(sessions):
    from fastapi import HTTPException
    from app.models import CoinTransferRequest, User
    from app.routers.coins import review_transfer
    from app.schemas import CoinTransferReview

    with sessions() as db:
        db.add(Group(id='target', name='收款组', total_coins=0))
        db.add(CoinTransferRequest(id='request', source_group_id='g', target_group_id='target',
                                   requested_by='leader', amount=80))
        db.commit()
    ready = Barrier(2)

    def approve(index):
        with sessions() as db:
            # 两个会话都提前读到 pending，验证条件更新而非内存状态检查。
            assert db.get(CoinTransferRequest, 'request').status == 'pending'
            ready.wait(timeout=5)
            teacher = User(id=f'teacher-{index}', account_role='teacher', class_id=None)
            try:
                review_transfer('request', CoinTransferReview(decision='approve'), db, teacher)
                return 200
            except HTTPException as exc:
                db.rollback()
                return exc.status_code

    with ThreadPoolExecutor(max_workers=2) as pool:
        outcomes = list(pool.map(approve, range(2)))
    assert sorted(outcomes) == [200, 409]
    with sessions() as db:
        assert db.get(Group, 'g').total_coins == 20
        assert db.get(Group, 'target').total_coins == 80
        assert db.query(CoinTransaction).count() == 2
        assert db.get(CoinTransferRequest, 'request').status == 'approved'
