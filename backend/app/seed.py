"""种子数据脚本 —— 把前端 mockData.ts 的演示数据迁移进数据库。

运行：
    python -m app.seed          # 若库为空则灌入；已有数据则跳过
    python -m app.seed --force  # 清空并重新灌入
"""

import sys
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from .config import settings
from .database import Base, SessionLocal, engine, init_db
from .models import (
    Challenge,
    Class,
    ClassMeta,
    CoinTransaction,
    Group,
    Project,
    Question,
    Recruitment,
    ShowcaseItem,
    Topic,
    User,
)
from .security import hash_password
from .safety_builtin import build_safety_questions
from .services import gen_id

# 三个班级，每班 5 个小组
CLASSES = [
    {"id": "class-1", "name": "高二(1)班"},
    {"id": "class-2", "name": "高二(2)班"},
    {"id": "class-3", "name": "高二(3)班"},
]

# 每个班级各自的 5 个组名
CLASS_GROUP_NAMES = {
    "class-1": [
        "牛顿先锋队",
        "麦克斯韦闪电队",
        "爱因斯坦脑洞组",
        "特斯拉电流团",
        "伽利略观测站",
    ],
    "class-2": [
        "薛定谔猫队",
        "法拉第感应组",
        "开普勒轨道队",
        "居里放射团",
        "普朗克量子站",
    ],
    "class-3": [
        "玻尔模型队",
        "霍金辐射组",
        "费曼图解队",
        "狄拉克方程团",
        "波尔兹曼统计站",
    ],
}

STUDENT_NAMES = [
    "张伟", "王芳", "李娜", "刘洋", "陈杰",
    "杨静", "赵磊", "黄敏", "周涛", "吴昊",
    "徐丽", "孙强", "马超", "朱琳", "郭鹏",
    "何雪", "高峰", "林燕", "罗宇", "郑鑫",
    "梁晨", "谢辉", "宋佳", "唐宁", "许航", "韩冰",
    "冯雷", "邓超", "曹颖", "彭博", "蒋涛", "沈悦",
    "袁明", "程曦", "蔡琳", "丁楠", "魏嘉", "薛松",
    "叶青", "潘瑶", "汪俊", "田蕊", "董刚", "余玲",
    "钟鸣", "范琪", "苏然", "卢琳", "任远", "方圆",
    "石磊", "姚亮", "秦雪", "夏雨", "侯杰", "白杨",
    "龙飞", "叶绿", "段宇", "雷鸣", "蓝天", "史可",
    "鲍勃", "费霞", "江涛", "管彤", "骆阳", "席明",
    "柴静", "狄龙", "于慧", "苏宁", "冉冉", "柳青",
    "饶磊", "韦杰", "梅芳", "盛华", "焦阳", "洪涛",
]

AVATAR_COLORS = [
    "FF6B35", "0D47A1", "00BFA5", "E53935", "7C4DFF",
    "FF9800", "4CAF50", "2196F3", "9C27B0", "F44336",
]

