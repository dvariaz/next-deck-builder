# Yu-Gi-Oh! Card Database: Data Modeling Reference

This document defines the data modeling decisions for the Yu-Gi-Oh! card database web application. Its purpose is to serve as a reference for any AI assistant or developer working on this codebase, explaining not just *what* the schema looks like, but *why* each decision was made.

***

## Data Source

All card data is sourced from the **YGOProDeck public API** (`https://db.ygoprodeck.com/api/v7/cardinfo.php`), which returns the full catalog (~13,000+ cards) in a single JSON response. Each card object contains a `type` field with a composite string such as `"Synchro Tuner Effect Monster"` that encodes multiple orthogonal properties simultaneously.

The seeding script fetches this endpoint and parses each card into the structured schema described below. The script uses **upsert operations** (not plain inserts) to remain idempotent and safely re-executable when new card sets are released.

***

## Core Design Principles

### Single Table for All Cards

All cards — Monster, Spell, and Trap — live in a single `Card` table. This is intentional. Searches in a deck builder are almost always cross-type ("find all cards that negate Special Summons"), and a multi-table approach would require constant `JOIN` or `UNION` operations. Columns exclusive to one card type (e.g., `atk`, `def`, `level`) are nullable and simply left as `NULL` for non-monster cards.

### Orthogonal Properties as Booleans

Yu-Gi-Oh! card types are **multidimensional**, not hierarchical. A single card can be simultaneously a Synchro Monster, a Tuner, and an Effect Monster (e.g., Rciela, Sinister Soul of the White Forest). Modeling this with a single `subType` enum would fail for any card that combines properties.

The rule applied throughout this schema is:

> If a property can coexist with other properties, it must be a **Boolean**. Only use an enum when values are genuinely mutually exclusive.

***

## Card Type Classification

### Top-Level Type (`cardType`)

Every card belongs to exactly one of three categories. This is the only truly exclusive top-level classification:

- `MONSTER`
- `SPELL`
- `TRAP`

### Monster Type Axes

Monster cards are described across four independent axes:

#### Axis 1: Summon Type (`summonType`) — *Enum, mutually exclusive*

Describes how the monster is brought to the field. A card cannot be both Fusion and Synchro at the same time, so this is safely represented as an enum:

- `NORMAL` — No special summon mechanic (default)
- `RITUAL`
- `FUSION`
- `SYNCHRO`
- `XYZ`
- `LINK`

#### Axis 2: Effect Behavior — *Booleans, combinable*

These two properties are independent and can coexist on the same card:

- `isEffect` — The card has one or more effects
- `isFlip` — The card has a Flip effect

Both can be `true` simultaneously. A Flip Effect Monster (e.g., Ryko, Lightsworn Hunter) has `isEffect: true` and `isFlip: true`. A vanilla Flip monster has `isEffect: false` and `isFlip: true`.

#### Axis 3: Zone Mechanics — *Boolean*

- `isPendulum` — The card has a Pendulum Zone effect and a scale value. This is orthogonal to `summonType`; a Pendulum card can also be Fusion, Synchro, Xyz, etc.

#### Axis 4: Special Roles — *Booleans*

- `isTuner` — Required for Synchro Summons; relevant for deck building
- `isToken` — Token cards are never placed in the Main Deck

Properties like `isToon`, `isSpirit`, `isGemini`, and `isUnion` were deliberately excluded from the schema at this stage. These mechanics are obsolete in the current competitive meta and are not relevant for deck building searches. If needed in the future, they can be captured in the `aiTags` JSON field.

### Spell and Trap Subtype (`spellTrapSubType`) — *Enum, mutually exclusive*

Unlike monsters, Spell and Trap cards have a single, exclusive subtype classification. This field is `NULL` for Monster cards.

**Spell subtypes:** `NORMAL`, `CONTINUOUS`, `QUICK_PLAY`, `EQUIP`, `FIELD`, `RITUAL`

**Trap subtypes:** `NORMAL`, `CONTINUOUS`, `COUNTER`

***

## Frame Type (`frameType`)

The visual frame type of the card as defined by Konami. This is distinct from `summonType` and serves as a display/filtering property:

`NORMAL`, `EFFECT`, `RITUAL`, `FUSION`, `SYNCHRO`, `XYZ`, `PENDULUM`, `LINK`, `TOKEN`

***

## Monster-Specific Attributes

The following columns are populated for Monster cards and left as `NULL` for Spell and Trap cards:

| Column | Description |
|--------|-------------|
| `atk` | Attack points |
| `def` | Defense points (`NULL` for Link monsters) |
| `level` | Level or Rank (used for both Level monsters and Xyz Rank) |
| `linkVal` | Link rating (only for Link monsters) |
| `scale` | Pendulum scale (only for Pendulum monsters) |
| `attribute` | Monster attribute: `DARK`, `LIGHT`, `FIRE`, `WATER`, `EARTH`, `WIND`, `DIVINE` |
| `race` | Monster type: `Warrior`, `Spellcaster`, `Dragon`, etc. |

***

## Ban Status

Banlist status is stored separately for TCG and OCG formats, as they maintain independent banlists:

- `banStatusTcg`
- `banStatusOcg`

Both use the enum: `FORBIDDEN`, `LIMITED`, `SEMI_LIMITED`, `UNLIMITED` (or `NULL` if not on the list).

***

## Competitive Classification (Deferred)

Competitive role tags (`isHandtrap`, `isFloodgate`, `isBoardbreaker`, `isExtender`, `isStarter`, `isGarnett`) are **intentionally excluded from the current schema**.

These tags are derived data — generated by an AI pipeline that reads the card's `description` field and infers its competitive role. They do not exist in the YGOProDeck source and cannot be populated during the initial seed.

Adding them prematurely would:
1. Pollute the schema with columns that cannot be filled at ingestion time
2. Commit to a fixed set of categories before the AI pipeline has been designed and validated

The `aiTags` JSON column serves as a flexible placeholder for this data. Once the AI labeling pipeline is built and the category set is finalized, the competitive classification columns will be added in a dedicated migration with real data available to validate them immediately.

***

## Relationships

### CardImage

Each card can have multiple images (alternate artworks). The `CardImage` model stores three sizes: full, small, and cropped. Linked to `Card` via a foreign key.

### CardSet

Each card can belong to multiple sets (it may have been printed in many booster packs across its history). The `CardSet` model stores set name, set code, rarity name, and rarity code. Linked to `Card` via a foreign key.

***

## Validation Rules (Enforced at Parse Time)

The following integrity rules should be enforced in the seeding parser before any record is inserted:

- Monster cards must have a non-null `summonType`
- Synchro, Fusion, Ritual, and Xyz monsters must have a non-null `level`
- Link monsters must have a non-null `linkVal` and a null `def`
- Pendulum monsters must have a non-null `scale`
- Spell and Trap cards must have a non-null `spellTrapSubType` and null monster-specific fields
- Token cards must have `isToken: true`

***

## Schema Extensibility

The schema is designed to accommodate future Konami mechanics without structural rewrites:

- New orthogonal monster properties → add a Boolean column
- New summon types → add a value to the `SummonType` enum
- New Spell/Trap subtypes → add a value to the `SpellTrapSubType` enum
- New competitive categories → add Boolean columns in a future migration after the AI pipeline is ready
- Experimental or low-priority tags → store in `aiTags JSON` without schema changes
