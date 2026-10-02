# Card effect parser

Turns a Yu-Gi-Oh card's printed effect text into a structured intermediate
representation (IR) that code can query — what the card does, what it can
reach, what it costs, and what limits apply.

It is a pure, framework-free library: no Nest, no Prisma client, no decorators.
The only thing it needs from the outside is a small vocabulary (`ParserContext`),
which is injected rather than queried. That keeps it usable from a Nest service,
from a `tsx` batch script, and from unit tests on a fixture set.

```ts
import { parseCardEffects } from './card-effect-parser';

const parsed = parseCardEffects(card.description, {
  archetypes, // SELECT DISTINCT archetype  — 650 values in the current pool
  races, // SELECT DISTINCT race        — 26 values
  cardName: card.name,
});
```

`card-effect.types.ts` is the contract between the parser and every consumer of
it. Read that file first; it is the real documentation of the output shape, and
every field carries a comment explaining why it exists.

## Design principle

**An omitted fact is a missing feature; a wrong fact destroys trust in the whole
dataset.**

Every judgement call in here resolves that way. When a noun phrase cannot be
pinned down the parser emits `{ kind: 'unresolved' }` rather than guessing; when
legacy wording is genuinely ambiguous it says so (`LEGACY_SELECT`) rather than
picking a side. Consumers filter on `action.resolved`, so a declined action
costs a feature and a wrong one costs credibility.

## Pipeline

Each stage is one file, and each file's header comment explains the hazards it
exists to handle.

| Stage | File                    | Job                                                                           |
| ----- | ----------------------- | ----------------------------------------------------------------------------- |
| 1     | `normalize.ts`          | Normalize unicode, **mask quoted card names**, fix line breaks                |
| 2     | `segment.ts`            | Split into effect blocks (Pendulum halves, bullet lists) and sentences        |
| 3     | `clauses.ts`            | Split PSCT `condition : cost ; resolution`, plus legacy comma triggers        |
| 4     | `predicate.ts`          | Turn a noun phrase into queryable column constraints                          |
| 5     | `target.ts`             | Decide whether a phrase names cards, a family, or nothing usable              |
| 6     | `actions.ts`            | Turn a resolution segment into verb + zones + destination + target            |
| 7     | `restrictions.ts`       | Once-per-turn scopes, Summon conditions, display-only locks                   |
| 8     | `cost.ts`               | The cost half of a clause                                                     |
| —     | `alias.ts`              | "This card is also treated as X" — a projection of _identity_, not of effects |
| —     | `card-effect-parser.ts` | Entry point; assembles the above                                              |

Two decisions carry most of the parser's correctness:

**Card names are masked before any other rule runs.** Names contain every token
later stages key on — "Deck Devastation Virus" contains `Deck`, "Number 39:
Utopia" contains a colon that would break clause splitting, "D.D. Crow" contains
periods that would break sentence splitting. Masking them first eliminates that
entire class of false positive structurally, rather than chasing each case with
a negative lookahead.

