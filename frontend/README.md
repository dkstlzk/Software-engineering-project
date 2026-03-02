# URAS Frontend

React 18 + Material UI 7 single-page application for the Unified Room Allocation System.

## Quick Start

```bash
cp .env.example .env        # set VITE_API_BASE_URL
npm install
npm run dev                  # http://localhost:5173
```

## Build for Production

```bash
npm run build                # outputs to dist/
npm run preview              # local production preview
```

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `http://localhost:3000/api` | Backend API base URL |

## Key Pages

| Route | Component | Access |
|-------|-----------|--------|
| `/` | Dashboard | All roles |
| `/explorer` | Building Explorer (buildings → rooms → equipment CRUD) | All roles (write: admin/staff) |
| `/allocations` | Allocations & Bookings | All roles |
| `/policies` | Allocation Policies | Admin only |

## Stack

- **React 18** with Vite 5 (HMR, ESM)
- **MUI 7** — custom dark-sidebar theme (`#0F2940` sidebar, `#1E3A5F` primary, `#0D9488` secondary)
- **React Router 6** — role-based route guards (`ProtectedRoute`, `RoleRoute`)
- **Axios** — API client with JWT interceptor (auto refresh)
- **dayjs** — date handling
