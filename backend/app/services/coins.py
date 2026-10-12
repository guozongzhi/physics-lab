from sqlalchemy import update
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import set_committed_value
from .. import models
from .common import gen_id, _now

# ---------- 能量币 ----------
class InsufficientCoins(ValueError):
    """余额不足时由 HTTP 用例转换为 400；不在服务层提交事务。"""


def add_tx(
    db: Session,
    group_id: str,
    *,
    source: str,
    ref_id: str,
    delta: int,
    note: str,
    user_id: str | None = None,
    allow_partial_debit: bool = True,
) -> models.CoinTransaction:
    group = db.get(models.Group, group_id)
    if group is None:
        raise ValueError(f"小组不存在: {group_id}")
    # UPDATE 获取行写锁并返回最新余额，避免两个请求基于旧值覆盖彼此。
    # SQLite 不支持 SELECT FOR UPDATE；无变化 UPDATE 在两种数据库中都能序列化写入。
    balance = db.execute(
        update(models.Group).where(models.Group.id == group_id)
        .values(total_coins=models.Group.total_coins)
        .returning(models.Group.total_coins)
        .execution_options(synchronize_session=False)
    ).scalar_one()
    set_committed_value(group, 'total_coins', balance)
    if not allow_partial_debit and balance + delta < 0:
        raise InsufficientCoins('小组能量币不足')
    new_total = max(0, balance + delta)
    delta = new_total - balance
    group.total_coins = new_total
    db.flush([group])
    tx = models.CoinTransaction(
        id=gen_id("tx_"),
        group_id=group_id,
        user_id=user_id,
        source=source,
        ref_id=ref_id,
        delta=delta,
        balance_after=group.total_coins,
        created_at=_now(),
        note=note,
    )
    db.add(tx)
    return tx


def challenge_reward_for(questions: list[models.Question], meta: models.ClassMeta) -> int:
    """按所选题目各自的难度累加出挑战奖励。

    定价权归教师（`class_meta` 的三档单价），**学生不能自己填**——否则改个请求体
    就能把奖励改成任意值。难度 1/2/3 对应简单/中等/困难，越界值向最近档收拢。
    """
    rates = {1: meta.coin_easy, 2: meta.coin_medium, 3: meta.coin_hard}
    return sum(rates[min(3, max(1, q.difficulty or 1))] for q in questions)


def settle_challenge(db: Session, challenge: models.Challenge, solver_group_id: str, accuracy: float) -> dict:
    reward = int(challenge.reward * accuracy)
    bonus = int(challenge.reward * 0.2) if accuracy >= 0.95 else 0
    solver_reward = reward + bonus
    creator_refund = challenge.reward - reward

    add_tx(
        db,
        solver_group_id,
        source="challenge",
        ref_id=challenge.id,
        delta=solver_reward,
        note=f"挑战「{challenge.title}」答对奖励" + ("(含卓越加成)" if accuracy >= 0.95 else ""),
    )
    if creator_refund > 0:
        add_tx(
            db,
            challenge.creator_group_id,
            source="challenge",
            ref_id=challenge.id,
            delta=creator_refund,
            note=f"挑战「{challenge.title}」剩余能量币回收",
        )
    return {"solverReward": solver_reward, "creatorRefund": creator_refund}


def escrow_recruitment(
    db: Session,
    recruitment: models.Recruitment,
    owner_group_id: str | None,
    *,
    note: str,
    allow_partial_debit: bool = True,
) -> int:
    """从发包组扣押招募押金，返回实际扣到的数额。

    新发布路径使用严格扣款；历史招募允许按实际余额补扣。
    返回实际押金，避免出现"账上写了扣、实际没扣"的差额。
    """
    if owner_group_id is None or recruitment.reward <= 0:
        return 0
    tx = add_tx(
        db,
        owner_group_id,
        source="recruit",
        ref_id=recruitment.id,
        delta=-recruitment.reward,
        note=note,
        allow_partial_debit=allow_partial_debit,
    )
    recruitment.escrow_paid = -tx.delta
    return recruitment.escrow_paid