TOPIC_OUTLINES = {
    "力学": [
        {"chapter": "运动的描述", "points": ["质点", "参考系", "位移", "速度", "加速度"]},
        {"chapter": "匀变速直线运动", "points": ["速度公式", "位移公式", "v-t图像", "自由落体"]},
        {"chapter": "相互作用", "points": ["重力", "弹力", "摩擦力", "力的合成与分解"]},
        {"chapter": "牛顿运动定律", "points": ["牛顿第一定律", "牛顿第二定律", "牛顿第三定律", "超重失重"]},
    ],
    "电磁学": [
        {"chapter": "静电场", "points": ["库仑定律", "电场强度", "电势", "电容"]},
        {"chapter": "恒定电流", "points": ["欧姆定律", "串并联电路", "电功与电功率"]},
        {"chapter": "磁场", "points": ["磁感应强度", "安培力", "洛伦兹力"]},
        {"chapter": "电磁感应", "points": ["磁通量", "法拉第电磁感应定律", "楞次定律"]},
    ],
    "光学": [
        {"chapter": "几何光学", "points": ["光的反射", "光的折射", "全反射", "透镜成像"]},
        {"chapter": "波动光学", "points": ["光的干涉", "光的衍射", "光的偏振"]},
    ],
    "热学": [
        {"chapter": "分子动理论", "points": ["分子热运动", "分子力", "内能"]},
        {"chapter": "气体定律", "points": ["玻意耳定律", "查理定律", "盖-吕萨克定律", "理想气体状态方程"]},
    ],
    "原子物理": [
        {"chapter": "原子结构", "points": ["电子的发现", "α粒子散射实验", "玻尔模型"]},
        {"chapter": "原子核", "points": ["天然放射现象", "核反应方程", "质能方程"]},
    ],
    "波动": [
        {"chapter": "机械振动", "points": ["简谐运动", "单摆", "受迫振动与共振"]},
        {"chapter": "机械波", "points": ["波的形成", "波长频率波速", "波的干涉衍射"]},
    ],
    "相对论初步": [
        {"chapter": "狭义相对论", "points": ["伽利略相对性原理", "光速不变原理", "时间膨胀", "长度收缩"]},
    ],
    "实验误差分析": [
        {"chapter": "误差理论", "points": ["系统误差", "偶然误差", "绝对误差与相对误差"]},
        {"chapter": "数据处理", "points": ["有效数字", "图像法", "逐差法"]},
    ],
}

TOPIC_LIST = list(TOPIC_OUTLINES.keys())


def _now() -> datetime:
    return datetime.now(timezone.utc)


def build_classes(db: Session) -> list[Class]:
    classes = [Class(id=c["id"], name=c["name"]) for c in CLASSES]
    db.add_all(classes)
    return classes


def build_groups_and_users(db: Session) -> tuple[list[Group], list[User]]:
    groups: list[Group] = []
    users: list[User] = []
    u_idx = 0
    g_idx = 0
    # 每班 26 人，分 5 组：第 1 组 6 人，其余 5 人
    group_sizes = [6, 5, 5, 5, 5]
    for class_def in CLASSES:
        cid = class_def["id"]
        for gi_in_class, gname in enumerate(CLASS_GROUP_NAMES[cid]):
            g_idx += 1
            gid = f"g-{g_idx}"
            member_ids: list[str] = []
            members_per_group = group_sizes[gi_in_class]
            for mi in range(members_per_group):
                uid_str = f"u-{u_idx + 1:02d}"
                member_ids.append(uid_str)
                users.append(
                    User(
                        id=uid_str,
                        username=uid_str,  # 登录名即学号
                        password_hash=hash_password(settings.student_default_password),
                        account_role="student",
                        name=STUDENT_NAMES[u_idx] if u_idx < len(STUDENT_NAMES) else f"学生{u_idx + 1}",
                        avatar=(
                            f"https://api.dicebear.com/7.x/avataaars/svg?seed={uid_str}"
                            f"&backgroundColor={AVATAR_COLORS[(g_idx + mi) % len(AVATAR_COLORS)]}"
                        ),
                        class_id=cid,
                        group_id=gid,
                        member_role="leader" if mi == 0 else "member",
                        personal_coins=0,
                    )
                )
                u_idx += 1
            ratio = 100 // len(member_ids)
            rem = 100 - ratio * len(member_ids)
            contribution = {mid: ratio + (1 if i < rem else 0) for i, mid in enumerate(member_ids)}
            groups.append(
                Group(
                    id=gid,
                    name=gname,
                    logo=f"#{AVATAR_COLORS[(g_idx - 1) % len(AVATAR_COLORS)]}",
                    total_coins=500,
                    initial_coins=500,
                    class_id=cid,
                    contribution_ratio=contribution,
                )
            )
    db.add_all(groups)
    db.add_all(users)
    return groups, users


