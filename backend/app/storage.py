from __future__ import annotations

from pathlib import Path
from typing import Any

import json

from .repository import append_trace, ensure_data_store, read_recent_traces, read_state, upsert_by_id, write_state


def write_json_artifact(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
