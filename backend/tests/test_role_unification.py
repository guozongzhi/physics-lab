"""角色收编：admin 独占的业务能力下放教师，管理权限按班级作用域收敛。

教师账号管理仍为管理员独占；其余班级 / NFC 能力教师可用，
有班级绑定的教师只能操作本班。
"""

import pytest

from app.config import settings
from app.models import Class, Group, User


@pytest.fixture(autouse=True)
def nfc_secret(monkeypatch):
    monkeypatch.setattr(settings, "nfc_uid_secret", "role-unification-secret-at-least-32-bytes")


def scoped_teacher(db, class_id="class-1"):
    teacher = db.get(User, "teacher")
    teacher.account_role = "teacher"
    teacher.class_id = class_id
    db.commit()
    return teacher


def test_teacher_can_create_class(client, auth):
    response = client.post("/api/classes", headers=auth("teacher", "teacher123"), json={"name": "三班"})
    assert response.status_code == 201, response.text
    assert response.json()["name"] == "三班"


def test_scoped_teacher_can_only_delete_own_class(client, auth, db):
    scoped_teacher(db)
    headers = auth("teacher", "teacher123")
    assert client.delete("/api/classes/class-2", headers=headers).status_code == 403
    assert db.get(Class, "class-1") is not None
    assert client.delete("/api/classes/class-1", headers=headers).status_code == 200
    assert db.get(Class, "class-1") is None


def test_global_teacher_can_move_group_across_classes(client, auth, db):
    headers = auth("teacher", "teacher123")
    response = client.patch("/api/groups/g-1/class", headers=headers, json={"classId": "class-2"})
    assert response.status_code == 200, response.text
    db.expire_all()
    assert db.get(Group, "g-1").class_id == "class-2"
    assert db.get(User, "u-1").class_id == "class-2"


def test_scoped_teacher_cannot_move_group_out_of_class(client, auth, db):
    scoped_teacher(db)
    response = client.patch(
        "/api/groups/g-1/class", headers=auth("teacher", "teacher123"), json={"classId": "class-2"}
    )
    assert response.status_code == 403
    db.expire_all()
    assert db.get(Group, "g-1").class_id == "class-1"


def test_scoped_teacher_registry_and_export_stay_in_class(client, auth, db):
    scoped_teacher(db)
    headers = auth("teacher", "teacher123")
    data = client.get("/api/nfc/registry", headers=headers).json()
    assert [c["id"] for c in data["classes"]] == ["class-1"]
    assert {s["id"] for s in data["students"]} == {"u-1", "u-2", "u-3", "u-4"}

    assert client.get("/api/nfc/registry/export?class_id=class-1", headers=headers).status_code == 200
    assert client.get("/api/nfc/registry/export?class_id=class-2", headers=headers).status_code == 403
    assert client.post(
        "/api/nfc/registry/random", headers=headers, json={"classId": "class-2"}
    ).status_code == 403


def test_scoped_teacher_cannot_bind_foreign_class_student(client, auth, db):
    scoped_teacher(db)
    response = client.post(
        "/api/nfc/registry/batch",
        headers=auth("teacher", "teacher123"),
        json={"rows": [{"cardUid": "00112233", "userId": "u-5"}]},
    )
    assert response.status_code == 400
    assert "本班" in response.text


def test_scoped_teacher_device_management_is_class_bound(client, auth, db):
    admin_headers = auth("teacher", "teacher123")
    db.get(User, "teacher").account_role = "admin"
    db.commit()
    foreign = client.post(
        "/api/nfc/devices",
        headers=admin_headers,
        json={"name": "外班设备", "allowedClassIds": ["class-2"]},
    )
    assert foreign.status_code == 201, foreign.text

    scoped_teacher(db)
    teacher_headers = auth("teacher", "teacher123")
    assert client.post(
        "/api/nfc/devices",
        headers=teacher_headers,
        json={"name": "越权设备", "allowedClassIds": ["class-2"]},
    ).status_code == 403
    own = client.post(
        "/api/nfc/devices",
        headers=teacher_headers,
        json={"name": "本班设备", "allowedClassIds": ["class-1"]},
    )
    assert own.status_code == 201, own.text
    listed = client.get("/api/nfc/devices", headers=teacher_headers).json()
    assert [d["name"] for d in listed] == ["本班设备"]
    assert client.patch(
        f"/api/nfc/devices/{foreign.json()['id']}", headers=teacher_headers, json={"enabled": False}
    ).status_code == 403


def test_teacher_account_management_stays_admin_only(client, auth):
    headers = auth("teacher", "teacher123")
    assert client.get("/api/teachers", headers=headers).status_code == 403
    assert client.post(
        "/api/teachers", headers=headers, json={"username": "t2", "password": "secret123"}
    ).status_code == 403
