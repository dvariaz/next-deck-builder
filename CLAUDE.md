# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Tech Stack

| Layer       | Technology                                              |
| ----------- | ------------------------------------------------------- |
| Monorepo    | Yarn 1.x workspaces + Turborepo                         |
| Language    | TypeScript 5 (both apps)                                |
| API runtime | NestJS 10, Node ≥20                                     |
| ORM         | Prisma 7 with `@prisma/adapter-pg` (pg driver adapter)  |
| Database    | PostgreSQL 16 (Docker)                                  |
| Frontend    | Next.js 15 (App Router) + React 19 + Turbopack          |
| Styling     | Tailwind CSS 4                                          |
| State       | Zustand 5                                               |
| API testing | Jest (API unit + e2e)                                   |
| Web testing | Vitest + React Testing Library (unit), Playwright (e2e) |

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

yarn psct:parse           # Parse card text into CardEffectParse (Chevrotain pipeline)
yarn psct:parse:force     # Re-parse everything, including non-`rules` rows
yarn psct:metrics         # Coverage over the live pool, with failure shapes
yarn psct:metrics --why-modifier   # Decompose the dominant failure family by cause
```

### Web-specific

```bash
cd apps/deck-builder-web

yarn dev                  # Next.js + Turbopack
yarn test                 # Vitest (single run)
yarn test:watch           # Vitest watch mode
yarn e2e                  # Playwright e2e tests (auto-starts the dev server)
yarn e2e:ui               # Playwright e2e tests in UI mode
yarn generate             # Regenerate the orval API client from openapi.json
```

#### e2e tests (Playwright)

e2e specs live in `apps/deck-builder-web/e2e/*.spec.ts`, configured via `playwright.config.ts` (Chromium only, `baseURL` `http://localhost:3000`). `webServer` runs `yarn dev` automatically and reuses an already-running dev server outside CI, so no manual setup is needed before `yarn e2e`. Reports/artifacts land in `playwright-report/` and `test-results/` (gitignored).

#### Regenerating the API client

The web app talks to the API through an **orval-generated** React Query client in `src/generated/` (`api/` + `model/`). It is generated from `apps/deck-builder-api/openapi.json`, which is the running API's Swagger JSON. After changing any API DTO/controller, regenerate so the web types match:

```bash
# 1. API must be running (NestJS watch mode picks up source changes automatically)
cd apps/deck-builder-api && yarn spec:export   # curls /api-docs-json -> openapi.json
cd apps/deck-builder-web  && yarn generate      # orval --config ../../orval.config.ts
```

orval does **not** clean up renamed/removed schemas — it leaves stale, un-exported files on disk (e.g. when an enum query param `Foo` becomes an array it emits `FooItem` and leaves the old `Foo.ts`). Delete the stale files manually after regenerating.

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
- `psct-parser/` — the card-effect-text parser (Chevrotain). Nine independently testable stages (normalize → lex → structure → grammar → visitor → references → classify → validate), a typed AST in `ast.ts`, and **source spans that point at the original printed text**. Also framework-free. Unlike the older parser it records uncertainty explicitly: typed `Diagnostic`s with a closed code vocabulary, a derived `confidence`, and Zod validation at the persistence boundary. Writes to the `CardEffectParse` / `CardEffectDiagnostic` tables, keyed by `(cardId, parserVersion)` so a grammar change can be compared and rolled back. See `src/psct-parser/README.md`.

- `card-effects/` — the first consumer of the parsed IR. `filter-to-where.ts` turns a `CardFilter` into a Prisma `where` (kept here rather than in the parser package, so that package keeps its no-Prisma property); `GET /cards/:id/effects` exposes the IR and `GET /cards/:id/fetches` exposes what each **resolved** search action can actually reach.

Prisma schema lives in `prisma/schema.prisma`. The generated client is output to `generated/prisma/` (not `node_modules`), so import it as `'../../generated/prisma/client'`. The `PrismaPg` driver adapter is instantiated in `prisma/prisma-adapter.factory.ts` using `DATABASE_URL`.

Database seeding (`prisma/seed.ts`) pulls card data from the YGOProDeck API via seeders in `prisma/seeds/`.

`Card.parsedEffects` holds the structured IR, written by `yarn psct:parse` at seed time and after a parser upgrade, and served as a plain column — so **no parsing ever happens at read time** and `/cards` needs no join. `CardEffectParse` / `CardEffectDiagnostic` are the version-keyed history and the queryable review queue.

`parsedEffects` is deliberately **parser-agnostic** — the stored object carries its own metadata, so adding a parser needs no schema change:

| Field           | Meaning                                                                                                                                                                                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `format`        | What the TEXT is: `psct` or `legacy`. **Select on this to route cards to a different parser.** Roughly 11.1k psct / 3.4k legacy — query it rather than trusting a figure here, since it shifts whenever the parser's diagnostics change: `SELECT "parsedEffects"->>'format', count(*) FROM "Card" GROUP BY 1;` |
| `origin`        | Which parser produced it: `rules` \| `llm` \| `manual`. The batch script will not overwrite a non-`rules` row without `--force`.                                                                                                                                                                               |
| `parserVersion` | Which revision of that parser.                                                                                                                                                                                                                                                                                 |
| `parsedAt`      | When. There is no separate timestamp column; it lives in the object.                                                                                                                                                                                                                                           |

These are three different questions and are kept apart on purpose: collapsing them would make "re-parse the legacy cards with the LLM" unanswerable. `format` is derived from evidence the parser actually hit (a comma-recovered condition, or an un-errata'd "select"), never assumed.

Bump `PARSER_VERSION` (`src/psct-parser/ast.ts`) whenever a parser change makes persisted rows wrong OR materially changes coverage — it is the only mechanism that forces regeneration, since the staleness check compares card TEXT, not parser behaviour. The stored object carries an `origin` the batch script will not overwrite unless `--force` is passed, so a manual or LLM pass cannot be clobbered by a re-parse. A reseed wipes the column, since the seeder deletes and recreates every row.

> `card-effect-parser/`, the original regex-based parser, was **deleted on 2026-10-14** once `psct-parser` overtook it on per-card search reachability (6,661 cards to 6,338). That retirement deliberately gave up **472 cards** whose reachability only the old parser resolved; the list was captured first and is the best work queue for this parser — see `src/psct-parser/README.md` for the breakdown. The per-card list lives in a local analysis artifact outside this repo (`psct-gap-analysis-2026-10-14/lost-on-retirement.json`), so ask the author for it rather than looking for it in the tree.

### Web (`deck-builder-web`)

Next.js App Router. Source is organized into:

- `src/app/` — Next.js pages/layouts. Pages are thin: they fetch via the repository layer and pass data to client containers.
- `src/modules/<domain>/` — Feature modules (currently `cards`, `filters`, `common`):
  - `components/` — Pure presentational React components
  - `containers/` — Client components that wire state + components together
  - `hooks/` — Zustand stores and React Query data hooks (e.g. `useFilterStore`, `useCardsInfinite`)
  - `utils/` — Domain helpers (e.g. `sortCards`, `formatCardType`)

**State management:** Zustand with a `createSelectors` utility (`modules/common/utils/store.ts`) that auto-generates per-key selectors as `store.use.<key>()` — use this pattern for all new stores.

**API calls:** Data fetching goes through the orval-generated React Query client (`src/generated/api/`), typically wrapped in a hook such as `useCardsInfinite`. Filter state lives in `useFilterStore`; `toQueryParams()` maps it to the generated `*Params` type, and `useFilterSync` mirrors it to the URL. See `#### Regenerating the API client` for the generation workflow.

> **Array query params:** the generated URL builder serializes arrays with `String(value)`, producing a comma-joined value (`attribute=DARK,LIGHT`) rather than repeated params. `useFilterSync`, however, writes repeated params (`attribute=DARK&attribute=LIGHT`). So the API's `toArray` transform (`apps/deck-builder-api/src/common/transforms.ts`) accepts both: scalar, repeated, and comma-joined. New multi-value filters should pair `@Transform(toArray)` with `@IsEnum(X, { each: true })` / `@IsString({ each: true })`.

## Playwright / Visual Verification

- Do NOT run Playwright or the Playwright MCP automatically when building or
  modifying frontend components.
- Only run Playwright when explicitly instructed (e.g. "verify with Playwright",
  "run the visual test").
- After building a component, just let me know it's ready for visual verification
  if applicable, instead of running it yourself.
