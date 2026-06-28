# Xiaguo Stack Run Guide

## Quick Start

```bash
npm install
npm start
```

`npm start` now launches:

- FastAPI backend on `http://127.0.0.1:8787`
- Node proxy/static server on `http://127.0.0.1:3000`

## Other Commands

```bash
npm run start:backend
npm run start:proxy
npm run migrate:backend
npm run seed:backend
```

## Environment

- `DATABASE_URL` defaults to local SQLite
- `XIAGUO_BACKEND_URL` can point the proxy to another backend instance
- `PORT` controls the proxy port, default `3000`
- `BACKEND_PORT` controls the backend port for the launcher, default `8787`

