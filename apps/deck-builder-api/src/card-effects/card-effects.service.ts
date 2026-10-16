/**
 * The first consumer of the parsed effect IR.
 *
 * Until this existed the parser was infrastructure with no payoff: 14,471 rows
 * of structured effects that nothing read. This service answers the question
 * the IR was shaped for — "what can this card actually fetch?" — by turning
 * each resolved search action's `CardFilter` into a database query.
 *
 * It reads the PERSISTED parse rather than re-parsing, except when the stored
 * row is from an older parser version, in which case it re-parses live. That
 * keeps a `PARSER_VERSION` bump safe: consumers immediately see current
 * results, and the batch script can catch up afterwards.
 */

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  PARSER_VERSION,
  SEARCH_VERBS,
  type ActionNode,
  type CardFilter,
  type EffectNode,
  type ParsedCard,
  type TargetSubject,
} from '../psct-parser/ast';
import { filterToWhere } from './filter-to-where';

/** How many matching cards a single action reports. */
const MATCH_LIMIT = 50;

/**
 * A stored parse, plus the two freshness facts a caller needs to interpret it.
 * Neither is repaired on read; both are reported.
 */
export type ParsedCardResult = ParsedCard & {
  stale: boolean;
  outdated: boolean;
};

export interface ReachableCard {
  id: number;
  name: string;
}

export interface SearchEdge {
  /** The effect this action belongs to, as `${blockIndex}.${sentenceIndex}`. */
  effectId: string;
  verb: string;
  /** Konami's verbatim phrase, for display. Never reconstructed from columns. */
  label: string;
  /** The exact printed text this came from, so a wrong edge is self-diagnosing. */
  sourceText: string;
  /** Whether the action targets — a distinct game action with its own rules. */
  selection: string;
  /** How many cards match, before the display limit. */
  matchCount: number;
  matches: ReachableCard[];
  /**
   * Why no query was run, when that is the case: either the action's object is
   * a specific named card (no search needed) or the filter constrains nothing.
   */
  note?: string;
}

@Injectable()
export class CardEffectsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Every action node under an effect tree, in order. */
  private actionsIn(node: EffectNode | null): ActionNode[] {
    if (!node) return [];
    switch (node.kind) {
      case 'action':
        return [node];
      case 'modifier':
        return [];
      case 'conditional':
        // The `condition` half repeats the preceding node rather than adding an
        // action, so only `then` contributes.
        return this.actionsIn(node.then);
      case 'sequence':
      case 'parallel':
        return node.children.flatMap((child) => this.actionsIn(child));
    }
  }

  /**
   * Load a card's stored parse.
   *
   * A PURE READ. Parsing is a batch concern — it happens at seed time and after
   * a parser upgrade (`yarn psct:parse`), never on a request. An earlier
   * version of this method re-parsed live whenever the stored row looked stale,
   * which measured at ~175 ms per request against ~2.4 ms for the read; almost
   * all of that was two `DISTINCT` scans to rebuild the parser's vocabulary.
   * Worse, a `PARSER_VERSION` bump put EVERY request for EVERY card on that
   * path at once.
   *
   * So staleness is reported rather than repaired. The returned object carries
   * its own `parserVersion`, and `stale` says whether the text it was built
   * from is still the card's text — a caller can tell, and the fix is to run
   * the batch script, not to pay for a parse on every read.
   */
  async parseFor(cardId: number): Promise<ParsedCardResult> {
    const card = await this.prisma.card.findUnique({
      where: { id: cardId },
      select: { id: true, description: true, parsedEffects: true },
    });
    if (!card) throw new NotFoundException(`No card with id ${cardId}`);

    if (!card.parsedEffects) {
      throw new NotFoundException(
        `Card ${cardId} has no parsed effects yet. Run \`yarn psct:parse\`.`,
      );
    }

    const parsed = card.parsedEffects as unknown as ParsedCard;

    return {
      ...parsed,
      /** True when the card's printed text has changed since it was parsed. */
      stale: parsed.sourceText !== card.description,
      /** True when a newer parser exists than the one that produced this. */
      outdated: parsed.parserVersion !== PARSER_VERSION,
    };
  }

  /**
   * What this card can fetch.
   *
   * Only RESOLVED search actions produce an edge. That filter is the whole
   * point of the `resolved` flag: an unresolved action is one whose object the
   * parser could not pin down, and querying on it would invent reachability
   * the card text does not support.
   */
  async fetches(cardId: number): Promise<SearchEdge[]> {
    const parsed = await this.parseFor(cardId);
    const edges: SearchEdge[] = [];

    for (const effect of parsed.effects) {
      for (const action of this.actionsIn(effect.resolution)) {
        if (!action.resolved) continue;
        if (!SEARCH_VERBS.includes(action.verb)) continue;
        if (!action.object) continue;

        edges.push(
          await this.edgeFor(effect.id, action, action.object.subject),
        );
      }
    }

    return edges;
  }

  private async edgeFor(
    effectId: string,
    action: ActionNode,
    subject: TargetSubject,
  ): Promise<SearchEdge> {
    const base = {
      effectId,
      verb: action.verb,
      sourceText: action.span.text,
      selection: action.object?.selection ?? 'none',
    };

    // A named card needs no query — the text already said which card it is.
    if (subject.kind === 'named') {
      const matches = await this.prisma.card.findMany({
        where: { name: { in: subject.names } },
        select: { id: true, name: true },
      });
      return {
        ...base,
        label: subject.names.join(', '),
        matchCount: matches.length,
        matches,
        ...(matches.length === 0
          ? { note: 'Named card not present in the pool.' }
          : {}),
      };
    }

    if (subject.kind === 'self') {
      return {
        ...base,
        label: 'this card',
        matchCount: 0,
        matches: [],
        note: 'Acts on the card itself; no search.',
      };
    }

    // A reference whose antecedent resolved acts on that antecedent, which was
    // selected elsewhere in the clause rather than searched for here.
    if (subject.kind === 'reference') {
      return {
        ...base,
        label: subject.reference.span.text,
        matchCount: 0,
        matches: [],
        note: 'Acts on a previously selected card; no independent search.',
      };
    }

    if (subject.kind === 'unresolved') {
      return {
        ...base,
        label: subject.text,
        matchCount: 0,
        matches: [],
        note: 'The parser could not pin this object down.',
      };
    }

    return this.criteriaEdge(base, subject.filter, subject.label);
  }

  private async criteriaEdge(
    base: Omit<SearchEdge, 'label' | 'matchCount' | 'matches'>,
    filter: CardFilter,
    label: string,
  ): Promise<SearchEdge> {
    const where = filterToWhere(filter);

    // `filterToWhere` returns null rather than `{}` for an unconstrained
    // filter, so this declines instead of claiming the card fetches anything.
    if (!where) {
      return {
        ...base,
        label,
        matchCount: 0,
        matches: [],
        note: 'Describes no queryable constraint; declined rather than matching every card.',
      };
    }

    const [matchCount, matches] = await Promise.all([
      this.prisma.card.count({ where }),
      this.prisma.card.findMany({
        where,
        select: { id: true, name: true },
        orderBy: [{ name: 'asc' }],
        take: MATCH_LIMIT,
      }),
    ]);

    return { ...base, label, matchCount, matches };
  }
}