def build_topics(db: Session) -> list[Topic]:
    from .physics_curriculum import TOPICS
    topics = [Topic(id=raw['id'], title=raw['title'], outline=raw['outline'], ai_material=raw['aiMaterial']) for raw in TOPICS]
    db.add_all(topics)
    return topics


def build_questions(db: Session, topics: list[Topic]) -> list[Question]:
    from .physics_builtin import QUESTIONS, question_values
    topic_ids = {topic.id for topic in topics}
    questions = [Question(id=raw['id'], **question_values(raw))
                 for raw in QUESTIONS if raw['topicId'] in topic_ids]
    db.add_all(questions)
    return questions


def build_challenges(db: Session, groups: list[Group], topics: list[Topic]) -> None:
    defs = [
        ("ch-01", "力学基础挑战赛", 0, 0, 100, 3),
        ("ch-02", "电磁学高阶对决", 1, 1, 150, 5),
        ("ch-03", "光学概念速答", 2, 2, 80, 2),
    ]
    for cid, title, gi, ti, reward, days in defs:
        db.add(
            Challenge(
                id=cid,
                title=title,
                creator_group_id=groups[gi].id,
                topic_id=topics[ti].id,
                question_ids=[],
                reward=reward,
                deadline=_now() + timedelta(days=days),
                status="open",
                submissions=[],
            )
        )


def build_projects(db: Session, groups: list[Group]) -> list[Project]:
    now = _now()
    statuses = ["planning", "progress", "review", "done", "failed", "frozen"]
    defs = [
        ("自制简易电动机", "电磁学", "electric"),
        ("弹簧振子周期测量", "力学", "mechanical"),
        ("太阳能电池效率实验", "光学", "optical"),
        ("气体定律验证", "热学", "thermal"),
        ("云室观察放射性径迹", "原子物理", "radiation"),
        ("驻波共振演示装置", "波动", "mechanical"),
        ("光纤通信模拟实验", "光学", "optical"),
        ("霍尔效应测量磁场", "电磁学", "electric"),
        ("单摆测重力加速度", "力学", "mechanical"),
        ("黑体辐射曲线拟合", "热学", "thermal"),
    ]
    projects: list[Project] = []
    for i, (title, topic, equip) in enumerate(defs):
        gi = i % len(groups)
        status = statuses[i % len(statuses)]
        progress = 100 if status == "done" else 55 if status == "failed" else 10 + i * 10
        projects.append(
            Project(
                id=f"proj-{i + 1:02d}",
                title=title,
                topic=topic,
                owner_group_id=groups[gi].id,
                start_date=now - timedelta(days=10 - i),
                due_date=now + timedelta(days=20 + i),
                progress=progress,
                status=status,
                tech_points=f"# {title} 技术要点\n\n## 原理\n基于{topic}核心原理设计的实验方案。\n\n## 器材\n{equip}类仪器、标准量具等。",
                difficulties=f"# {title} 技术难点\n\n1. 精度控制\n2. 数据处理\n3. 误差分析",
                equipment_list=[
                    {"name": "主仪器", "qty": 1, "category": equip},
                    {"name": "辅助器材", "qty": 5, "category": "mechanical"},
                ],
                safety_category=equip,
                safety_passed={},
                photos=[],
                results=f"# {title} 实验结果\n\n实验成功，数据吻合度良好。" if status == "done" else "",
                reward_coins=200 + i * 20,
            )
        )
    db.add_all(projects)
    return projects


