"""Isolated local NFC backend, never opens the application's existing database.
Run from backend: .venv/bin/python -m tools.nfc_demo --uid <card UID>
Credentials are written to a private temporary directory, not the repository.
"""
import argparse
import json
import os
import secrets
import tempfile
from pathlib import Path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--uid', action='append', required=True)
    parser.add_argument('--port', type=int, default=8010)
    args = parser.parse_args()
    folder = Path(tempfile.mkdtemp(prefix='nfc-backend-demo-'))
    os.environ['DATABASE_URL'] = f'sqlite:///{folder / "demo.db"}'
    os.environ['NFC_UID_SECRET'] = secrets.token_hex(32)
    os.environ['JWT_SECRET'] = secrets.token_hex(32)
    # Import after selecting the isolated DB. No production env/password is reused.
    import uvicorn
    from app.database import init_db, SessionLocal
    from app.models import Class, Group, User, NfcCard, NfcDevice
    from app.routers.nfc import token_hash, uid_key
    from app.security import hash_password
    from app.main import app

    password, token = secrets.token_urlsafe(18), 'nfc_' + secrets.token_urlsafe(32)
    init_db()
    with SessionLocal() as db:
        db.add(Class(id='nfc-demo-class', name='NFC DEMO CLASS'))
        db.add(Group(id='nfc-demo-group', name='NFC DEMO GROUP', class_id='nfc-demo-class', total_coins=128))
        db.add(User(id='nfc-demo-admin', username='nfc-demo-admin', name='NFC DEMO ADMIN',
                    password_hash=hash_password(password), account_role='admin'))
        db.add(NfcDevice(id='nfc-demo-device', name='NFC DEMO', token_hash=token_hash(token),
                         allowed_class_ids=['nfc-demo-class']))
        for index, uid in enumerate(args.uid, 1):
            key, mask = uid_key(uid)
            user_id = f'nfc-demo-student-{index}'
            db.add(User(id=user_id, username=user_id, name=f'NFC DEMO {index}', account_role='student',
                        password_hash=hash_password(secrets.token_urlsafe(16)),
                        class_id='nfc-demo-class', group_id='nfc-demo-group', personal_coins=32 * index))
            db.add(NfcCard(uid_key=key, uid_mask=mask, user_id=user_id, active_user_id=user_id))
        db.commit()
    file = folder / 'connection.json'
    with os.fdopen(os.open(file, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), 'w') as f:
        json.dump({'deviceToken':token, 'adminUsername':'nfc-demo-admin', 'adminPassword':password,
                   'database':str(folder / 'demo.db'), 'port':args.port}, f, indent=2)
    print(f'Isolated demo configuration: {file}', flush=True)
    print('Use your computer LAN IP as the backend host; HTTP is LAN development only.', flush=True)
    uvicorn.run(app, host='0.0.0.0', port=args.port, log_level='warning')


if __name__ == '__main__':
    main()
