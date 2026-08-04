# API Architecture — `deck-builder-api`

NestJS 10 REST API (port 3001) serving Yu-Gi-Oh! card data from PostgreSQL via
Prisma 7. For the cross-app picture see the [root ARCHITECTURE.md](../../ARCHITECTURE.md).

## Module layout

```
src/
├── main.ts               bootstrap: global ValidationPipe, CORS, Swagger at /api-docs
├── app.module.ts         root: ConfigModule (global) + PrismaModule + CardsModule
├── prisma/               PrismaModule (@Global) + PrismaService
├── cards/                the one feature module today
│   ├── cards.controller.ts   GET /cards
│   ├── cards.service.ts      query building + Prisma access
│   └── dto/                   request DTO + response DTOs
└── common/
    └── transforms.ts     reusable class-transformer helpers (toArray, toBoolean)

prisma/
├── schema.prisma         model + enums; client output → generated/prisma (NOT node_modules)
├── migrations/
└── seed.ts, seeds/       one-time import from the YGOProDeck API
```

Feature modules follow standard Nest layering: **controller** (HTTP + validation)
→ **service** (business logic + data access). Add new domains as sibling modules
under `src/<domain>/` and register them in `app.module.ts`.

## Request flow

```
HTTP GET /cards?...  →  ValidationPipe (whitelist + transform)
                     →  FindCardsDto        (validate + coerce query params)
                     →  CardsController      (thin: delegates to service)
                     →  CardsService.findAll (buildWhere → Prisma findMany + count)
                     →  PrismaService        (PrismaClient + pg driver adapter)
                     →  PostgreSQL
```

The global `ValidationPipe` runs with `whitelist: true` (strips unknown props)
and `transform: true` (activates `@Type`/`@Transform` coercion). Every query
param arrives as a string, so DTOs must declare coercion explicitly.

## The DTO is the contract

`dto/find-cards.dto.ts` is the most load-bearing file here: it's both the input
validator **and** the source (via Swagger decorators) of the web app's generated
query types. Three param families, each with its own coercion recipe:

- **Multi-value filters** (`attribute`, `race`, `cardType`, `frameType`, …):
  `@Transform(toArray)` + `@IsString/@IsEnum({ each: true })`. `toArray` tolerates
  scalar, repeated, and comma-joined forms — see the root doc's "sharp edge" note.
- **Booleans** (`isTuner`, `isPendulum`, `linkMarkerStrict`, …): `@Transform(toBoolean)`.
- **Numbers / ranges** (`atkMin/Max`, `levelMin/Max`, `skip`, `take`):
  `@Type(() => Number)` + `@IsInt`/`@Min`/`@Max`.

Keep `@ApiPropertyOptional` (with `enum`/`isArray`) accurate — it's what orval
reads to generate the web types.

## Query building (`CardsService.buildWhere`)

Filters are assembled into a single `Prisma.CardWhereInput`. Conventions worth
knowing before editing:

- **Empty arrays are ignored** (`dto.x?.length` guard) — an empty multi-select
  must not filter anything out.
- **Text search `q`** is tokenized on whitespace; **every** token must match
  name *or* description (AND of ORs), so word order doesn't matter. `name` and
  `archetype` are separate single-field `contains` filters.
- **Level/Rank/Link is unified**: the range matches `level` OR `linkVal`, because
  Link monsters store their rating in `linkVal`, not `level`.
- **Link markers**: `hasEvery` for "has at least these"; when `linkMarkerStrict`,
  a complementary `NOT hasSome (all other markers)` narrows it to "exactly these".
  The full marker set lives in `cards/link-markers.constant.ts`.
- **Sort**: `newest` orders by `tcgDate desc nulls last, id desc`; default is
  `name asc`.

Response shape is `{ results, pagination: { total, skip, take } }` — `findMany`
and `count` run in parallel over the same `where`.

## Prisma setup

- **Generated client lives in `generated/prisma/`, not `node_modules`** — import
  it as `'../../generated/prisma/client'` (and `.../enums`). Run `yarn db:generate`
  after schema changes.
- `PrismaService` extends `PrismaClient`, wired to the **pg driver adapter**
  (`prisma/prisma-adapter.factory.ts`, reads `DATABASE_URL`), and manages
  connect/disconnect via `OnModuleInit`/`OnModuleDestroy`.
- `PrismaModule` is `@Global`, so services inject `PrismaService` without importing it.

## Testing

Jest. Controller and service specs (`*.spec.ts`) mock their dependencies —
service specs assert the exact `where` produced by `buildWhere` for each filter,
which is the best reference for the intended query semantics. e2e config lives in
`test/jest-e2e.json` (`yarn test:e2e`).
