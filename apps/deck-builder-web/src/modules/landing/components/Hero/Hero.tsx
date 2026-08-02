import Link from 'next/link'
import { ArrowRight, Sparkles, Layers } from 'lucide-react'
import { Button } from '@/modules/common/components/Button/Button'
import { Badge } from '@/modules/common/components/Badge/Badge'
import { HeroCardWall } from '@/modules/landing/components/HeroCardWall/HeroCardWall'

interface HeroProps {
  images: string[]
  cardCount: number | null
}

export function Hero({ images, cardCount }: HeroProps) {
  return (
    <section className="relative flex min-h-svh items-center justify-center overflow-hidden">
      <HeroCardWall images={images} />

      <div className="relative z-10 mx-auto flex max-w-3xl flex-col items-center px-4 py-28 text-center">
        <Badge
          variant="outline"
          className="mb-6 animate-in fade-in slide-in-from-bottom-2 gap-1.5 border-primary/40 bg-primary/10 px-3 py-1 text-primary duration-700"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Every card. Every combo.
        </Badge>

        <h1 className="animate-in fade-in slide-in-from-bottom-4 text-balance text-5xl font-extrabold leading-[1.05] tracking-tight text-foreground duration-700 sm:text-6xl md:text-7xl">
          Build the deck
          <br />
          that{' '}
          <span className="bg-linear-to-r from-primary via-primary to-accent bg-clip-text text-transparent">
            actually wins
          </span>
          .
        </h1>

        <p className="mt-6 max-w-xl text-balance text-lg text-muted-foreground animate-in fade-in slide-in-from-bottom-4 duration-1000 sm:text-xl">
          Search the entire Yu-Gi-Oh! card database, filter by anything that
          matters, and forge a tournament-ready deck — all in one fast, focused
          builder.
        </p>

        <div className="mt-10 animate-in fade-in slide-in-from-bottom-4 duration-1000">
          <Button
            asChild
            size="lg"
            className="group h-12 gap-2 px-8 text-base font-semibold neon-glow-cyan transition-transform hover:scale-[1.03]"
          >
            <Link href="/cards">
              Start building your deck
              <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
            </Link>
          </Button>
        </div>

        {cardCount !== null && cardCount > 0 && (
          <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground animate-in fade-in duration-1000">
            <Layers className="h-4 w-4 text-primary" />
            <span className="font-semibold text-foreground">
              {cardCount.toLocaleString()}
            </span>
            cards indexed and counting
          </p>
        )}
      </div>

      {/* Fade the hero into the next section */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 h-24 bg-linear-to-b from-transparent to-background" />
    </section>
  )
}
