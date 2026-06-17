import { defineConfig } from 'orval';

export default defineConfig({
  deckBuilderApi: {
    input: {
      target: './apps/deck-builder-api/openapi.json',
    },
    output: {
      mode: 'tags-split',
      target: './apps/deck-builder-web/src/generated/api',
      schemas: './apps/deck-builder-web/src/generated/model',
      client: 'react-query',
      override: {
        mutator: {
          path: './apps/deck-builder-web/src/lib/api-fetcher.ts',
          name: 'apiFetcher',
        },
      },
    },
  },
});
