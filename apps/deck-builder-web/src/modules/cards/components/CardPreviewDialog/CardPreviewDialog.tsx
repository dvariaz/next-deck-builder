"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import {
  Eye,
  FileText,
  ImageIcon,
  Network,
  Pin,
  Shield,
  Star,
  Swords,
  Undo2,
} from "lucide-react";
import type { CardResponseDto, SearchGraphCardDto } from "@/generated/model";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/modules/common/components/Dialog/Dialog";
import { Badge } from "@/modules/common/components/Badge/Badge";
import { ScrollArea } from "@/modules/common/components/ScrollArea/ScrollArea";
import { AttributeBadge } from "@/modules/cards/components/AttributeBadge/AttributeBadge";
import { BanlistBadge } from "@/modules/cards/components/BanlistBadge/BanlistBadge";
import { CardTypeBadge } from "@/modules/cards/components/CardTypeBadge/CardTypeBadge";
import { BanlistStatusIcon } from "@/modules/common/components/BanlistStatusIcon/BanlistStatusIcon";
import { SearchGraphDialog } from "@/modules/search-graph/containers/SearchGraphDialog/SearchGraphDialog";
import { SearchGraphPanel } from "@/modules/search-graph/containers/SearchGraphPanel/SearchGraphPanel";
import { LinkLevelIcon } from "../LinkLevelIcon/LinkLevelIcon";

type PreviewTab = "image" | "details" | "graph";

interface CardPreviewDialogProps {
  card: CardResponseDto | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Declared at MODULE scope, not inside the dialog's render body.
 *
 * As nested functions these were a fresh component type on every render, so
 * they remounted whenever a tab changed. That cost only an image flash before;
 * with React Flow in the tree it would destroy the canvas viewport and re-run
 * the layout on every toggle.
 */
function CardArt({
  name,
  imageUrl,
  banStatus,
  priority,
  className,
}: {
  name: string;
  imageUrl?: string | null;
  banStatus?: string | null;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn("relative h-full w-full max-w-[520px]", className)}
      style={{ aspectRatio: "421/614" }}
    >
      {banStatus && banStatus !== "UNLIMITED" && (
        <BanlistStatusIcon
          status={banStatus as "FORBIDDEN" | "LIMITED" | "SEMI_LIMITED"}
          className="absolute -top-2.5 -left-2.5 z-10"
        />
      )}
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={name}
          fill
          sizes="(max-width: 768px) 80vw, 520px"
          className="rounded-sm object-contain"
          unoptimized
          priority={priority}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center rounded-sm bg-muted">
          <span className="text-sm text-muted-foreground">No Image</span>
        </div>
      )}
    </div>
  );
}

/**
 * The image half of the dialog, which doubles as the target for graph peeks.
 *
 * A peek borrows this space rather than opening yet another dialog, so the
 * graph stays put underneath it. It has to read as on loan: tinted ground,
 * a dashed frame and a banner.
 *
 * Two flavours, because they are dismissed differently. A hovered peek is
 * transient - the pointer leaving restores the card, so it needs no controls
 * at all. A pinned one outlives the pointer, so it gets the unpin button and
 * the dialog's own card as a thumbnail, making the way back one click and
 * never a hunt.
 */
