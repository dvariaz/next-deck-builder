/**
 * Stage 9 — validation.
 *
 * A Zod schema over the persisted shape, checked before anything is written to
 * the database. The TypeScript types in `ast.ts` are compile-time only; this is
 * what stops a bug in a visitor from putting a malformed node into JSONB where
 * every consumer would then have to defend against it.
 *
 * The policy is deliberate: a parse with WARNINGS is still persisted, because a
 * partially understood card is useful and its gaps are recorded. A parse that
 * violates a structural invariant is not, because a malformed AST is worse than
 * no AST — consumers cannot tell it apart from a correct one.
 */

import { z } from 'zod';
import {
  ActionVerb,
  EffectTextFormat,
  BlockKind,
  Conjunction,
  ConditionKind,
  CostKind,
  Destination,
  DiagnosticCode,
  DiagnosticSeverity,
  EffectKind,
  ModifierKind,
  ReferenceExpression,
  SelectionMode,
  Stat,
  SummonConditionKind,
  TriggerTiming,
  Zone,
} from './ast';
import type { ParsedCard } from './ast';

/** Values of a const-object enum, as a Zod enum. */
function enumOf<T extends Record<string, string>>(obj: T) {
  return z.enum(Object.values(obj) as [string, ...string[]]);
}

export const SpanSchema = z.object({
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  text: z.string(),
});

export const DiagnosticSchema = z.object({
  severity: enumOf(DiagnosticSeverity),
  code: enumOf(DiagnosticCode),
  message: z.string(),
  span: SpanSchema.nullable(),
});

export const CardFilterSchema = z.object({
  cardType: z.array(z.string()).optional(),
  summonType: z.array(z.string()).optional(),
  spellTrapSubType: z.array(z.string()).optional(),
  archetype: z.string().optional(),
  nameContains: z.string().optional(),
  attribute: z.array(z.string()).optional(),
  race: z.array(z.string()).optional(),
  levelMin: z.number().optional(),
  levelMax: z.number().optional(),
  linkValMin: z.number().optional(),
  linkValMax: z.number().optional(),
  atkMin: z.number().optional(),
  atkMax: z.number().optional(),
  defMin: z.number().optional(),
  defMax: z.number().optional(),
  isTuner: z.boolean().optional(),
  isPendulum: z.boolean().optional(),
  isEffect: z.boolean().optional(),
  position: z.enum(['face-up', 'face-down']).optional(),
  excludeNames: z.array(z.string()).optional(),
});

export const ReferenceNodeSchema = z.object({
  kind: z.literal('reference'),
  expression: enumOf(ReferenceExpression),
  resolvedTo: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  span: SpanSchema,
});

export const TargetSubjectSchema = z.union([
  z.object({ kind: z.literal('named'), names: z.array(z.string()).min(1) }),
  z.object({ kind: z.literal('self') }),
  z.object({
    kind: z.literal('criteria'),
    filter: CardFilterSchema,
    label: z.string(),
  }),
  z.object({
    kind: z.literal('reference'),
    reference: ReferenceNodeSchema,
  }),
  z.object({ kind: z.literal('unresolved'), text: z.string() }),
]);

export const QuantitySchema = z.union([
  z.object({
    min: z.number().int().nonnegative(),
    max: z.number().int().nonnegative(),
  }),
  z.literal('any'),
]);

export const ZoneRefSchema = z.object({
  zone: enumOf(Zone),
  owner: z.enum(['self', 'opponent', 'either']),
});

export const TargetNodeSchema = z.object({
  kind: z.literal('target'),
  id: z.string().min(1),
  subject: TargetSubjectSchema,
  quantity: QuantitySchema,
  selection: enumOf(SelectionMode),
  sourceZones: z.array(ZoneRefSchema),
  span: SpanSchema,
});

export const CostNodeSchema = z.object({
  kind: z.literal('cost'),
  cost: enumOf(CostKind),
  amount: z
    .union([z.number(), z.literal('any'), z.literal('variable')])
    .nullable(),
  subject: TargetSubjectSchema.nullable(),
  sourceZones: z.array(ZoneRefSchema),
  span: SpanSchema,
});

