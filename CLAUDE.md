# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Tech Stack

| Layer | Technology |
|---|---|
| Monorepo | Yarn 1.x workspaces + Turborepo |
| Language | TypeScript 5 (both apps) |
| API runtime | NestJS 10, Node ≥20 |
| ORM | Prisma 7 with `@prisma/adapter-pg` (pg driver adapter) |
| Database | PostgreSQL 16 (Docker) |
| Frontend | Next.js 15 (App Router) + React 19 + Turbopack |
| Styling | Tailwind CSS 4 |
| State | Zustand 5 |
| API testing | Jest (API unit + e2e) |
| Web testing | Vitest + React Testing Library (unit), Cypress (component/e2e) |

## Monorepo Structure

This is a Yarn workspaces + Turborepo monorepo with two apps:

- `apps/deck-builder-api` — NestJS REST API (port 3001), backed by PostgreSQL via Prisma
- `apps/deck-builder-web` — Next.js 15 frontend (port 3000) with Turbopack

No shared `packages/` exist yet.

## Commands

All commands run from the repo root via Turborepo unless you need to target a single app.

```bash
# Start everything in dev mode
yarn dev

# Build all apps
yarn build

# Lint all apps
yarn lint

# Format all TypeScript/Markdown
yarn format
```

### API-specific

```bash
cd apps/deck-builder-api

yarn dev                  # NestJS watch mode
yarn test                 # Jest unit tests
yarn test:watch           # Jest in watch mode
yarn test:e2e             # e2e tests (jest --config ./test/jest-e2e.json)
yarn test:cov             # Coverage report

yarn db:generate          # Regenerate Prisma client after schema changes
yarn db:migrate           # Run migrations (dev)
yarn db:push              # Push schema without migration file
yarn db:seed              # Seed DB from YGOProDeck API
```

### Web-specific

```bash
cd apps/deck-builder-web

yarn dev                  # Next.js + Turbopack
yarn test                 # Vitest (single run)
yarn test:watch           # Vitest watch mode
yarn cypress:open         # Cypress component/e2e tests
```

## Infrastructure

PostgreSQL runs in Docker:

```bash
docker-compose up -d      # Starts postgres:16 on port 5432, DB name: deckbuilder
```

The API requires `DATABASE_URL` in the environment. The web app requires `NEXT_PUBLIC_API_URL` pointing to the API (default `http://localhost:3001`).

## Architecture

### API (`deck-builder-api`)

NestJS module structure under `src/`:
- `prisma/` — `PrismaModule` (global) + `PrismaService` (wraps PrismaClient with `@prisma/adapter-pg`)
- `cards/` — `CardsModule` with controller (`GET /cards`) and service

Prisma schema lives in `prisma/schema.prisma`. The generated client is output to `generated/prisma/` (not `node_modules`), so import it as `'../../generated/prisma/client'`. The `PrismaPg` driver adapter is instantiated in `prisma/prisma-adapter.factory.ts` using `DATABASE_URL`.

Database seeding (`prisma/seed.ts`) pulls card data from the YGOProDeck API via seeders in `prisma/seeds/`.

### Web (`deck-builder-web`)

Next.js App Router. Source is organized into:

- `src/app/` — Next.js pages/layouts. Pages are thin: they fetch via the repository layer and pass data to client containers.
- `src/modules/<domain>/` — Feature modules (currently only `cards` and `common`):
  - `components/` — Pure presentational React components
  - `containers/` — Client components that wire state + components together
  - `hooks/` — Zustand stores (via `useFinderStore`)
  - `repositories/` — Data-fetching classes (e.g. `CardsRepository.search`)
  - `types/` — TypeScript interfaces for the domain

**State management:** Zustand with a `createSelectors` utility (`modules/common/utils/store.ts`) that auto-generates per-key selectors as `store.use.<key>()` — use this pattern for all new stores.

**API calls:** `CardsRepository` uses Next.js `fetch` with cache tags for ISR. The `SearchQueryBuilder` class converts a typed query object to a `URLSearchParams` string. API responses come back in snake_case and are camelized via `ts-case-convert`.
