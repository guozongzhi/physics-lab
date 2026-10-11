"""Idempotent content migration. Does not alter stored quizzes, grades or user data."""
from .database import SessionLocal
from .physics_builtin import upgrade_legacy_questions

if __name__ == '__main__':
    with SessionLocal() as db:
        print(f'Updated original physics templates: {upgrade_legacy_questions(db)}')
