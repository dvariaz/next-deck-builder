# Architecture

High-level map of the monorepo and the contract that ties the two apps together.
For app-internal detail see [`apps/deck-builder-api/ARCHITECTURE.md`](apps/deck-builder-api/ARCHITECTURE.md)
and [`apps/deck-builder-web/ARCHITECTURE.md`](apps/deck-builder-web/ARCHITECTURE.md).

## What this is

A Yu-Gi-Oh! card database + deck builder. A NestJS API serves filtered card
data from PostgreSQL; a Next.js frontend lets users search/filter cards and
assemble decks (persisted client-side).

## Shape of the repo

```
next-deck-builder/
├── apps/
│   ├── deck-builder-api/   NestJS REST API  (:3001) → PostgreSQL via Prisma
│   └── deck-builder-web/   Next.js frontend (:3000) → talks to the API
├── docker-compose.yml      postgres:16 (:5432, db "deckbuilder")
├── orval.config.ts         generates the web API client from the API's OpenAPI spec
└── turbo.json              task graph (build/dev/lint/test/generate)
```

Yarn 1.x workspaces + Turborepo. No shared `packages/` yet — if code needs to be
shared between the apps, that's where it goes.

## The contract between the apps (read this first)

The apps are **not** loosely coupled by hand-written types. The API's OpenAPI
schema is the single source of truth, and the web client is **generated** from it:

```
API DTOs/controllers  ──swagger──▶  openapi.json  ──orval──▶  web/src/generated/
   (hand-written)                   (exported)                (React Query client + TS types)
```

Concretely:

1. The API defines request/response shapes as class-validator DTOs
   (`apps/deck-builder-api/src/cards/dto/`) and exposes Swagger at `/api-docs`.
2. `yarn spec:export` (in the API) curls `/api-docs-json` → `openapi.json`.
3. `yarn generate` (in the web app) runs orval → regenerates
   `apps/deck-builder-web/src/generated/` (`api/` hooks + `model/` types).

**Implication:** the web app never defines card/query types by hand — it imports
them from `@/generated/model`. After any API DTO or controller change, regenerate
or the two sides drift. See the "Regenerating the API client" section in
[`CLAUDE.md`](CLAUDE.md) for the exact commands and the stale-file caveat.

### One sharp edge: array query params

The generated client serializes array params comma-joined (`attribute=DARK,LIGHT`),
but the web app's own URL-sync writes them repeated (`attribute=DARK&attribute=LIGHT`).
The API's `toArray` transform (`apps/deck-builder-api/src/common/transforms.ts`)
therefore accepts **both** shapes plus a bare scalar. Any new multi-value filter
must keep this three-way tolerance.

## Data provenance

Card data originates from the external **YGOProDeck API** and is pulled into
Postgres once by the API's seeder (`prisma/seed.ts` → `prisma/seeds/`). At request
time the API reads only from its own database — it does not call YGOProDeck live.

## Runtime / env

| Service   | Port | Needs                                        |
|-----------|------|----------------------------------------------|
| Postgres  | 5432 | `docker-compose up -d`                        |
| API       | 3001 | `DATABASE_URL`                                |
| Web       | 3000 | `NEXT_PUBLIC_API_URL` (default `:3001`)       |

`yarn dev` at the root starts everything via Turborepo.