def settle_recruitment(db: Session, recruitment: models.Recruitment, result: str) -> dict:
    """按押金结算招募：酬劳从中标组该得的份额里出，剩下的退回发包组。

    押金是发布招募时就从发包组扣下的（见 routers/recruitments.create_recruitment），
    所以这里**不增发**能量币。原实现既没扣押金又照发不误，等于凭空印币——
    「失败」一档尤其离谱：发包组会白得一笔自己从未付过的钱。

    不变式：escrowed = 付给中标组的 + 退回发包组的。
    """
    project = db.get(models.Project, recruitment.project_id)
    owner_group_id = project.owner_group_id if project else None

    # 押金：新招募在发布时已扣；改动前发布的存量招募没扣过，这里补扣。
    escrowed = recruitment.escrow_paid
    if escrowed <= 0:
        escrowed = escrow_recruitment(
            db,
            recruitment,
            owner_group_id,
            note=f"招募「{recruitment.title}」补扣押金",
        )

    assignee = db.get(models.User, recruitment.assignee_user_id) if recruitment.assignee_user_id else None
    assignee_group_id = assignee.group_id if assignee else None

    if result == "success":
        assignee_pay = escrowed
    elif result == "partial":
        assignee_pay = escrowed // 2
    else:
        assignee_pay = 0

    paid = 0
    if assignee_pay > 0 and assignee_group_id:
        add_tx(
            db,
            assignee_group_id,
            source="recruit",
            ref_id=recruitment.id,
            delta=assignee_pay,
            note=f"招募「{recruitment.title}」{'全额' if result == 'success' else '部分'}酬劳",
            user_id=recruitment.assignee_user_id,
        )
        paid = assignee_pay

    # 没付出去的一律退回发包组：包括失败、部分完成，以及中标学生没有小组、
    # 钱无处可付的情况——不能让能量币在账上凭空消失。
    owner_refund = escrowed - paid
    if owner_refund > 0 and owner_group_id:
        add_tx(
            db,
            owner_group_id,
            source="recruit",
            ref_id=recruitment.id,
            delta=owner_refund,
            note=f"招募「{recruitment.title}」{'失败' if result == 'fail' else '剩余'}押金退回",
        )
    return {"assigneePay": paid, "ownerRefund": owner_refund, "escrowed": escrowed}


def settle_project_done(db: Session, project: models.Project) -> dict:
    group = db.get(models.Group, project.owner_group_id)
    earnings: dict[str, int] = {}
    if group is None:
        return earnings

    members = db.query(models.User).filter(models.User.group_id == project.owner_group_id).all()
    total_reward = project.reward_coins
    ratio_map = group.contribution_ratio or {}

    # 只有比例表确实覆盖到本组成员时才按比例分。历史遗留的失效 id（如 u-01 对不上现在的
    # u_xxxxxx）会让每个人的比例都是 0——那样项目做完了却谁都拿不到个人能量，是静默失败。
    # 因此这里加均分兜底：比例表用不上时，奖励按人头平分给组员。
    ratios = {m.id: ratio_map.get(m.id, 0) for m in members}
    if members and sum(ratios.values()) > 0:
        for member in members:
            earning = int(total_reward * ratios[member.id] / 100)
            if earning > 0:
                earnings[member.id] = earning
                db.execute(update(models.User).where(models.User.id == member.id).values(
                    personal_coins=models.User.personal_coins + earning
                ))
    elif members:
        # 余数依次补给靠前的成员，保证分出去的总额恰好等于奖励
        share, remainder = divmod(total_reward, len(members))
        for i, member in enumerate(members):
            earning = share + (1 if i < remainder else 0)
            if earning > 0:
                earnings[member.id] = earning
                db.execute(update(models.User).where(models.User.id == member.id).values(
                    personal_coins=models.User.personal_coins + earning
                ))

    add_tx(
        db,
        project.owner_group_id,
        source="project",
        ref_id=project.id,
        delta=total_reward,
        note=f"项目「{project.title}」完成奖励",
    )
    return earnings
