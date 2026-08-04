# Web Architecture — `deck-builder-web`

Next.js 15 (App Router) + React 19 + Turbopack, Tailwind CSS 4, Zustand 5, React
Query. Port 3000. Talks to the API through a **generated** client. For the
cross-app picture see the [root ARCHITECTURE.md](../../ARCHITECTURE.md).

## Directory layout

```
src/
├── app/                    App Router entrypoints (thin)
│   ├── layout.tsx          root layout + QueryProvider
│   ├── page.tsx            landing / home
│   └── cards/page.tsx      /cards → <Suspense><CardsFinder/></Suspense>
├── generated/              orval output — DO NOT EDIT BY HAND
│   ├── api/                React Query hooks + fetch functions
│   └── model/              TS types mirrored from the API's OpenAPI schema
├── lib/
│   └── api-fetcher.ts      fetch wrapper orval calls (prefixes NEXT_PUBLIC_API_URL)
├── providers/
│   └── QueryProvider.tsx   React Query client
└── modules/<domain>/       feature code, split by responsibility
    ├── cards/              card grid, deck panel, deck store
    ├── filters/            filter UI, filter store, URL sync
    ├── landing/            marketing page sections
    └── common/             shared UI primitives + utils (incl. store helper)
```

## The module pattern

Each `modules/<domain>/` is split by responsibility, and this split is the main
convention to preserve:

- **`components/`** — pure presentational React. No stores, no data fetching;
  props in, JSX out. Each in its own folder with a colocated test.
- **`containers/`** — `'use client'` components that wire stores + hooks + data
  to the presentational components (e.g. `CardsFinder`).
- **`hooks/`** — Zustand stores and React Query data hooks (the "brains").
- **`utils/`** — pure domain helpers (`sortCards`, `formatCardType`, …).

Pages stay thin: `app/*` fetches nothing complex itself — it renders a container.

## Data fetching — never hand-write API types

All API access goes through the **orval-generated** client in `src/generated/`,
which is produced from the API's OpenAPI schema (see the root doc). Rules:

- Import request/response types from `@/generated/model` — never redeclare them.
- Wrap generated calls in a domain hook rather than calling them from components.
  The key example is **`useCardsInfinite`**: an infinite React Query over
  `cardsControllerFindAll`, `PAGE_SIZE = 30`, computing `getNextPageParam` from
  loaded-vs-total, and **debouncing the `q` search param by 400ms** so typing
  doesn't fire a request per keystroke.
- `lib/api-fetcher.ts` is the low-level fetch orval is configured to use; it
  prefixes `NEXT_PUBLIC_API_URL` and normalizes the `{ data, status, headers }` shape.

After any API change, regenerate the client (root doc / CLAUDE.md) — do not patch
`src/generated/` by hand.

## State: Zustand stores

Two stores carry app state; both use the `createSelectors` helper
(`modules/common/utils/store.ts`), which auto-generates per-key selector hooks as
`store.use.<key>()`. **Use this pattern for every new store.**

### `useFilterStore` (`modules/filters/hooks/useFilterStore/`)

Holds all active filters (search, card/frame types, attributes, races, ranges,
boolean properties, link markers, sort). Two responsibilities beyond storage:

- **Derived-state rules.** Selecting a monster-only facet (attribute, race,
  level/atk/def range, tuner, a link marker, …) auto-applies the `MONSTER` card
  type — but only if the user hasn't already chosen a card type explicitly.
  Link markers additionally imply the `LINK` frame type and derive a min level
  from the marker count. Spell/Trap sub-types imply their card type. These rules
  live in the store, not the components — that's why the store has real logic and
  a substantial test suite.
- **`toQueryParams()`** maps store state → the generated `CardsControllerFindAllParams`
  type, the single point where UI state becomes an API query.

### `useDeckStore` (`modules/cards/hooks/useDeckStore/`)

The deck under construction, **persisted to localStorage** (`zustand/middleware`
`persist`, key `deck-builder-drafts`, versioned). Supports multiple named drafts
with an active draft. Enforces Yu-Gi-Oh! copy limits via `maxCopies` derived from
the card's TCG ban status (Forbidden 0 / Limited 1 / Semi 2 / else 3). No server
round-trip — decks are entirely client-side today.

## Filter ↔ URL sync

`useFilterSync` (called once in `CardsFinder`) is a `useEffect` bridge between
`useFilterStore` and the URL search params, so filter state is shareable and
survives reload. Note it **writes repeated params** (`attribute=A&attribute=B`),
whereas the generated client comma-joins them — the API tolerates both (see the
root doc's "sharp edge"). Keep `toURLParams` in sync with the store's fields when
adding a filter.

## Testing

- **Vitest + React Testing Library** for unit/component tests (`yarn test`),
  colocated as `*.test.ts(x)`. Store logic (especially the filter derivation
  rules) has the densest coverage — read those specs for intended behavior.
- **Playwright** for e2e in `e2e/*.spec.ts` (`yarn e2e`, auto-starts the dev
  server). Per repo policy, don't run Playwright unless explicitly asked.
