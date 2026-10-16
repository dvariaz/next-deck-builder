# PSCT effect parser

Turns a Yu-Gi-Oh card's printed effect text into a typed, span-preserving AST
that code can query — what the card does, what it can reach, what it costs,
what states it applies, and **which parts could not be interpreted**.

Built on [Chevrotain](https://chevrotain.io/): an explicit lexer and grammar
over Problem-Solving Card Text, treated as a constrained domain-specific
language rather than as natural language.

```ts
import { parseCard } from './psct-parser';

const parsed = parseCard(card.description, {
  archetypes, // SELECT DISTINCT archetype — ~650 values in the current pool
  races, // SELECT DISTINCT race      — ~27 values
  cardId: String(card.id),
  cardName: card.name,
  cardType: card.cardType, // decides classification; see below
  spellTrapSubType: card.spellTrapSubType ?? undefined,
});
```

`ast.ts` is the contract between the parser and every consumer. **Read that file
first** — it is the real documentation of the output shape, and every field
carries a comment explaining why it exists.

## Design principle

**An omitted fact is a missing feature; a wrong fact destroys trust in the whole
dataset.**

Every judgement call resolves that way. A noun phrase that cannot be pinned down
becomes `{ kind: 'unresolved' }` rather than a guess; genuinely ambiguous legacy
wording reports `legacy_select` rather than picking a side; a reference with no
findable antecedent keeps `resolvedTo: null` and earns a diagnostic. Consumers
filter on `action.resolved`, so a declined action costs a feature while a wrong
one costs credibility.

## Pipeline

Each stage is one file and independently testable. Source spans survive all of
them.

| Stage | File              | Job                                                                    |
| ----- | ----------------- | ---------------------------------------------------------------------- |
| 1     | `normalize.ts`    | Unicode/whitespace normalization **with an offset map back**           |
| 2+3   | `lexer.ts`        | Protected tokenization and lexing; vocabulary from `lexicon.ts`        |
| 4a    | `structure.ts`    | Blocks, sentences, and the `condition : activation ; resolution` split |
| 4b    | `grammar.ts`      | Chevrotain `CstParser` over the clause grammar                         |
| 5+6   | `visitor.ts`      | CST → semantic AST, and conjunction semantics                          |
| —     | `filters.ts`      | Noun phrases → queryable column constraints                            |
| —     | `conditions.ts`   | The condition leaf: timing, quick effect, exclusions                   |
| —     | `restrictions.ts` | Once-per-turn scopes, Summon conditions, non-effect sentences          |
| 7     | `references.ts`   | Pronoun resolution, as its own pass over the finished AST              |
| 8     | `classify.ts`     | Effect kind and `startsChain`, using card metadata                     |
| 9     | `schema.ts`       | Zod validation at the persistence boundary                             |
| —     | `confidence.ts`   | Derived scoring, for sorting the review queue                          |
| —     | `metrics.ts`      | Corpus metrics                                                         |
| —     | `corpus.ts`       | Loads the real-card fixtures in `corpus/*.json`                        |
| —     | `index.ts`        | The pipeline entry point                                               |

### Why a lexer earns its place

Two properties fall out of lexing that a text-level parser has to fight for:

**Protected constructs are just token types.** A quoted card name is one token,
so `"Number 39: Utopia"` cannot contribute a structural colon and `"D.D. Crow"`
cannot break sentence splitting. There is no masking pass and no mask-offset
bookkeeping — the entire class of false positive is structurally impossible
rather than defended against one regex at a time.

**Offsets come free.** Every token carries its position, so every AST node can
report a span. `normalize.ts` keeps a per-character map back to the original
text, so those spans point at **what was printed** — curly quotes and all — not
at the parser's cleaned-up copy.

### Why the grammar never sees a whole sentence

`structure.ts` splits on PSCT's own separators first:

```text
<condition> : <activation> ; <resolution>
```

That split is what keeps a trigger condition from ever becoming an action —
Sangan's "If this card is sent from the field to the GY:" contains both _sent_
and _GY_, but the action rules never see it — and what makes the cost/action
distinction positional, so One for One's "Send 1 monster from your hand to the
GY;" lands in `activation` rather than becoming a second search.

It also keeps the grammar free of backtracking: no rule has to decide whether a
leading clause is a condition or a resolution, because the separator already
decided.

The condition part has **no grammar rule** on purpose. It is free-form prose
describing an event, and imposing a grammar on it would invent structure the
text does not have; `conditions.ts` reads its ruling-relevant properties
directly and keeps the rest verbatim.

## Rulings the IR models

The parser is not a rules engine. It does record the places where Konami's
_wording_ maps onto a hard rule, because those change what a card can do.

### "When" vs "If" — missing the timing

An **optional** trigger effect opening with "When" may only activate if its
trigger was the last thing to happen. "If" carries no such restriction, and a
**mandatory** effect never misses the timing whatever the word — so this cannot
be read from the word alone.

```ts
{ timing: 'when', missesTiming: true }   // "When ...: you can ..."
{ timing: 'if',   missesTiming: false }  // "If ...: you can ..."
{ timing: 'when', missesTiming: false }  // "When ...: draw 1 card." (mandatory)
```

### "target" vs "choose" vs "select"

Targeting is a game action with its own rules: it can be blocked by targeting
protection, and the choice locks in at activation.

| `selection`     | Printed as            | Meaning                          |
| --------------- | --------------------- | -------------------------------- |
| `target`        | "target 1 monster"    | Explicitly targeting             |
| `choose`        | "choose 1 monster"    | Explicitly non-targeting         |
| `legacy_select` | "select 1 monster"    | Pre-errata; **undetermined**     |
| `none`          | no selection language | Applies to whatever it describes |

`legacy_select` stays its own value rather than folding into either side.
Konami's errata programme rewrote pre-2011 "select" into "target" or "choose"
case by case, and an un-errata'd card's printed text does not say which it
became — guessing would be wrong about half the time.

### Conjunctions are operators

| Conjunction     | Node                       | Dependency                             |
| --------------- | -------------------------- | -------------------------------------- |
| `then`          | `sequence`                 | Later action requires the earlier one  |
| `and if you do` | `parallel` + `conditional` | Explicitly conditional on success      |
| `also`          | `parallel`                 | Independent — do as much as possible   |
| `and`           | `parallel`                 | All-or-nothing; both strictly required |

`dependsOnPrevious` records the per-action consequence, so a consumer can tell
that an action behind `then` is a weaker claim about what the card reaches than
one behind `also`.

### Classification needs card metadata

Classifying on punctuation alone is wrong in both directions, which is why
`cardType` is required:

- Terraforming's "Add 1 Field Spell from your Deck to your hand." has no colon,
  yet it is `activated` and starts a Chain — every Spell and Trap does.
- Botanical Girl's pre-PSCT trigger has no colon either, so `startsChain` is
  reported as **`undefined` rather than `false`**. The clue is absent, not
  negative; `false` there would be a wrong fact rather than a missing one.

### Actions vs modifiers

`actions` are discrete things that happen on resolution. `modifiers` are
continuous **states** — "gains 500 ATK", "cannot be destroyed by battle" — which
have no moment at which they happen. Forcing a modifier through `ActionNode`
would mean inventing a source zone and destination for something that moves no
cards.

`mode` separates `becomes` from `gain`/`lose` because it is a ruling
distinction: a monster whose ATK _becomes_ 0 has lost its original value, one
that _loses_ ATK has not.

### Filters, not adjectives

A noun phrase becomes queryable columns, because the question a deck builder
asks ("what can fetch a Level 4 DARK Warrior") is answered with a `where`
clause:

```ts
{ kind: 'criteria',
  filter: { cardType: ['MONSTER'], atkMax: 1500 },
  label: '1 monster with 1500 or less ATK' }   // verbatim, for display
```

`archetype` is an **exact** match validated against the pool's own vocabulary;
`nameContains` is the degraded fallback when a quoted token is not a known
archetype. A quoted token the pool does not know, with no generic noun after it,
names one specific card (`{ kind: 'named' }`).

## Diagnostics

Nothing uncertain is discarded silently. Codes are a closed vocabulary because
they are the review queue's sort key and the metrics' histogram buckets.

```ts
{ severity: 'warning',
  code: 'UNRESOLVED_REFERENCE',
  message: 'The reference "it" could not be confidently linked to a prior entity.',
  span: { start: 58, end: 60, text: 'it' } }
```

`confidence` is **derived** from diagnostics and unresolved nodes, never
estimated. It exists to sort the queue; `diagnostics` and `action.resolved` are
the signals that say what is actually wrong. A card scores the **minimum** of
its effects, not the mean — four clean sentences must not hide one bad one.

## Persistence

Two tables, so a grammar change can be generated, compared and rolled back
without disturbing what consumers read today:

- `CardEffectParse` — one row per `(cardId, parserVersion)`, holding the AST as
  JSONB plus `sourceText`, `confidence` and `origin`.
- `CardEffectDiagnostic` — the review queue, indexed by `code` and `severity`.

```bash
yarn psct:parse              # parse what is missing or outdated
yarn psct:parse --force      # re-parse everything, including non-rules rows
yarn psct:parse --dry-run    # parse and report, write nothing
yarn psct:metrics            # coverage over the live pool, with failure shapes
```

Three rules govern the tables:

- **`parserVersion` is part of the key.** Bump `PARSER_VERSION` in `ast.ts` when
  a change makes existing parses wrong; the batch script then writes new rows
  beside the old ones rather than destroying them.
- **`origin` protects manual work.** A row whose origin is not `rules` is never
  overwritten unless `--force` is passed, so a future LLM or manual pass cannot
  be clobbered by a re-parse.
- **An invalid parse is not persisted.** A malformed AST is worse than a missing
  one, because consumers cannot tell it apart from a correct one.

The script is idempotent: it skips a card whose parse exists at the current
version **and** whose text still matches, since a reseed can change printed text
and make a current-version parse stale.

## Testing

Three levels, per the implementation guide:

```bash
yarn test --testPathPattern psct-parser   # 212 tests
```

- **Unit** — `normalize.spec`-style specs per stage: `lexer.spec.ts`,
  `grammar.spec.ts`.
- **End-to-end** — `psct-parser.spec.ts`, which asserts the guide's worked
  examples plus every ruling above.
- **Corpus** — `corpus/*.json` holds real printed text grouped by difficulty,
  with asserted metrics and snapshots.

Card text in the corpus is **verbatim**. Do not hand-tidy it: its value is that
it carries Konami's actual inconsistencies.

## Current coverage

Measured over the whole pool with `yarn psct:parse`, at parser version 1:

| Metric                  | Corpus (42) | Live pool (14,471)  |
| ----------------------- | ----------- | ------------------- |
| Hard failures           | 0           | 0                   |
| Schema-invalid          | 0           | 0                   |
| Parsed with no warnings | 42 (100%)   | 6,054 (42%)         |
| Average confidence      | 0.924       | 0.821               |
| Actions fully resolved  | 76%         | 74% (18,198/24,450) |

### What retiring the older parser cost

`card-effect-parser` (the original regex pipeline) was deleted on 2026-10-14,
once this parser overtook it on per-card search reachability — 6,661 cards to
6,338, after conjunct-level segment recovery closed the only-old bucket from
1,303 to 498.

That was a deliberate, accepted loss of **472 cards** (311 psct, 161 legacy)
whose search reachability only the old parser resolved. The remaining 26 of the
498 were old-parser FALSE POSITIVES — it read "You can only Synchro Summon 'X'
once per turn", a restriction, as a resolved self-Summon.

The per-card list was captured before deletion, because it cannot be recomputed
now that the old parser is gone. It is the highest-value work queue for this
parser — every entry is a card a working parser demonstrably handled — but it
lives in a local analysis artifact OUTSIDE this repo
(`psct-gap-analysis-2026-10-14/lost-on-retirement.json`), not in the tree. The
counts and causes above are the part worth acting on without it.

Read the resolved-action RATE together with the absolute counts, never alone: a
fix that makes previously-unparseable clauses parse adds actions, some of them
unresolved, so the rate can fall while strictly more is understood. That has
already happened once.

Of the 13,556 cards that SHOULD have effects, 13,096 (96.6%) produce at least
one. **460 are real gaps — 146 monsters, 209 Spells, 105 Traps — and exactly 1
of those is silent**; every other one carries a diagnostic saying which stage
gave up and where. No vanilla monster produces a resolved search action, so
flavour text is not inventing reachability.

> **Counting gaps correctly.** `frameType` is a MONSTER-frame column: every
> Spell and Trap in the pool has `frameType = 'NORMAL'`. A predicate like
> `frameType IN ('NORMAL','TOKEN')` therefore excludes all 4,982 Spells and
> Traps, which understated this gap figure as 146 for several measurements. Use
> `cardType IN ('SPELL','TRAP') OR monsterEffectType IN ('EFFECT','FLIP')`
> instead — and note that a Normal PENDULUM monster is still effect-bearing,
> because its Pendulum half carries an effect.

That last number is the one to defend. An earlier revision of this parser looked
much better on paper (42% clean, 0.833 confidence) while 243 cards failed with no
effects _and_ no diagnostic, because a sentence that produced no structure was
discarded along with its diagnostics. Fixing that lowered every headline figure
and improved the parser: the cards were never clean, they were quiet. Treat a
rise in "clean" that coincides with a rise in silent failures as a regression.

This is the guide's first milestone, not the finish line: _reliably parse a
meaningful subset of modern PSCT, preserve source spans, produce a typed AST,
and clearly report every uncertain case_. The 75% of pool cards carrying a
warning are diagnosed, not silently wrong.

## Extending it

The failure-shape histogram from `yarn psct:metrics` names the next rule to
write — it groups unparsed clauses by the token that stopped the parse, so the
largest bucket is the highest-value fix. The lexicon additions in `lexicon.ts`
marked as coming from a coverage run were chosen that way.

1. **Add a fixture, verbatim**, to the right `corpus/*.json` group.
2. **Write the failing spec** in the stage that owns the rule.
3. **Prefer a lexicon entry to a grammar rule.** `lexicon.ts` is data; adding a
   verb or preposition there cannot break the grammar. Most gaps are missing
   vocabulary, not missing structure.
4. **Measure, don't assume.** Run `yarn psct:metrics` before and after — a rule
   that fixes the corpus can still lose ground over 14k cards.
5. **Bump `PARSER_VERSION`** if persisted rows are now wrong.

### Five traps worth knowing

- **Contain a failure; never let it discard what parsed.** This is the single
  most valuable rule in the package. A resolution is parsed as one clause
  first, and on failure retried CONJUNCT BY CONJUNCT
  (`splitResolutionSegments`), keeping every conjunct that parses and reporting
  the rest. Before that, one bad conjunct discarded the whole resolution — the
  largest single cause of lost search actions, worth 805 cards. Two earlier
  fixes (the `, but` rider, stacked conjunctions) were instances of this same
  class patched one at a time, together worth about 5 cards. Fix the class.
- **Recovery must only ever ADD.** The segment path wins only when it recovers
  strictly more actions than the whole-clause parse, which is preferred on a
  tie because its conjunction linkage is richer. An earlier unconditional
  version of the rider peel lost 165 actions by skipping that comparison.

- **Judge a change on reachability, not on "clean".** Peeling the `, but ...`
  rider (below) _lowered_ the clean-parse count by 64, because a recovered
  clause now carries an honest "rider not interpreted" warning where it used to
  carry nothing at all. On the metric that matters it gained 128 cards of search
  reachability. A metric that rewards silence is the wrong metric.
- **Recovery must be a FALLBACK, never a default.** The `, but ...` rider
  destroys a whole resolution when fed to the grammar — Sangan lost its `Add`
  entirely — so `index.ts` retries without it. The first version peeled it
  unconditionally and measurably _lost_ 165 actions on the cards whose rider
  parsed perfectly well. Parse the full clause first; peel only after it has
  actually failed.

- **`resolved` must be recomputed after reference resolution.** It is computed
  in the visitor, which runs BEFORE `references.ts`, so an action with a pronoun
  object ("target 1 Spell/Trap; destroy it") cannot be judged there. The
  pipeline calls `refreshResolved` afterwards. Skipping that step understated
  resolved actions by nearly half the pool — 8,029 instead of 14,831.
- **Possessives need their own lexicon entries.** "either player" matched inside
  "either player's turn" and left a dangling `'s` as two junk tokens, breaking
  the clause; the same happened with "this card" inside "This card's ATK". Any
  new multi-word owner or reference phrase needs its `'s` form listed too, and
  `compileLexicon` will order the longer one first.

- **Cross-kind lexer ordering** is hand-maintained in `KIND_ORDER`. Chevrotain
  takes the _first_ matching token type, not the longest, so "or more" must be
  tried before "or" and "after that" before "After". The `Comparator` kind
  exists only to break an ordering cycle; see the note in `lexicon.ts`.
- **Error recovery must stay off.** With it enabled, Chevrotain can repair a
  failing required `CONSUME` by pretending the token was there, which inside
  `actionSequence`'s `MANY` lets the loop body succeed without consuming and
  spins forever.

## When parsing happens

**At seed time and after a parser upgrade. Never on a request.**

`yarn psct:parse` writes two places:

- **`Card.parsedEffects`** — the current parse, denormalized onto the card row.
  This is what serves reads: `/cards` returns it as an ordinary column, so there
  is no join and no change to the cost of that query (~1.6 KB per card, about
  32 KB for a `take=20` page).

  The column is **parser-agnostic**: the object carries `format`
  (`psct` | `legacy` — what the text is), `origin` (`rules` | `llm` | `manual` —
  which parser produced it), `parserVersion` and `parsedAt`. A second parser
  therefore needs no schema change, and `format` is the field to select on when
  routing legacy text to an LLM pass. It is derived from evidence the parser hit
  — a comma-recovered condition, or an un-errata'd "select" — never assumed from
  a card's age, which this package cannot know. Current split: 11,114 psct,
  3,357 legacy.

- **`CardEffectParse` / `CardEffectDiagnostic`** — the version-keyed history and
  the queryable review queue, which is what `parserVersion` and the diagnostic
  indexes are for.

Staleness is **reported, not repaired**. `/cards/:id/effects` returns `stale`
(the card's text changed since it was parsed) and `outdated` (a newer parser
exists); the fix for either is to run the batch script.

> An earlier version of the service re-parsed live whenever the stored row
> looked stale. Measured, that was ~175 ms per request against ~2.4 ms for the
> read — and almost none of it was parsing (`parseCard` is 0.34 ms). The cost
> was two `DISTINCT` scans to rebuild the parser's vocabulary on every request.
> Worse, bumping `PARSER_VERSION` put _every_ request for _every_ card on that
> path at once, which made a "safe" operation a pool-wide latency cliff. Read
> paths do not parse.

## Consumers

`src/card-effects/` is the first consumer, and the reason the IR is shaped the
way it is:

- `filter-to-where.ts` turns a `CardFilter` into a Prisma `where`. This is the
  payoff of expressing filters as columns rather than adjectives. It lives in
  the consumer, not here, so the parser package keeps its no-Prisma property —
  not even a type import.
- `GET /cards/:id/effects` returns the stored IR, spans and diagnostics
  included, plus `stale` / `outdated`.
- `GET /cards` returns the same IR per card in `parsedEffects`.
- `GET /cards/:id/fetches` returns what each **resolved** search action can
  actually reach, as real cards.

Two rules that consumer follows, worth copying:

- **Only resolved actions become edges.** An unresolved action is one whose
  object the parser could not pin down; querying on it would invent
  reachability the card text does not support.
- **An unconstrained filter is declined, not executed.** `filterToWhere`
  returns `null` rather than `{}`, because an empty `where` matches every card
  in the game — answering "it fetches anything" is worse than answering
  "unknown".

## Sources

The grammar and ruling semantics are taken from Konami's official
"Understanding Card Text" series, which is the authority on Problem-Solving Card
Text.
