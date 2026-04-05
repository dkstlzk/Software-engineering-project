# Backend Modular Architecture

This directory is the backend composition root organized by feature modules.

## Goal

Move runtime wiring away from layer-based registration (`routes`, `services`) into a feature-first structure where each module owns its API mount contract.

## Module Contract

Each feature exports an `ApiModule`:

- `key`: stable module identifier
- `basePath`: API base path mounted under `/api`
- `router`: Express router for the feature

## Bootstrap Flow

1. `server.ts` initializes infrastructure middleware.
2. `registerModules(app, apiModules)` mounts all feature modules from `modules/index.ts`.
3. Health and global error handler remain infrastructure concerns.

## Migration Strategy

The backend migration is complete for runtime routing and core feature ownership:

1. Feature routers are mounted via module registry in `server.ts`.
2. Top-level `src/routes` and `src/services` have been retired.
3. Controllers and domain services now live under their owning feature modules.

Remaining improvements are optional and incremental (for example, introducing explicit module facades to reduce cross-module import coupling).
