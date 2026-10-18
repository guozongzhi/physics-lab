"""Authenticated encryption for admin exports; raw UIDs never enter logs."""
import base64
import hashlib
from cryptography.fernet import Fernet
from .config import settings
from .models import NfcInventory


def cipher():
    key = hashlib.sha256(b'nfc-inventory-v1\0' + settings.nfc_uid_secret.encode()).digest()
    return Fernet(base64.urlsafe_b64encode(key))


def remember_uid(db, key, uid):
    if db.get(NfcInventory, key) is None:
        db.add(NfcInventory(uid_key=key, uid_ciphertext=cipher().encrypt(uid.upper().encode()).decode()))


def reveal_uid(item):
    return cipher().decrypt(item.uid_ciphertext.encode()).decode()
