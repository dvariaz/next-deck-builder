import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  aliasAppliesInZones,
  parseCardAliases,
  type CardAlias,
} from '../card-effect-parser/alias';
import type { EffectZone } from '../card-effect-parser/card-effect.types';
import { PrismaService } from '../prisma/prisma.service';

/**
 * The reverse index: alias name -> the cards that answer to it.
 *
 * Loaded once at boot, exactly like `EffectVocabularyService`. ~700 candidate
 * descriptions yield ~280 aliases over ~260 cards, so this is a few kilobytes
 * and one query, and it turns every alias lookup on the BFS hot path into an
 * in-memory operation.
 *
 * Deliberately NOT a table: an alias is derivable from the description, so
 * persisting it would add a migration, a batch-script dependency, and a way to
 * be stale, in exchange for nothing at this size. Every lookup returns a
 * handful of ids, which the resolver folds into an `id IN (...)` arm.
 */

/** A card that answers to a requested name, and the alias that granted it. */
export interface AliasHit {
  cardId: number;
  /** The alias text, for the edge label: `as "Fallen of Albaz"`. */
  aliasName: string;
}

interface AliasEntry {
  cardId: number;
  alias: CardAlias;
  lowerName: string;
}

@Injectable()
export class CardAliasService implements OnModuleInit {
  private entries: AliasEntry[] = [];
  private byName = new Map<string, AliasEntry[]>();

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    await this.refresh();
  }

  async refresh() {
    // Only two phrasings can produce an alias, so the scan is bounded to the
    // few hundred cards that use one of them rather than the whole pool.
    const rows = await this.prisma.card.findMany({
      where: {
        OR: [
          { description: { contains: 'treated as' } },
          { description: { contains: 'name becomes' } },
        ],
      },
      select: { id: true, description: true },
    });

    const entries: AliasEntry[] = [];
    for (const row of rows) {
      for (const alias of parseCardAliases(row.description)) {
        entries.push({
          cardId: row.id,
          alias,
          lowerName: alias.name.toLowerCase(),
        });
      }
    }

    this.entries = entries;

    const byName = new Map<string, AliasEntry[]>();
    for (const entry of entries) {
      const list = byName.get(entry.lowerName);
      if (list) list.push(entry);
      else byName.set(entry.lowerName, [entry]);
    }
    this.byName = byName;
  }

  /** How many aliases the index holds. Exposed for boot logging and specs. */
  get size(): number {
    return this.entries.length;
  }

  /**
   * Cards that answer to this exact name in these zones.
   *
   * For a `named` target: `Special Summon 1 "Red Dragon Archfiend"`.
   */
  forName(name: string, zones: readonly EffectZone[]): AliasHit[] {
    return toHits(this.byName.get(name.toLowerCase()) ?? [], zones);
  }

  /**
   * Cards one of whose aliases CONTAINS this fragment, in these zones.
   *
   * For a `criteria` target: `Add 1 "Blue-Eyes" monster` must reach a card
   * treated as a "Blue-Eyes" card even when neither its name nor its archetype
   * column says so. A linear scan over ~280 entries is cheaper than the query
   * it replaces.
   */
  containing(fragment: string, zones: readonly EffectZone[]): AliasHit[] {
    const needle = fragment.toLowerCase();
    if (!needle) return [];

    return toHits(
      this.entries.filter((entry) => entry.lowerName.includes(needle)),
      zones,
    );
  }
}

/** Zone-filter, then dedupe by card, keeping the first alias that matched. */
function toHits(
  entries: AliasEntry[],
  zones: readonly EffectZone[],
): AliasHit[] {
  const hits = new Map<number, AliasHit>();

  for (const entry of entries) {
    if (hits.has(entry.cardId)) continue;
    if (!aliasAppliesInZones(entry.alias.zones, zones)) continue;
    hits.set(entry.cardId, {
      cardId: entry.cardId,
      aliasName: entry.alias.name,
    });
  }

  return [...hits.values()];
}