**Splitting on PSCT grammar, not on sentences.** Konami's text is
`<condition> : <cost> ; <resolution>`. Splitting on it means trigger conditions
can never become actions (Sangan's "If this card is sent from the field to the
GY:" contains both _sent_ and _GY_, but the action matcher never sees it) and
costs can never become actions (One for One's "Send 1 monster from your hand to
the GY;" lands in `cost`).

## Rulings the IR models

The parser is not a rules engine — it does not simulate a duel. It does record
the distinctions where Konami's _wording_ maps onto a hard rule, because those
change what a card can actually do.

### "When" vs "If" — missing the timing

An **optional** trigger effect whose condition opens with "When" may only
activate if its trigger was the last thing to happen; if anything resolved after
it, the window is gone. "If" effects have no such restriction, and mandatory
effects do not miss the timing regardless of the word.

```ts
trigger: { timing: 'WHEN', missesTiming: true }   // "When ...: you can ..."
trigger: { timing: 'IF',   missesTiming: false }  // "If ...: you can ..."
```

`missesTiming` is therefore `timing === 'WHEN' && optional`. `WHILE` and
`DURING` are continuous or ignition windows rather than events and never miss
the timing. When a condition names both an event and a window — "During either
player's turn, when a Spell/Trap Card is activated" — the **event** governs.

### "target" vs "choose" vs "select" — what actually targets

Targeting is a game action with its own rules: it can be blocked by targeting
protection, and the choice is locked in at activation rather than at resolution.

| `selection`     | Printed as            | Meaning                          |
| --------------- | --------------------- | -------------------------------- |
| `TARGET`        | "target 1 monster"    | Explicitly targeting             |
| `CHOOSE`        | "choose 1 monster"    | Explicitly non-targeting         |
| `LEGACY_SELECT` | "select 1 monster"    | Pre-errata; **undetermined**     |
| `NONE`          | no selection language | Applies to whatever it describes |

`LEGACY_SELECT` is kept as its own value rather than folded into either side on
purpose. Konami's errata programme rewrote pre-2011 "select" into either
"target" or "choose" case by case, and an un-errata'd card's printed text does
not say which it became. Reporting the ambiguity is honest; reporting
`targets: true` would be wrong about half the time.

Selection is read from the **whole clause**, not just the resolution, because
modern text states it before the semicolon.

### Once-per-turn, and why scope matters

| Field             | Printed as                                          | Scope                               |
| ----------------- | --------------------------------------------------- | ----------------------------------- |
| `hardOncePerTurn` | `You can only use each effect of "X" once per turn` | By card **name**, across every copy |
| `softOncePerTurn` | bare `Once per turn`                                | Per **copy**                        |

Hard OPT is a property of the card and is applied to every effect on it. Soft
OPT is scoped to the sentence it appears in — Trickstar Light Stage's
"Once per turn:" governs only its second effect, and blanket-applying it would
wrongly restrict the search in its first.

### Summon conditions are not searches

`Must first be Special Summoned (from your Extra Deck) by shuffling the above
cards you control into the Deck` names "Gladiator Beast" monsters, but it
describes _this card's own arrival on the field_. Read as an action it makes
those monsters look searchable, which they are not.

These sentences are classified as `restrictions.summonConditions`, kept
verbatim, and yield **no actions**.

`NOMI` and `SEMI_NOMI` are kept apart because they differ in revival legality,
and the whole difference is the word **"first"**:

| Printed as                                  | Kind        | Can another effect revive it?           |
| ------------------------------------------- | ----------- | --------------------------------------- |
| "Must **be** Special Summoned by ..."       | `NOMI`      | No — only ever by that method           |
| "Must **first** be Special Summoned by ..." | `SEMI_NOMI` | Yes, once it has been Summoned properly |

So a semi-Nomi monster _is_ a legal target for "Special Summon 1 monster from
your GY" and a Nomi monster never is. Collapsing the two would wrongly exclude
160 cards from every generic revival. The remaining kinds are `NO_TRIBUTE`,
`RITUAL` and `OTHER`.

The classification is deliberately coarse and the text is always preserved
verbatim: "Must be Special Summoned by a card effect" (Wulf, Lightsworn Beast)
is permissive where "Must be Special Summoned by Tributing 3 monsters" is
restrictive, and both are `NOMI`. What the kind reliably tells a consumer is
that the normal Summon procedure does not apply.

### Class Summons are Special Summons

Every Fusion, Synchro, Xyz, Link, Ritual and Pendulum Summon _is_ a Special
Summon, so they all map to `SPECIAL_SUMMON` rather than each getting a verb of
its own. Only Normal Summon and Flip Summon are not Special Summons.

### Does the effect start a chain?

The colon and the semicolon are not only separators — their _presence_ is the
clue that an effect is an activated one. A monster effect with neither is a
continuous effect, and nothing can chain to it (Divine Wrath cannot negate it).

`CardEffect.startsChain` records that, and is `undefined` rather than `false`
when the printing predates PSCT, because the clue is then simply absent.
Botanical Girl's "When this card is sent from the field to the GY, you can
add ..." is a genuine chainable trigger effect that merely predates the colon;
reporting `false` there would be a wrong fact rather than a missing one.

Across the pool: 13,575 effects chain, 4,061 do not, and 1,745 come from
pre-PSCT printings where the clue cannot be read.

### Conjunctions, and which actions are conditional

Konami's conjunctions are a defined vocabulary, and they say whether a later
part still happens when an earlier part fails:

| Conjunction     | Timing       | First part required for the second? | If the first fails            |
| --------------- | ------------ | ----------------------------------- | ----------------------------- |
| `then`          | sequential   | yes                                 | stop — second does not happen |
| `and if you do` | simultaneous | yes                                 | stop                          |
| `also`          | simultaneous | no                                  | do as much as possible        |
| `and`           | simultaneous | both strictly required              | all-or-nothing                |

`EffectAction.conjunction` records which word introduced the segment, and
`dependsOnPrevious` derives from it. That matters for a search graph: **905 of
the 7,950 resolved search actions (11%) sit behind a dependent conjunction**, so
they are a weaker claim about what the card reaches than a bare search is.
A.I. Connect only adds a monster to the hand _if_ the Special Summon before it
succeeded.

Bare `and` and bare `or` are deliberately **not** split on. Both are real clause
conjunctions, but in card text they join noun phrases ("1 Warrior **or**
Spellcaster monster") far more often than clauses. The consequence is that only
the first half of "Special Summon X **and** attach Y as material" becomes an
action — which for a search graph is the half that matters.

### Pronoun resolutions

PSCT states what an effect acts on in the cost half and refers back to it by
pronoun — "Target 1 monster in either GY; **Special Summon it**". 2,099 cards in
the pool are shaped this way. The parser walks back to the nearest selection
clause (in the cost, or in an earlier resolution segment) and takes both the
noun phrase and its source zone from there, because the two are stated together.
A zone named in the resolution instead describes where the card _goes_.

## Legacy (pre-PSCT) text

PSCT was introduced in 2011. **3,803 of the 14,353 cards in the pool predate it**
and carry no colon or semicolon at all, stating the condition as a
comma-delimited lead:

```
When this card is destroyed by battle and sent to the GY, you can pay 800 Life
Points to Special Summon 1 Level 4 Psychic-Type monster from your Deck.
```

`clauses.ts` splits that into condition / cost / resolution, giving legacy cards
the same treatment the semicolon gives modern ones. Without it the whole
sentence is one resolution and the passive-voice guard discards it, silently
losing the effect.

The parser also handles the other legacy spellings: `pick up and see`
(= excavate), `show` (= reveal), `select` (see above), `Psychic-Type monster`
(the `-Type` suffix, on 795 cards), and `Spell & Trap Card Zone` (the pre-2011
zone names).

## The review queue

Two signals, at different granularity:

- **`unparsed`** — sentences that looked like effects but produced no action.
  A genuine parse failure: the verb table saw a spelling it does not handle.
- **`needsReview`** — card level. True when anything is in `unparsed`, or when
  the card produced no effects at all despite its text naming a search verb.

A sentence is **not** queued when the parser _declined_ rather than failed:
it is a Summon condition, every segment was rejected by a guard (a negation or a
passive description), or the only search verb sits in the trigger, where verbs
describe the event that happened rather than an action to take.

That distinction matters: 922 of the 1,354 sentences an earlier version queued
were negations it had rejected **on purpose** ("Cannot be Normal Summoned",
"You cannot Special Summon monsters"), which made the signal mostly noise and
hid the real gaps.

For a _resolved_ action whose target could not be pinned down, the per-action
signal is `resolved: false` — not the review queue.

## Coverage

Measured by parsing all 14,353 cards in the seeded pool.

| Card type                  | Cards | Actions | Resolved | Flagged for review |
| -------------------------- | ----: | ------: | -------: | -----------------: |
| Monster — Effect           |  5936 |    9120 |      66% |               2.4% |
| Trap — normal              |  1333 |    1850 |      57% |               3.2% |
| Spell — normal             |  1080 |    1654 |      63% |               1.4% |
| Monster — Normal           |   790 |      13 |       0% |               0.1% |
| Monster — Xyz              |   589 |     944 |      60% |               1.2% |
| Spell — quick-play         |   571 |     898 |      67% |               3.2% |
| Trap — continuous          |   563 |     867 |      59% |               1.8% |
| Monster — Fusion           |   560 |     764 |      58% |               0.5% |
| Monster — Synchro          |   529 |     926 |      54% |               0.9% |
| Spell — continuous         |   513 |     791 |      65% |               2.3% |
| Monster — Link             |   473 |     876 |      64% |               0.8% |
| Monster — Pendulum         |   352 |     814 |      72% |               0.9% |
| Spell — field              |   336 |     586 |      63% |               2.4% |
| Spell — equip              |   282 |     447 |      78% |               0.7% |
| Trap — counter             |   179 |     379 |      26% |               1.7% |
| Monster — Ritual           |   146 |     284 |      62% |               0.0% |
| Spell — ritual             |    83 |     212 |      58% |               0.0% |
| Monster — Fusion Pendulum  |    14 |      45 |      71% |               0.0% |
| Monster — Xyz Pendulum     |    10 |      50 |      58% |               0.0% |
| Monster — Synchro Pendulum |     8 |      29 |      83% |               0.0% |
| Monster — Ritual Pendulum  |     6 |      25 |      68% |               0.0% |

Every frame type the seeder produces is covered. Two rows read low by design:
vanilla Normal Monsters have flavour text rather than effects, and Counter Traps
mostly negate rather than move cards, so there is little for a target to resolve
_to_.

Totals: **21,574 actions, 13,587 resolved**, of which **7,950 are resolved
search actions** (`ADD` / `SPECIAL_SUMMON` / `NORMAL_SUMMON` / `SET`).
**273 cards (1.9%) are flagged for review** and no sentence is left unparsed.

`yarn effects:audit` re-parses the pool and greps resolved search actions for
text that smells like a false positive. Current state: **zero** negation and
**zero** passive-voice false positives across all 7,950. The residue is
`conditional` 0.93% ("if X, you can Special Summon …", which are real search
actions that happen to be conditional), `negate-context` 0.14%
("Special Summon it (but negate its effects)" — still a real Summon) and one
`opponent-does` card.

## What it deliberately does not do

- **No rules engine.** It does not simulate a duel, resolve chains, track
  priority, or evaluate whether an activation is currently legal.
- **No model of locks.** Summon locks, archetype locks and phase locks are kept
  verbatim in `restrictions.labels` for display. Building a machine model of
  them is a rabbit hole with no payoff for querying what a card can reach.
- **No negation semantics.** A segment containing a negation is discarded, not
  inverted. `excludeNames` from `except "X"` is the one exception.
- **No "non-DARK"-style exclusions.** `EffectPredicate` cannot express a negated
  attribute, so those are skipped rather than inverted.
- **Not a substitute for judgement on the 273.** The flagged cards are flagged
  because a rule-based parser cannot model them (coin flips, "this effect
  becomes that card's activation effect", "apply its effect that activates when
  it is flipped face-up"). They are the queue for a future LLM or manual pass.

## Persistence and versioning

`parseCardEffects` is pure, but the result is also persisted to
`Card.cardEffects` so consumers do not re-parse 14k cards on every request.

```bash
yarn effects:parse         # parse and write every card that needs it
yarn effects:parse:force   # re-parse everything, including non-RULES rows
yarn effects:audit         # false-positive audit over the whole pool
```

Two rules govern that column:

- **Bump `PARSER_VERSION`** whenever a change makes previously persisted rows
  wrong. A bump is safe — consumers compare it and re-parse live on mismatch —
  but costs a live parse until `yarn effects:parse` runs again.
- **`origin` protects manual work.** The batch script must never overwrite a row
  whose `origin` is not `RULES` unless `--force` is passed, so a future LLM or
  manual pass cannot be clobbered by a re-parse.

`alias.ts` is deliberately _outside_ the persisted IR: it describes what a card
_is_ rather than what it _does_, needs no version bump, and so can never go
stale against the pool.

## Extending it

1. **Add a fixture, verbatim.** `fixtures.ts` holds real card text copied from
   the seeded database. Do not hand-edit those strings — the value of the
   end-to-end spec is that it runs against genuine text, including its
   inconsistencies.
2. **Write the failing spec** in the stage that owns the rule.
3. **Make the change**, and put the _reason_ in a comment at the rule. Nearly
   every regex here exists because some specific card broke without it; name
   that card.
4. **Measure, don't assume.** Query the pool for how common a shape actually is
   before adding a rule for it, and run `yarn effects:audit` afterwards to check
   you have not bought coverage with false positives.
5. **Bump `PARSER_VERSION`** if persisted rows are now wrong.

```bash
yarn test --testPathPattern card-effect-parser   # 359 tests
```

## Sources

The grammar and the ruling semantics above are taken from Konami's official
"Understanding Card Text" series, which is the authority on Problem-Solving
Card Text:

- [Part 2: New Words & Phrases](https://www.yugioh-card.com/eu/play/understanding-card-text/part-2-new-words-phrases/)
  — "banish", "leaves the field", "targeted for an attack".
- [Part 3: Conditions, Activations, and Effects](https://www.yugioh-card.com/eu/play/understanding-card-text/part-3-conditions-activations-and-effects/)
  — the `CONDITIONS : ACTIVATION ; RESOLUTION` structure, and that the
  activation slot holds both costs **and** targeting.
- [Part 4: The Clues on Your Cards](https://www.yugioh-card.com/eu/play/understanding-card-text/part-4-the-clues-on-your-cards/)
  — a colon or semicolon marks an effect that starts a chain; costs are paid at
  activation; "target" vs a pronoun in the resolution.
- [Part 5: Special Summons](https://www.yugioh-card.com/eu/play/understanding-card-text/part-5-special-summons/)
  — Nomi vs semi-Nomi, and "cannot be Special Summoned by other ways".
- [Part 7: Conjunction Functions](https://www.yugioh-card.com/eu/play/understanding-card-text/part-7-conjunction-functions/)
  — the exact semantics of "then", "also", "and if you do" and "and".

One rule here is **not** from that series: the "When" vs "If" timing-missing
distinction. The series does not cover it, and the parser's treatment follows
the standard formulation — an _optional_ "When" trigger effect may only
activate if its trigger was the last thing to happen, and "If" effects are
never subject to that. It is worth re-checking against the current official
rulebook before anything depends on it heavily.
