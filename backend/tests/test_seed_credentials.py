"""播种安全边界；不访问真实数据库或打印配置密码。"""
import pytest
from sqlalchemy.orm import sessionmaker
from app import seed


@pytest.mark.parametrize('field', ['admin_password','teacher_password','student_default_password'])
@pytest.mark.parametrize('bad', ['', 'change-me-via-env'])
def test_force_seed_rejects_placeholder_before_database_access(monkeypatch,field,bad):
    for key in ['admin_password','teacher_password','student_default_password']:
        monkeypatch.setattr(seed.settings,key,'test-only-valid')
    monkeypatch.setattr(seed.settings,field,bad)
    def forbidden_db():
        raise AssertionError('不得接触数据库')
    monkeypatch.setattr(seed,'init_db',forbidden_db)
    with pytest.raises(ValueError,match=field.upper()):
        seed.seed(force=True)


def test_existing_database_still_skips_account_seeding(monkeypatch,db,capsys):
    monkeypatch.setattr(seed,'init_db',lambda:None)
    monkeypatch.setattr(seed,'SessionLocal',sessionmaker(bind=db.get_bind()))
    monkeypatch.setattr(seed,'ensure_safety_questions',lambda session:0)
    monkeypatch.setattr(seed.settings,'admin_password','change-me-via-env')
    seed.seed()
    output=capsys.readouterr().out
    assert '跳过种子' in output
    assert 'change-me-via-env' not in output
