from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from backend.app.db import init_db


def main() -> None:
    init_db()
    print("Database migration completed.")


if __name__ == "__main__":
    main()