def build_recruitments(db: Session, projects: list[Project], users: list[User]) -> None:
    statuses = ["open", "open", "assigned", "done", "failed"]
    for i, p in enumerate(projects[:5]):
        pool = [u for u in users if u.group_id != p.owner_group_id]
        bids = []
        for j in range(min(3, len(pool))):
            bids.append(
                {
                    "userId": pool[(i + j) % len(pool)].id,
                    "skillDesc": ["数据分析", "仪器操作", "文档撰写"][j % 3],
                    "hours": 5 + j * 2,
                    "bidAt": (_now() - timedelta(days=j + 1)).isoformat(),
                }
            )
        st = statuses[i % len(statuses)]
        assignee = bids[0]["userId"] if st != "open" and bids else None
        result = "success" if st == "done" else "fail" if st == "failed" else None
        reward = 60 + i * 15
        actual_pay = reward if result == "success" else 0 if result == "fail" else None
        db.add(
            Recruitment(
                id=f"rec-{i + 1:02d}",
                project_id=p.id,
                title=f"{p.title} - 招募技术助手",
                description=f"本项目需要具有{['数据分析', '硬件搭建', '软件模拟'][i % 3]}能力的同学协助。",
                skills=["数据分析", "团队协作"],
                reward=reward,
                deadline=_now() + timedelta(days=7 - i),
                status=st,
                bids=bids,
                assignee_user_id=assignee,
                result=result,
                actual_pay=actual_pay,
            )
        )


def build_coin_txs(db: Session, groups: list[Group]) -> None:
    balances = {g.id: 0 for g in groups}
    for g in groups:
        balances[g.id] += g.initial_coins
        db.add(
            CoinTransaction(
                id=f"tx-init-{g.id}",
                group_id=g.id,
                source="teacher_set",
                ref_id="init",
                delta=g.initial_coins,
                balance_after=balances[g.id],
                created_at=_now() - timedelta(days=30),
                note="教师分配初始能量币",
            )
        )
    srcs = ["challenge", "project", "recruit"]
    for i in range(15):
        g = groups[i % len(groups)]
        delta = (1 if i % 2 == 0 else -1) * (20 + (i % 4) * 10)
        balances[g.id] += delta
        db.add(
            CoinTransaction(
                id=f"tx-{i + 1:03d}",
                group_id=g.id,
                source=srcs[i % len(srcs)],
                ref_id=f"ref-{i}",
                delta=delta,
                balance_after=balances[g.id],
                created_at=_now() - timedelta(hours=20 - i),
                note=("挑战结算" if srcs[i % len(srcs)] == "challenge" else "项目阶段奖励" if srcs[i % len(srcs)] == "project" else "招募任务结算"),
            )
        )
    for g in groups:
        g.total_coins = balances[g.id]


SHOWCASE_IMAGES = [
    "https://images.unsplash.com/photo-1621361164796-86878265944d?w=600&q=80",
    "https://images.unsplash.com/photo-1592861956093-46574388857e?w=600&q=80",
    "https://images.unsplash.com/photo-1583465766507-a37458119065?w=600&q=80",
    "https://images.unsplash.com/photo-1598431786950-17348736a25a?w=600&q=80",
]


def build_showcase(db: Session, projects: list[Project], groups: list[Group]) -> None:
    done = [p for p in projects if p.status == "done"][:4]
    group_names = {g.id: g.name for g in groups}
    for i, p in enumerate(done):
        db.add(
            ShowcaseItem(
                id=f"sc-{i + 1:02d}",
                project_id=p.id,
                title=p.title,
                cover_image=SHOWCASE_IMAGES[i % len(SHOWCASE_IMAGES)],
                group_id=p.owner_group_id,
                description=f"{group_names.get(p.owner_group_id, '')}制作：{p.title}项目成果展示。",
                loves=8 + i * 3,
                loved_by=[],
                created_at=_now() - timedelta(days=i + 1),
                # 种子作品视为已通过审批，避免全新库一上来全是"待审批"
                status="approved",
                reject_reason="",
                awarded_coins=0,
            )
        )


