# URAS — Unified Room Allocation System

A full-stack web application for managing buildings, rooms, equipment, allocations, and booking policies at **IIT Jodhpur**.

> Built with **Node.js + Express** (backend) and **React + Material UI** (frontend), backed by **PostgreSQL**.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database Setup](#database-setup)
- [Running the App](#running-the-app)
- [API Endpoints](#api-endpoints)
- [Role Permissions](#role-permissions)
- [Booking Policies](#booking-policies)
- [Security](#security)
- [Authors](#authors)
- [License](#license)

---

## Features

| Area | Details |
|------|---------|
| **Authentication** | JWT access + refresh tokens, bcrypt password hashing, account lockout after failed attempts |
| **RBAC** | Four roles — Admin, Staff, Faculty, Student — with granular per-resource permissions |
| **Building Explorer** | Central hub: drill down from buildings → rooms → equipment, all CRUD in-line |
| **Room Management** | Floor-aware (0 … floors-1), type categorisation (classroom, lab, lecture hall, …), capacity, amenity flags |
| **Equipment Inventory** | Full lifecycle tracking — serial number, purchase date, warranty, maintenance schedule, status |
| **Allocations & Bookings** | Conflict detection, multi-tier approval workflow, role-based limits |
| **Allocation Policies** | Configurable per role: max duration, advance days, notice period, approval chain |
| **Audit Logging** | Every critical mutation is logged with actor, resource, and timestamp |
| **Responsive Frontend** | MUI 7 dark-sidebar design, role-filtered navigation, toast notifications |

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Node.js 18+, Express 4, pg (node-postgres) |
| Frontend | React 18, Vite 5, MUI 7, React Router 6, Axios |
| Database | PostgreSQL 14+ |
| Auth | JSON Web Tokens (jsonwebtoken), bcryptjs |
| Security | helmet, express-rate-limit, express-validator |
| Logging | winston |

---

## Project Structure

```
├── .env.example            # Backend env template
├── .gitignore
├── package.json            # Backend dependencies & scripts
├── src/
│   ├── app.js              # Express entry point
│   ├── config/
│   │   ├── index.js        # Env-based config loader
│   │   ├── database.js     # PG connection pool
│   │   ├── migrate.js      # Schema migrations
│   │   └── seed.js         # Default data seeder
│   ├── controllers/        # Request handlers
│   ├── middleware/          # auth, rbac, validation
│   ├── routes/             # Express routers
│   ├── services/           # Business logic
│   └── utils/              # logger, errorHandler
├── frontend/
│   ├── .env.example        # Frontend env template
│   ├── package.json
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx
│       ├── app/            # routes, navigation, theme
│       ├── components/     # layout, common UI
│       ├── features/       # auth, dashboard, entities
│       ├── services/       # API client & resource helpers
│       └── utils/          # storage helpers
├── tests/
└── docs/
```

---

## Prerequisites

| Requirement | Version |
|-------------|---------|
| Node.js | ≥ 18.0.0 |
| npm | ≥ 9 |
| PostgreSQL | ≥ 14 |

---

## Getting Started

```bash
# 1. Clone
git clone <repo-url>
cd unified-room-allocation-system

# 2. Install backend dependencies
npm install

# 3. Install frontend dependencies
cd frontend && npm install && cd ..

# 4. Copy environment files
cp .env.example .env
cp frontend/.env.example frontend/.env

# 5. Edit .env with your Postgres credentials & a strong JWT secret
#    (see "Environment Variables" below)

# 6. Create the database
psql -U postgres -c "CREATE DATABASE room_allocation_db;"

# 7. Run migrations
npm run db:migrate

# 8. Seed default data (admin user, roles, time-slots, policies)
npm run db:seed
```

---

## Environment Variables

### Backend (`.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | `development` / `production` |
| `PORT` | `3000` | HTTP listen port |
| `DB_HOST` | `localhost` | PostgreSQL host |
| `DB_PORT` | `5432` | PostgreSQL port |
| `DB_NAME` | `room_allocation_db` | Database name |
| `DB_USER` | `postgres` | Database user |
| `DB_PASSWORD` | — | Database password (**required**) |
| `JWT_SECRET` | — | Signing key for tokens (**required in production**) |
| `JWT_EXPIRES_IN` | `24h` | Access token TTL |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token TTL |
| `BCRYPT_SALT_ROUNDS` | `12` | Password hash cost |
| `RATE_LIMIT_WINDOW_MS` | `900000` | Rate limit window (15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | `1000` | Max requests per window |
| `LOG_LEVEL` | `info` | Winston log level |

### Frontend (`frontend/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `http://localhost:3000/api` | Backend API URL |

---

## Database Setup

The migration script (`npm run db:migrate`) creates all tables, enums, indexes, and triggers automatically.

**Key tables:** `roles`, `departments`, `users`, `buildings`, `rooms`, `room_inventory`, `slots`, `room_allocations`, `booking_requests`, `notifications`, `audit_logs`, `allocation_policies`

After migration, run `npm run db:seed` to create:
- Four roles (admin, staff, faculty, student)
- Default admin user
- Default building
- Time slots
- Default allocation policies

### Default Admin Credentials

| Field | Value |
|-------|-------|
| Email | `admin@iitj.ac.in` |
| Password | `Admin@123!` |

> **Change the password immediately after first login.**

---

## Running the App

### Development

```bash
# Terminal 1 — Backend (auto-restarts with nodemon)
npm run dev

# Terminal 2 — Frontend (Vite HMR)
cd frontend
npm run dev
```

Backend: `http://localhost:3000/api`  
Frontend: `http://localhost:5173`

### Production

```bash
# Backend
NODE_ENV=production npm start

# Frontend — build static assets
cd frontend
npm run build          # outputs to frontend/dist/
npm run preview        # local preview of production build
```

Serve `frontend/dist/` with Nginx, Caddy, or any static host.  
Point `VITE_API_BASE_URL` at your production API before building.

---

## API Endpoints

### Auth

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Register new user |
| `POST` | `/api/auth/login` | Login (returns JWT) |
| `POST` | `/api/auth/logout` | Logout (invalidate token) |
| `POST` | `/api/auth/refresh` | Refresh access token |
| `GET` | `/api/auth/me` | Current user profile |

### Buildings

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/buildings` | List all buildings |
| `POST` | `/api/buildings` | Create building |
| `GET` | `/api/buildings/:id` | Get building by ID |
| `PUT` | `/api/buildings/:id` | Update building |
| `DELETE` | `/api/buildings/:id` | Soft-delete building |
| `GET` | `/api/buildings/:id/rooms` | List rooms in a building |

### Rooms

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/rooms` | List all rooms |
| `POST` | `/api/rooms` | Create room |
| `GET` | `/api/rooms/:id` | Get room by ID |
| `PUT` | `/api/rooms/:id` | Update room |
| `DELETE` | `/api/rooms/:id` | Delete room |
| `GET` | `/api/rooms/:id/availability` | Check availability |

### Inventory

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/rooms/:roomId/inventory` | List room equipment |
| `POST` | `/api/rooms/:roomId/inventory` | Add equipment item |
| `PUT` | `/api/inventory/:id` | Update equipment |
| `DELETE` | `/api/inventory/:id` | Delete equipment |

### Departments

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/departments` | List departments |
| `POST` | `/api/departments` | Create department |
| `GET` | `/api/departments/:id` | Get department |
| `PUT` | `/api/departments/:id` | Update department |
| `DELETE` | `/api/departments/:id` | Delete department |

### Allocations & Bookings

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/allocations` | List allocations |
| `POST` | `/api/allocations` | Create allocation |
| `GET` | `/api/allocations/:id` | Get allocation |
| `PUT` | `/api/allocations/:id` | Update allocation |
| `DELETE` | `/api/allocations/:id` | Cancel allocation |
| `GET` | `/api/allocations/policies/all` | List all policies |
| `PUT` | `/api/allocations/policies/:role` | Update policy for role |

### Users (Admin only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/users` | List users |
| `POST` | `/api/users` | Create user |
| `PUT` | `/api/users/:id` | Update user |
| `DELETE` | `/api/users/:id` | Delete user |

### Utility

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Health check |
| `GET` | `/api/` | API version info |

---

## Role Permissions

| Resource | Action | Admin | Staff | Faculty | Student |
|----------|--------|:-----:|:-----:|:-------:|:-------:|
| Users | CRUD | ✓ | — | — | — |
| Departments | Create/Update/Delete | ✓ | — | — | — |
| Departments | Read | ✓ | ✓ | ✓ | ✓ |
| Buildings | CRUD | ✓ | — | — | — |
| Buildings | Read | ✓ | ✓ | ✓ | ✓ |
| Rooms | Create/Update | ✓ | ✓ | — | — |
| Rooms | Delete | ✓ | — | — | — |
| Rooms | Read | ✓ | ✓ | ✓ | ✓ |
| Inventory | CRUD | ✓ | ✓ | — | — |
| Inventory | Read | ✓ | ✓ | ✓ | ✓ |
| Allocations | CRUD | ✓ | ✓ | — | — |
| Allocations | Read | ✓ | ✓ | ✓ | ✓ |
| Bookings | Create | ✓ | ✓ | ✓ | ✓ |
| Bookings | Approve | ✓ | ✓ | — | — |
| Policies | Manage | ✓ | — | — | — |

---

## Booking Policies

| Policy | Admin | Staff | Faculty | Student |
|--------|:-----:|:-----:|:-------:|:-------:|
| Max Duration | 24 h | 12 h | 8 h | 4 h |
| Max Advance Days | 365 | 180 | 90 | 30 |
| Min Notice Hours | 0 | 0 | 2 | 24 |
| Approval Required | None | None | Staff | Faculty → Staff |

Policies are configurable at runtime via the **Policies** page (admin only).

---

## Security

- **JWT** access + refresh token pair; tokens stored in localStorage
- **bcrypt** (12 rounds) for password hashing
- **helmet** sets secure HTTP headers
- **express-rate-limit** — 1000 req / 15 min (general), 20 req / 15 min (auth)
- **express-validator** for input sanitisation
- **Audit logs** for all create/update/delete operations
- **Account lockout** after repeated failed logins

---

## Authors

**Team** — Aryan, Anshika, Suparn, Rewant  
Indian Institute of Technology Jodhpur

## License

MIT
