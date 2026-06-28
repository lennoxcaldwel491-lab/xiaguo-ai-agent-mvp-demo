from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.repository import create_user, get_user_by_username
from backend.app.security import hash_password


def ensure_user(username: str, password: str, role: str) -> None:
    if get_user_by_username(username):
        return
    create_user(user_id=f"user_{username}", username=username, password_hash=hash_password(password), role=role)


def main() -> None:
    ensure_user("admin", "admin123", "admin")
    ensure_user("operator", "operator123", "operator")
    ensure_user("farmer", "farmer123", "farmer")
    print("Demo users seeded.")


if __name__ == "__main__":
    main()