export const ActionNodeSchema = z.object({
  kind: z.literal('action'),
  verb: enumOf(ActionVerb),
  object: TargetNodeSchema.nullable(),
  destination: enumOf(Destination).optional(),
  amount: z.union([z.number(), z.literal('variable')]).nullable(),
  modifiers: z.array(z.string()),
  conjunction: enumOf(Conjunction),
  dependsOnPrevious: z.boolean(),
  resolved: z.boolean(),
  span: SpanSchema,
});

export const ModifierNodeSchema = z.object({
  kind: z.literal('modifier'),
  modifier: enumOf(ModifierKind),
  object: TargetNodeSchema.nullable(),
  stat: enumOf(Stat).optional(),
  mode: z.enum(['gain', 'lose', 'becomes']).optional(),
  amount: z.union([z.number(), z.literal('variable')]).optional(),
  duration: z.string().optional(),
  span: SpanSchema,
});

/**
 * The recursive node union.
 *
 * `z.lazy` is required because `sequence`, `parallel` and `conditional` contain
 * other effect nodes; without it the schema would only validate one level deep
 * and a malformed grandchild would pass.
 */
export const EffectNodeSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    ActionNodeSchema,
    ModifierNodeSchema,
    z.object({
      kind: z.literal('conditional'),
      condition: EffectNodeSchema,
      then: EffectNodeSchema,
      span: SpanSchema,
    }),
    z.object({
      kind: z.literal('sequence'),
      simultaneous: z.literal(false),
      children: z.array(EffectNodeSchema),
      span: SpanSchema,
    }),
    z.object({
      kind: z.literal('parallel'),
      simultaneous: z.literal(true),
      children: z.array(EffectNodeSchema),
      span: SpanSchema,
    }),
  ]),
);

export const ConditionNodeSchema = z.object({
  kind: enumOf(ConditionKind),
  position: z.enum(['leading', 'trailing']),
  text: z.string(),
  timing: enumOf(TriggerTiming).optional(),
  missesTiming: z.boolean(),
  quickEffect: z.boolean(),
  exclusions: z.array(z.string()),
  span: SpanSchema,
});

export const RestrictionsSchema = z.object({
  hardOncePerTurn: z
    .object({
      scope: z.enum(['effect', 'activation', 'summon']),
      name: z.string().optional(),
    })
    .optional(),
  softOncePerTurn: z.boolean().optional(),
  exceptNames: z.array(z.string()),
  labels: z.array(z.string()),
  summonConditions: z.array(
    z.object({
      kind: enumOf(SummonConditionKind),
      text: z.string(),
      span: SpanSchema,
    }),
  ),
});

export const ParsedEffectSchema = z.object({
  id: z.string().min(1),
  blockKind: enumOf(BlockKind),
  effectKind: enumOf(EffectKind),
  condition: z.array(ConditionNodeSchema),
  activation: z.array(z.union([CostNodeSchema, TargetNodeSchema])),
  resolution: EffectNodeSchema.nullable(),
  restrictions: RestrictionsSchema,
  optional: z.boolean(),
  startsChain: z.boolean().optional(),
  sourceText: z.string(),
  span: SpanSchema,
  diagnostics: z.array(DiagnosticSchema),
  confidence: z.number().min(0).max(1),
});

export const ParsedCardSchema = z.object({
  cardId: z.string(),
  cardName: z.string(),
  sourceText: z.string(),
  normalizedText: z.string(),
  effects: z.array(ParsedEffectSchema),
  diagnostics: z.array(DiagnosticSchema),
  confidence: z.number().min(0).max(1),
  parserVersion: z.number().int().positive(),
  parsedAt: z.string(),
  format: enumOf(EffectTextFormat),
  origin: z.enum(['rules', 'llm', 'manual']),
});

export interface ValidationResult {
  valid: boolean;
  /** Zod issues, flattened to one message per path. */
  errors: string[];
}

/**
 * Validate a parse before persisting it.
 *
 * Returns rather than throws, so the batch script can record a
 * SCHEMA_VALIDATION_ERROR against the card and carry on with the rest of the
 * pool instead of aborting a 14k-card run on one bad row.
 */
export function validateParsedCard(parsed: ParsedCard): ValidationResult {
  const result = ParsedCardSchema.safeParse(parsed);
  if (result.success) return { valid: true, errors: [] };

  return {
    valid: false,
    errors: result.error.issues.map(
      (issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`,
    ),
  };
}
