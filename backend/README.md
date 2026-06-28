# Xiaguo backend scaffold

This folder holds the new FastAPI-based backend scaffold that matches the rewrite roadmap.

Current scope:

- `/api/health`
- `/api/grade`
- `/api/products`
- `/api/reviews`
- `/api/feedback`
- `/api/bad-cases`
- `/api/evals/run`
- `/api/traces`
- `/api/state`

Local run:

```bash
pip install -r backend/requirements.txt
uvicorn backend.app.main:app --host 0.0.0.0 --port 8787
```

Utility commands:

```bash
python backend/scripts/init_db.py
python backend/scripts/migrate_db.py
python backend/scripts/seed_demo_data.py
```

By default the app uses the local SQLite file at `backend/data/app.db` so the code can run immediately on a clean machine.

To switch to PostgreSQL, set `DATABASE_URL`, for example:

```bash
set DATABASE_URL=postgresql+psycopg://user:password@host:5432/xiaguo
```

The first start will also migrate legacy JSON state and trace files into the database if they still exist.

The legacy Node server is still kept at `server.js` as a compatibility fallback while the new backend is phased in.

Docker:

```bash
docker compose up --build
```

This starts PostgreSQL and the FastAPI backend together.
