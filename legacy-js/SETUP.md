# How to Run — URAS

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 18 |
| npm | ≥ 9 |
| PostgreSQL | ≥ 14 |

---

## 1. Clone & Install

```bash
git clone <repo-url>
cd unified-room-allocation-system

# Backend
npm install

# Frontend
cd frontend && npm install && cd ..
```

---

## 2. Environment Setup

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env
```

Edit **`.env`** with your values:

```dotenv
DB_HOST=localhost
DB_PORT=5432
DB_NAME=room_allocation_db
DB_USER=postgres
DB_PASSWORD=<your-password>
JWT_SECRET=<a-long-random-string>
```

Edit **`frontend/.env`** (only needed if the backend runs on a different host/port):

```dotenv
VITE_API_BASE_URL=http://localhost:3000/api
```

---

## 3. Database

```bash
# Create the database
psql -U postgres -c "CREATE DATABASE room_allocation_db;"

# Run migrations (creates tables, enums, indexes)
npm run db:migrate

# Seed default data (roles, admin user, time-slots, policies)
npm run db:seed
```

After seeding, the default admin account is:

| | |
|-|-|
| **Email** | `admin@iitj.ac.in` |
| **Password** | `Admin@123!` |

> Change the password after first login.

---

## 4. Run in Development

Open **two terminals**:

```bash
# Terminal 1 — Backend (port 3000, auto-restarts on changes)
npm run dev
```

```bash
# Terminal 2 — Frontend (port 5173, hot-reload)
cd frontend
npm run dev
```

Then open **http://localhost:5173** in your browser.

---

## 5. Run in Production

### Backend

```bash
NODE_ENV=production npm start
```

### Frontend

```bash
cd frontend
npm run build      # outputs static files to frontend/dist/
npm run preview    # (optional) local preview of the build
```

Serve `frontend/dist/` with any static file server (Nginx, Caddy, etc.).  
Set `VITE_API_BASE_URL` to your production API URL **before** building.

---

## Available Scripts

### Backend (`package.json`)

| Script | Command | Description |
|--------|---------|-------------|
| `npm start` | `node src/app.js` | Start server |
| `npm run dev` | `nodemon src/app.js` | Start with auto-reload |
| `npm run db:migrate` | `node src/config/migrate.js` | Run DB migrations |
| `npm run db:seed` | `node src/config/seed.js` | Seed default data |
| `npm test` | `jest --coverage` | Run tests |

### Frontend (`frontend/package.json`)

| Script | Command | Description |
|--------|---------|-------------|
| `npm run dev` | `vite` | Dev server with HMR |
| `npm run build` | `vite build` | Production build |
| `npm run preview` | `vite preview` | Preview production build |

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| `ECONNREFUSED` on DB | Make sure PostgreSQL is running and credentials in `.env` are correct |
| Port 3000 in use | Change `PORT` in `.env` |
| Port 5173 in use | Run `npx vite --port 3001` in `frontend/` |
| `relation does not exist` | Run `npm run db:migrate` first |
| Login fails | Run `npm run db:seed` to create the admin account |
