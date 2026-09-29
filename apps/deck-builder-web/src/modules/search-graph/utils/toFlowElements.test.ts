import { describe, expect, it } from "vitest";
import type { SearchKind } from "@/generated/model";
import { makeCardNode, makeEdge } from "../test-utils/makeGraph";
import {
  toFlowElements,
  type CardFlowNodeData,
  type EffectFlowNodeData,
} from "./toFlowElements";

const root = makeCardNode(1, {
  depth: 0,
  isRoot: true,
  card: { archetype: "Trickstar" },
});
const other = makeCardNode(2, { card: { archetype: "Trickstar" } });
const third = makeCardNode(4, { card: { archetype: "Trickstar" } });
const foreign = makeCardNode(3, { card: { archetype: "Sky Striker" } });

/** The id toFlowElements gives the effect node for a card's sentence. */
const effectId = (
  from: string,
  text = "Add 1 card from your Deck to your hand.",
) => `effect:${from}|${text}`;

const cardData = (data: unknown) => data as CardFlowNodeData;
const effectData = (data: unknown) => data as EffectFlowNodeData;

describe("toFlowElements", () => {
  it("shows only the root and its effects before anything is opened", () => {
    const { nodes } = toFlowElements(
      [root, other],
      [makeEdge("card:1", "card:2")],
    );
    expect(nodes.map((n) => [n.id, n.type])).toEqual([
      ["card:1", "cardNode"],
      [effectId("card:1"), "effectNode"],
    ]);
  });

  it("reveals the target cards once the effect is opened", () => {
    const { nodes } = toFlowElements(
      [root, other],
      [makeEdge("card:1", "card:2")],
      { openEffectIds: new Set([effectId("card:1")]) },
    );
    expect(nodes.map((n) => n.id)).toContain("card:2");
  });

  it("states one sentence once, however many cards it reaches", () => {
    // The whole point of the node: eight targets used to mean eight copies of
    // the same text strung along eight arrows.
    const { nodes } = toFlowElements(
      [root, other, third],
      [makeEdge("card:1", "card:2"), makeEdge("card:1", "card:4")],
    );
    const effects = nodes.filter((n) => n.type === "effectNode");
    expect(effects).toHaveLength(1);
    expect(effectData(effects[0].data).effect.targets).toEqual([
      "card:2",
      "card:4",
    ]);
  });

  it("gives a second sentence its own node", () => {
    const { nodes } = toFlowElements(
      [root, other, third],
      [
        makeEdge("card:1", "card:2"),
        makeEdge("card:1", "card:4", { sourceText: "Special Summon it." }),
      ],
    );
    expect(nodes.filter((n) => n.type === "effectNode")).toHaveLength(2);
  });

  it("unions the kinds of every edge in the group", () => {
    const { nodes } = toFlowElements(
      [root, other, third],
      [
        makeEdge("card:1", "card:2", { kinds: ["DECK_SEARCH"] }),
        makeEdge("card:1", "card:4", { kinds: ["WITH_COST"] }),
      ],
    );
    const effect = nodes.find((n) => n.type === "effectNode")!;
    expect(effectData(effect.data).effect.kinds).toEqual([
      "DECK_SEARCH",
      "WITH_COST",
    ]);
  });

  it("flags a Hard Once Per Turn restriction on the group", () => {
    const { nodes } = toFlowElements(
      [root, other],
      [
        makeEdge("card:1", "card:2", {
          restrictions: ["Hard once per turn"],
        }),
      ],
    );
    const effect = nodes.find((n) => n.type === "effectNode")!;
    expect(effectData(effect.data).effect.hardOncePerTurn).toBe(true);
  });

  describe("edges", () => {
    it("routes the card into the effect, and the effect into each target", () => {
      const { edges } = toFlowElements(
        [root, other],
        [makeEdge("card:1", "card:2")],
        { openEffectIds: new Set([effectId("card:1")]) },
      );
      expect(edges.map((e) => [e.source, e.target])).toEqual([
        ["card:1", effectId("card:1")],
        [effectId("card:1"), "card:2"],
      ]);
    });

    it("leaves a closed effect with no outgoing arrows", () => {
      const { edges } = toFlowElements(
        [root, other],
        [makeEdge("card:1", "card:2")],
      );
      expect(edges).toHaveLength(1);
      expect(edges[0].target).toBe(effectId("card:1"));
    });

    it("colours an arrow from its primary kind and adds an arrow head", () => {
      const { edges } = toFlowElements(
        [root, other],
        [makeEdge("card:1", "card:2", { kinds: ["WITH_COST", "DECK_SEARCH"] })],
        { openEffectIds: new Set([effectId("card:1")]) },
      );
      const toTarget = edges.find((e) => e.target === "card:2")!;
      expect(toTarget.style?.stroke).toBe("#22d3ee");
      expect(toTarget.markerEnd).toMatchObject({ type: "arrowclosed" });
    });

    it("dashes a Set edge", () => {
      const { edges } = toFlowElements(
        [root, other],
        [makeEdge("card:1", "card:2", { kinds: ["SET_FROM_DECK"] })],
        { openEffectIds: new Set([effectId("card:1")]) },
      );
      expect(edges[0].style?.strokeDasharray).toBeTruthy();
    });
  });

  describe("reachability", () => {
    it("hides a deeper card until its parent's effect is opened too", () => {
      const { nodes } = toFlowElements(
        [root, other, third],
        [makeEdge("card:1", "card:2"), makeEdge("card:2", "card:4")],
        { openEffectIds: new Set([effectId("card:1")]) },
      );
      const ids = nodes.map((n) => n.id);
      expect(ids).toContain(effectId("card:2"));
      expect(ids).not.toContain("card:4");
    });

    it("columns cards and effects alternately, out from the root", () => {
      const { nodes } = toFlowElements(
        [root, other, third],
        [makeEdge("card:1", "card:2"), makeEdge("card:2", "card:4")],
        {
          openEffectIds: new Set([effectId("card:1"), effectId("card:2")]),
        },
      );
      const rankOf = new Map(nodes.map((n) => [n.id, n.data.rank]));
      expect(rankOf.get("card:1")).toBe(0);
      expect(rankOf.get(effectId("card:1"))).toBe(1);
      expect(rankOf.get("card:2")).toBe(2);
      expect(rankOf.get(effectId("card:2"))).toBe(3);
      expect(rankOf.get("card:4")).toBe(4);
    });

    it("keeps a card at its shallowest column when two routes reach it", () => {
      const { nodes } = toFlowElements(
        [root, other, third],
        [
          makeEdge("card:1", "card:2"),
          makeEdge("card:1", "card:4"),
          makeEdge("card:2", "card:4", { sourceText: "Special Summon it." }),
        ],
        {
          openEffectIds: new Set([
            effectId("card:1"),
            effectId("card:2", "Special Summon it."),
          ]),
        },
      );
      const rankOf = new Map(nodes.map((n) => [n.id, n.data.rank]));
      expect(rankOf.get("card:4")).toBe(2);
    });

    it("keeps both directions of a mutual pair as separate edges", () => {
      // Ice Doll / Ice Doll Mirror: a back-edge is an arrow, not a second node.
      const { nodes, edges } = toFlowElements(
        [root, other],
        [
          makeEdge("card:1", "card:2"),
          makeEdge("card:2", "card:1", { sourceText: "Add it back." }),
        ],
        {
          openEffectIds: new Set([
            effectId("card:1"),
            effectId("card:2", "Add it back."),
          ]),
        },
      );
      expect(nodes.filter((n) => n.type === "cardNode")).toHaveLength(2);
      expect(edges.filter((e) => e.target === "card:1")).toHaveLength(1);
    });

    it("renders nothing when no node is flagged as the root", () => {
      const { nodes, edges } = toFlowElements([other], []);
      expect(nodes).toEqual([]);
      expect(edges).toEqual([]);
    });
  });

  describe("archetype filter", () => {
    it("hides off-archetype cards but keeps the root", () => {
      const { nodes } = toFlowElements(
        [root, other, foreign],
        [makeEdge("card:1", "card:2"), makeEdge("card:1", "card:3")],
        {
          archetypeOnly: "Trickstar",
          openEffectIds: new Set([effectId("card:1")]),
        },
      );
      expect(
        nodes.filter((n) => n.type === "cardNode").map((n) => n.id),
      ).toEqual(["card:1", "card:2"]);
    });

    it("drops the effect entirely when every target is filtered out", () => {
      const { nodes, edges } = toFlowElements(
        [root, foreign],
        [makeEdge("card:1", "card:3")],
        { archetypeOnly: "Trickstar" },
      );
      expect(nodes.map((n) => n.id)).toEqual(["card:1"]);
      expect(edges).toEqual([]);
    });
  });

  describe("kind filter", () => {
    it("hides an effect whose kinds are all hidden", () => {
      const { nodes } = toFlowElements(
        [root, other],
        [makeEdge("card:1", "card:2", { kinds: ["DECK_SEARCH"] })],
        { hiddenKinds: new Set<SearchKind>(["DECK_SEARCH"]) },
      );
      expect(nodes.filter((n) => n.type === "effectNode")).toEqual([]);
    });

    it("keeps an effect that still has a visible kind", () => {
      const { nodes } = toFlowElements(
        [root, other],
        [makeEdge("card:1", "card:2", { kinds: ["DECK_SEARCH", "WITH_COST"] })],
        { hiddenKinds: new Set<SearchKind>(["DECK_SEARCH"]) },
      );
      expect(nodes.filter((n) => n.type === "effectNode")).toHaveLength(1);
    });
  });

  describe("the card tile", () => {
    it("marks expanded nodes so the canvas can hide their expand handle", () => {
      const { nodes } = toFlowElements([root], [], {
        expandedIds: new Set(["card:1"]),
      });
      expect(cardData(nodes[0].data).isExpanded).toBe(true);
    });

    it("flags a card that has effects, so it offers those instead of a refetch", () => {
      const { nodes } = toFlowElements(
        [root, other],
        [makeEdge("card:1", "card:2")],
      );
      expect(cardData(nodes[0].data).hasEffects).toBe(true);
    });

    it("flags a frontier card as having nothing left to open locally", () => {
      const { nodes } = toFlowElements(
        [root, other],
        [makeEdge("card:1", "card:2")],
        { openEffectIds: new Set([effectId("card:1")]) },
      );
      const leaf = nodes.find((n) => n.id === "card:2")!;
      expect(cardData(leaf.data).hasEffects).toBe(false);
    });

    it("marks only the pinned card as the locked preview", () => {
      const { nodes } = toFlowElements(
        [root, other],
        [makeEdge("card:1", "card:2")],
        { openEffectIds: new Set([effectId("card:1")]), lockedCardId: 2 },
      );
      const pinned = nodes.find((n) => n.id === "card:2")!;
      expect(cardData(pinned.data).isPeekLocked).toBe(true);
      expect(cardData(nodes[0].data).isPeekLocked).toBe(false);
    });

    it("locks nothing when no card is pinned", () => {
      const { nodes } = toFlowElements([root], []);
      expect(cardData(nodes[0].data).isPeekLocked).toBe(false);
    });

    it("carries the source node payload through for rendering", () => {
      const { nodes } = toFlowElements([root], []);
      expect(cardData(nodes[0].data).node.card?.name).toBe("Card 1");
    });
  });
});
