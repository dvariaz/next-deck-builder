import { ChevronRight, Pin } from "lucide-react";

/** Explains the markers that are not self-evident. */
export function SearchGraphLegend({ canPeek = false }: { canPeek?: boolean }) {
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 z-10 flex flex-col gap-1 rounded-md border border-border bg-card/85 px-2 py-1.5 text-[10px] text-muted-foreground backdrop-blur-sm">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-2 w-2 rounded-full ring-2 ring-primary/60" />
        Root card
      </span>
      <span className="flex items-center gap-1.5">
        <ChevronRight className="h-3 w-3 text-primary" />
        Open an effect to see what it reaches
      </span>
      {canPeek && (
        <span className="flex items-center gap-1.5">
          <Pin className="h-3 w-3 text-primary" />
          Hover a card to preview it; pin to keep it
        </span>
      )}
    </div>
  );
}