function CardImagePane({
  card,
  peek,
  isPeekLocked,
  onClearPeek,
}: {
  card: CardResponseDto;
  peek: SearchGraphCardDto | null;
  isPeekLocked: boolean;
  onClearPeek: () => void;
}) {
  const ownImage =
    card.cardImages[0]?.imageUrl ?? card.cardImages[0]?.imageUrlSmall;

  if (!peek) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black/20 p-4 md:p-6">
        <CardArt
          name={card.name}
          imageUrl={ownImage}
          banStatus={card.banStatusTcg}
          priority
        />
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-primary/5">
      <div className="flex shrink-0 items-center gap-2 border-b border-primary/30 bg-primary/10 px-3 py-2">
        {isPeekLocked ? (
          <Pin className="h-3.5 w-3.5 shrink-0 text-primary" />
        ) : (
          <Eye className="h-3.5 w-3.5 shrink-0 text-primary" />
        )}
        <span className="shrink-0 text-xs font-medium tracking-wide text-primary uppercase">
          {isPeekLocked ? "Pinned" : "Preview"}
        </span>
        <span className="truncate text-xs text-muted-foreground">
          {peek.name}
        </span>
        {isPeekLocked && (
          <button
            type="button"
            onClick={onClearPeek}
            className="ml-auto shrink-0 rounded-md px-1.5 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
          >
            Unpin
          </button>
        )}
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center p-4 md:p-6">
        <CardArt
          name={peek.name}
          imageUrl={peek.imageUrl ?? peek.imageUrlSmall}
          banStatus={peek.banStatusTcg}
          className={cn(
            "rounded-md border-2 p-1.5",
            isPeekLocked
              ? "border-primary/70"
              : "border-dashed border-primary/50",
          )}
        />

        {isPeekLocked && (
          <button
            type="button"
            onClick={onClearPeek}
            title={`Back to ${card.name}`}
            aria-label={`Back to ${card.name}`}
            className="group absolute bottom-3 left-3 flex items-center gap-2 rounded-md border border-border bg-card/90 p-1.5 text-left backdrop-blur-sm transition-colors hover:border-primary"
          >
            <span
              className="relative block w-10 shrink-0 overflow-hidden rounded-sm bg-black/20"
              style={{ aspectRatio: "421/614" }}
            >
              {ownImage ? (
                <Image
                  src={ownImage}
                  alt={card.name}
                  fill
                  sizes="40px"
                  className="object-contain"
                  unoptimized
                />
              ) : null}
            </span>
            <span className="hidden max-w-[140px] flex-col pr-1 sm:flex">
              <span className="flex items-center gap-1 text-[10px] text-muted-foreground group-hover:text-primary">
                <Undo2 className="h-3 w-3" />
                Back to
              </span>
              <span className="truncate text-[11px] font-medium text-foreground">
                {card.name}
              </span>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}

function MonsterFlag({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center rounded-lg bg-background/50 p-2">
      <span className="text-lg font-bold text-foreground">{label}</span>
    </div>
  );
}

function CardDetails({ card }: { card: CardResponseDto }) {
  const banStatus = card.banStatusTcg;
  const cardLevel = card.level ?? card.linkVal;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-border p-4 lg:p-6">
        <div className="pr-8">
          <h3 className="text-xl font-bold text-balance text-foreground lg:text-2xl">
            {card.name}
          </h3>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {banStatus && banStatus !== "UNLIMITED" && (
            <BanlistBadge status={banStatus} />
          )}
          <CardTypeBadge
            cardType={card.cardType}
            spellTrapSubType={card.spellTrapSubType}
            monsterEffectType={card.monsterEffectType}
          />
          {card.race && (
            <Badge variant="outline" className="bg-muted/50">
              {card.race}
            </Badge>
          )}
          {card.attribute && <AttributeBadge attribute={card.attribute} />}
        </div>
      </div>

      {card.cardType === "MONSTER" && (
        <div className="shrink-0 border-b border-border bg-muted/30 px-4 py-4 lg:px-6">
          <div className="grid grid-cols-3 gap-3 lg:grid-cols-4">
            {cardLevel !== undefined && (
              <div className="flex flex-col items-center gap-2 rounded-lg bg-background/50 p-2">
                <div className="mb-1 flex items-center gap-2 text-amber-400">
                  {card.linkVal ? (
                    <>
                      <LinkLevelIcon linkMarkers={card.linkMarkers} size={24} />
                      <span className="text-lg font-bold text-foreground">
                        Link {cardLevel}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="text-lg font-bold text-foreground">
                        Level
                      </span>
                      <div className="flex items-center gap-1">
                        <Star className="h-4 w-4 fill-current" />
                        <span className="text-lg font-bold text-foreground">
                          {cardLevel}
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
            {card.isTuner && <MonsterFlag label="Tuner" />}
            {card.isFlip && <MonsterFlag label="Flip" />}
            {card.isToon && <MonsterFlag label="Toon" />}
            {card.isSpirit && <MonsterFlag label="Spirit" />}
            {card.isUnion && <MonsterFlag label="Union" />}
            {card.isGemini && <MonsterFlag label="Gemini" />}
            {card.atk !== undefined && card.atk !== null && (
              <div className="flex items-center justify-center gap-2 rounded-lg bg-background/50 p-2">
                <Swords className="h-4 w-4 text-red-400" />
                <span className="text-lg font-bold text-foreground">
                  {card.atk >= 0 ? card.atk : "?"}
                </span>
                <span className="text-sm font-bold text-foreground">ATK</span>
              </div>
            )}
            {card.def !== undefined && card.def !== null && (
              <div className="flex items-center gap-2 rounded-lg bg-background/50 p-2">
                <Shield className="h-4 w-4 text-blue-400" />
                <span className="text-lg font-bold text-foreground">
                  {card.def >= 0 ? card.def : "?"}
                </span>
                <span className="text-sm font-bold text-foreground">DEF</span>
              </div>
            )}
          </div>
        </div>
      )}

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-4 p-4 lg:p-6">
          <div>
            <h4 className="mb-2 text-sm font-semibold text-muted-foreground">
              Card Text
            </h4>
            <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
              {card.description}
            </p>
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            {card.archetype && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">
                  Archetype:
                </span>
                <Badge
                  variant="secondary"
                  className="bg-primary/10 text-primary"
                >
                  {card.archetype}
                </Badge>
              </div>
            )}
          </div>
        </div>
      </ScrollArea>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon: Icon,
  children,
  className,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof FileText;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center justify-center gap-2 py-3 text-sm font-medium transition-colors",
        active
          ? "border-b-2 border-primary bg-primary/5 text-primary"
          : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
        className,
      )}
    >
      <Icon className="h-4 w-4" />
      {children}
    </button>
  );
}

export function CardPreviewDialog({
  card,
  open,
  onOpenChange,
}: CardPreviewDialogProps) {
  const [tab, setTab] = useState<PreviewTab>("image");
  const [desktopTab, setDesktopTab] =
    useState<Exclude<PreviewTab, "image">>("details");
  const [fullScreenGraph, setFullScreenGraph] = useState(false);

  /**
   * Hover and pin are tracked apart, not collapsed into one "current peek".
   *
   * A pin has to win over whatever the pointer wanders across afterwards, and
   * it has to survive the pointer leaving the canvas entirely - which is a
   * `hovered` reset. Keeping the hover recorded underneath also means
   * unpinning lands on the card under the pointer rather than blinking
   * through the dialog's own card first.
   */
  const [hovered, setHovered] = useState<SearchGraphCardDto | null>(null);
  const [pinned, setPinned] = useState<SearchGraphCardDto | null>(null);
  const peek = pinned ?? hovered;

  const cardId = card?.id;

  // A different card starts fresh rather than stranding the user on a tab
  // that made sense for the previous card, or on a peek belonging to the
  // graph of the card that is no longer open.
  useEffect(() => {
    if (cardId == null) return;
    setTab("image");
    setDesktopTab("details");
    setHovered(null);
    setPinned(null);
  }, [cardId]);

  const handlePeek = useCallback((peeked: SearchGraphCardDto | null) => {
    setHovered(peeked);
  }, []);

  // On mobile the image is a tab of its own - and hover does not exist there
  // at all - so pinning has to bring the image forward or the preview would
  // land somewhere the user cannot see.
  const handleTogglePeekLock = useCallback((peeked: SearchGraphCardDto) => {
    setPinned((current) => (current?.id === peeked.id ? null : peeked));
    setTab("image");
  }, []);

  const clearPeek = useCallback(() => {
    setPinned(null);
    setHovered(null);
  }, []);

  if (!card) return null;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="flex h-[90vh] w-[98vw] max-w-[1400px] flex-col overflow-hidden border-border bg-card p-0 sm:max-w-[1400px] md:h-[80vh]"
          showCloseButton
        >
          {/* The accessible name lives here rather than in CardDetails, so it
              is present on every tab. */}
          <DialogTitle className="sr-only">{card.name}</DialogTitle>
          <DialogDescription className="sr-only">
            Card details and search graph for {card.name}.
          </DialogDescription>

          {/* Mobile */}
          <div className="flex shrink-0 border-b border-border md:hidden">
            <TabButton
              active={tab === "image"}
              onClick={() => setTab("image")}
              icon={ImageIcon}
            >
              Card Image
            </TabButton>
            <TabButton
              active={tab === "details"}
              onClick={() => setTab("details")}
              icon={FileText}
            >
              Details
            </TabButton>
            <TabButton
              active={tab === "graph"}
              onClick={() => setTab("graph")}
              icon={Network}
            >
              Search
            </TabButton>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden md:hidden">
            {tab === "image" && (
              <CardImagePane
                card={card}
                peek={peek}
                isPeekLocked={!!pinned}
                onClearPeek={clearPeek}
              />
            )}
            {tab === "details" && <CardDetails card={card} />}
            {tab === "graph" && (
              <SearchGraphPanel
                cardId={card.id}
                onOpenFullScreen={() => setFullScreenGraph(true)}
                onPeekCard={handlePeek}
                onTogglePeekLock={handleTogglePeekLock}
                lockedCardId={pinned?.id ?? null}
              />
            )}
          </div>

          {/* Desktop: image on the left, details or graph on the right */}
          <div className="hidden min-h-0 flex-1 md:flex">
            <div className="w-1/2 shrink-0 border-r border-border">
              <CardImagePane
                card={card}
                peek={peek}
                isPeekLocked={!!pinned}
                onClearPeek={clearPeek}
              />
            </div>

            <div className="flex w-1/2 min-h-0 min-w-0 flex-col">
              <div className="flex shrink-0 border-b border-border">
                <TabButton
                  active={desktopTab === "details"}
                  onClick={() => setDesktopTab("details")}
                  icon={FileText}
                >
                  Details
                </TabButton>
                <TabButton
                  active={desktopTab === "graph"}
                  onClick={() => setDesktopTab("graph")}
                  icon={Network}
                >
                  Search Graph
                </TabButton>
              </div>

              <div className="min-h-0 flex-1">
                {desktopTab === "details" ? (
                  <CardDetails card={card} />
                ) : (
                  <SearchGraphPanel
                    cardId={card.id}
                    onOpenFullScreen={() => setFullScreenGraph(true)}
                    onPeekCard={handlePeek}
                    onTogglePeekLock={handleTogglePeekLock}
                    lockedCardId={pinned?.id ?? null}
                  />
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* A sibling, not a nested dialog: nesting stacks focus traps and the
          inner dialog inherits the outer's size constraints. */}
      <SearchGraphDialog
        cardId={card.id}
        cardName={card.name}
        open={fullScreenGraph}
        onOpenChange={setFullScreenGraph}
      />
    </>
  );
}
