export function CardSkeleton() {
  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden animate-pulse">
      <div className="aspect-421/614 w-full bg-muted" />
      <div className="p-2 space-y-2">
        <div className="h-3.5 w-3/4 rounded bg-muted" />
        <div className="flex items-center gap-2">
          <div className="h-3 w-8 rounded bg-muted" />
          <div className="h-3 w-10 rounded bg-muted" />
        </div>
      </div>
    </div>
  )
}

export function CardGridSkeleton({ count = 15 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </>
  )
}
