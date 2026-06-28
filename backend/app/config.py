from __future__ import annotations

import os
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[2]
BACKEND_DIR = ROOT_DIR / "backend"
DATA_DIR = BACKEND_DIR / "data"
STATE_FILE = DATA_DIR / "app_state.json"
RUN_TRACE_FILE = DATA_DIR / "run_traces.jsonl"
EVAL_SET_FILE = ROOT_DIR / "eval" / "apple_eval_set.json"


class Settings:
    app_name = os.getenv("APP_NAME", "xiaguo-backend")
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8787"))
    api_prefix = os.getenv("API_PREFIX", "/api")
    provider = os.getenv("VISION_PROVIDER", "qwen")
    dashscope_api_key = os.getenv("DASHSCOPE_API_KEY", "")
    dashscope_model = os.getenv("DASHSCOPE_MODEL", "qwen-vl-max")
    dashscope_base_url = os.getenv(
        "DASHSCOPE_BASE_URL",
        "https://dashscope.aliyuncs.com/compatible-mode/v1",
    )
    contract_version = os.getenv("AGENT_CONTRACT_VERSION", "apple-grading-v1")
    prompt_version = os.getenv("AGENT_PROMPT_VERSION", "v0.1")
    rule_version = os.getenv("APPLE_RULE_VERSION", "apple-rule-v0.1")
    database_url = os.getenv("DATABASE_URL", f"sqlite:///{(DATA_DIR / 'app.db').as_posix()}")
    access_token_ttl_hours = int(os.getenv("ACCESS_TOKEN_TTL_HOURS", "8"))
    refresh_token_ttl_days = int(os.getenv("REFRESH_TOKEN_TTL_DAYS", "30"))
    password_pepper = os.getenv("PASSWORD_PEPPER", "xiaguo-dev-pepper")


settings = Settings()
