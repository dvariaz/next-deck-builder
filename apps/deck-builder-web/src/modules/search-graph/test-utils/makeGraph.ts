import type {
  SearchGraphCardDto,
  SearchGraphEdgeDto,
  SearchGraphNodeDto,
  SearchKind,
} from "@/generated/model";

type CardNodeOverrides = Omit<Partial<SearchGraphNodeDto>, "card"> & {
  card?: Partial<SearchGraphCardDto>;
};

export function makeCardNode(
  id: number,
  overrides: CardNodeOverrides = {},
): SearchGraphNodeDto {
  const { card, ...rest } = overrides;
  return {
    id: `card:${id}`,
    depth: 1,
    isRoot: false,
    isChainLink: false,
    card: {
      id,
      ygoId: 1000 + id,
      name: `Card ${id}`,
      cardType: "MONSTER",
      frameType: "EFFECT",
      ...card,
    },
    ...rest,
  };
}

export function makeEdge(
  from: string,
  to: string,
  overrides: Partial<SearchGraphEdgeDto> = {},
): SearchGraphEdgeDto {
  return {
    id: `${from}->${to}#0`,
    from,
    to,
    verb: "ADD",
    kinds: ["DECK_SEARCH"] as SearchKind[],
    sourceZones: [{ zone: "DECK", owner: "SELF" }],
    destination: "HAND",
    optional: false,
    costs: [],
    restrictions: [],
    sourceText: "Add 1 card from your Deck to your hand.",
    ...overrides,
  };
}