def ensure_safety_questions(db: Session) -> int:
    """把内置安全题灌进 questions 表（仅当一道安全题都没有时）。

    为什么要单独一个函数：seed() 在"库里已有 Group"时会提前返回，所以对**已上线的库**
    它什么都不做；而安全题必须补进去，否则在线模式下学生安全考核会没题可考。

    用"一条都没有"作判断、而不是"缺哪条补哪条"：后者会在教师删掉某道内置题后，
    每次重启又把它复活。要还原内置题库应走教师端的「恢复默认」按钮。

    返回本次灌入的条数（跳过时为 0）。
    """
    if db.query(Question).filter(Question.safety_category.isnot(None)).count() > 0:
        return 0
    for raw in build_safety_questions():
        db.add(
            Question(
                id=raw["id"],
                type=raw["type"],
                stem=raw["stem"],
                options=list(raw["options"]),
                answer=raw["answer"],
                knowledge_point=raw.get("knowledgePoint", ""),
                difficulty=raw.get("difficulty", 1),
                topic_id=None,
                safety_category=raw["safetyCategory"],
            )
        )
    db.commit()
    return len(build_safety_questions())


def _validate_seed_credentials() -> None:
    missing = [name for name in ('admin_password', 'teacher_password', 'student_default_password')
               if not getattr(settings, name).strip() or getattr(settings, name) == 'change-me-via-env']
    if missing:
        raise ValueError('首次播种前请配置非占位符密码：' + ', '.join(name.upper() for name in missing))


def seed(force: bool = False) -> None:
    # force 也必须先验证，不能清空已有数据库后才发现配置不完整。
    if force:
        _validate_seed_credentials()
    init_db()
    db = SessionLocal()
    try:
        if force:
            print("⚠️  --force：清空所有表并重新灌入…")
            Base.metadata.drop_all(bind=engine)
            Base.metadata.create_all(bind=engine)

        # 放在提前返回之前：对已上线、已有数据的库也要把安全题补齐
        added = ensure_safety_questions(db)
        if added:
            print(f"🛡  已灌入内置安全题 {added} 道（教师端可继续维护）")

        if db.query(Group).first() is not None:
            print("✅ 数据库已有数据，跳过种子灌入（如需重置请加 --force）。")
            return

        _validate_seed_credentials()

        # 管理员账号
        db.add(
            User(
                id="admin",
                username="admin",
                password_hash=hash_password(settings.admin_password),
                account_role="admin",
                name="管理员",
                avatar="https://api.dicebear.com/7.x/avataaars/svg?seed=admin&backgroundColor=1A1A2E",
                group_id=None,
                member_role="leader",
                personal_coins=0,
            )
        )

        # 教师账号
        db.add(
            User(
                id="teacher",
                username="teacher",
                password_hash=hash_password(settings.teacher_password),
                account_role="teacher",
                name="教师",
                avatar="https://api.dicebear.com/7.x/avataaars/svg?seed=teacher&backgroundColor=4F7CFF",
                group_id=None,
                member_role="leader",
                personal_coins=0,
            )
        )

        classes = build_classes(db)
        groups, users = build_groups_and_users(db)
        topics = build_topics(db)
        build_questions(db, topics)
        build_challenges(db, groups, topics)
        projects = build_projects(db, groups)
        build_recruitments(db, projects, users)
        build_coin_txs(db, groups)
        build_showcase(db, projects, groups)
        db.add(ClassMeta(id=1, initial_coins_per_group=500, term_name="2025-2026学年第一学期"))

        db.commit()
        print("🎉 种子数据灌入完成！")
        print("   - 管理员账号: admin（密码取自配置，不写入日志）")
        print("   - 教师账号: teacher（密码取自配置，不写入日志）")
        print(f"   - 学生账号: u-01 ~ u-{len(users):02d}（密码取自配置，不写入日志）")
        print(f"   - {len(classes)} 个班级、{len(groups)} 个小组、{len(users)} 名学生、{len(topics)} 个主题")
    finally:
        db.close()


if __name__ == "__main__":
    seed(force="--force" in sys.argv)
