"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/modules/common/components/Dialog/Dialog";
import { SearchGraphPanel } from "../SearchGraphPanel/SearchGraphPanel";

interface SearchGraphDialogProps {
  cardId: number | null;
  cardName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * The graph at full size.
 *
 * Rendered as a SIBLING of CardPreviewDialog rather than nested inside it:
 * nested Radix dialogs stack focus traps and the inner one inherits the
 * outer's size constraints.
 */
export function SearchGraphDialog({
  cardId,
  cardName,
  open,
  onOpenChange,
}: SearchGraphDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[92vh] w-[98vw] max-w-[1800px] flex-col overflow-hidden border-border bg-card p-0 sm:max-w-[1800px]"
        showCloseButton
      >
        <div className="shrink-0 border-b border-border px-4 py-3 pr-12">
          <DialogTitle className="text-base font-semibold">
            {cardName} — Search Graph
          </DialogTitle>
          <DialogDescription className="text-xs">
            What this card can add to your hand, Summon or Set, and what those
            cards reach in turn.
          </DialogDescription>
        </div>

        <div className="min-h-0 flex-1">
          <SearchGraphPanel cardId={cardId} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
