This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## What is this application?

This is a knowledge base for Yu-Gi-Oh!, designed to help build better decks and refine gameplay strategies. The app works as an advanced card search engine with highly specialized filters.

The card catalog is sourced from the YGOProDeck public database (the most complete and up-to-date available), but instead of relying on their endpoints directly, the app builds and maintains its own local database to deliver faster searches, richer filters, and a user experience the original API cannot provide.

## What problem does it solve?

Existing YGO card search tools are too generic or too slow for the needs of a competitive player who requires quick answers and complex filter combinations. This app puts a dedicated tool in the player's hands — free from third-party limitations, and built exactly around how a deck is constructed and thought through.

## Getting Started

### Prerequisites

- Node ≥ 20
- Yarn 1.x (this is a Yarn workspaces monorepo)
- Docker, for PostgreSQL 16

### First-time setup

Run these in order. Steps 4 and 5 are both required — seeding only loads card
data, it does not parse it.

```bash
# 1. Install dependencies for both apps
yarn install

# 2. Configure the environment — THREE files, one per consumer.
#    Each app resolves .env relative to its own directory, so a single
#    root-level file is not enough.
cp .env.example .env                                   # POSTGRES_USER / PASSWORD (docker-compose)
cp apps/deck-builder-api/.env.example apps/deck-builder-api/.env   # DATABASE_URL
cp apps/deck-builder-web/.env.example apps/deck-builder-web/.env   # NEXT_PUBLIC_API_URL
#    Then edit the credentials. The user/password in the API's DATABASE_URL
#    must match the POSTGRES_* values in the root .env, because those are what
#    create the database user.

# 3. Start PostgreSQL (postgres:16 on port 5432, database "deckbuilder")
docker-compose up -d

# 4. Create the schema, then load the card catalogue from the YGOProDeck API.
#    The seed fetches ~14,500 cards over the network, so give it a few minutes.
cd apps/deck-builder-api
npx prisma migrate deploy
yarn db:seed

# 5. Parse every card's effect text into its structured form.
#    REQUIRED: `db:seed` deletes and recreates every Card row, which leaves
#    `Card.parsedEffects` empty. Until this runs, cards have no effects and
#    GET /cards/:id/effects returns 404.
yarn psct:parse
```

### Running it

```bash
yarn dev          # from the repo root: starts both apps via Turborepo
```

- Web: http://localhost:3000
- API: http://localhost:3001
- API docs (Swagger): http://localhost:3001/api-docs

### Things that will bite you

- **Re-seeding wipes the parsed effects.** Any time you run `yarn db:seed`, run
  `yarn psct:parse` after it.
- **If every API route returns 500**, check the database is up
  (`docker-compose up -d`) before suspecting the code. The API keeps listening
  when Postgres goes away, so the failure looks like an application bug.
- **After a schema change**, run `yarn db:generate` and restart the API dev
  server. A long-running `nest start --watch` can keep serving a stale compiled
  Prisma client, which surfaces as 500s on routes that select all columns while
  routes with an explicit `select` keep working.

See `CLAUDE.md` for the full command reference and architecture notes.

## Learn More

- `CLAUDE.md` — architecture, command reference, and the conventions this repo
  follows.
- `apps/deck-builder-api/src/psct-parser/README.md` — how card effect text is
  turned into structured data, and the traps involved.
