import Link from 'next/link'
import { Sparkles } from 'lucide-react'

export function LandingFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-4 py-10 sm:flex-row lg:px-6">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <span className="font-bold text-foreground">
            Next <span className="text-primary">Deck</span>
          </span>
        </Link>

        <nav className="flex items-center gap-6 text-sm text-muted-foreground">
          <Link href="/cards" className="transition-colors hover:text-primary">
            Browse cards
          </Link>
          <a href="#features" className="transition-colors hover:text-primary">
            Features
          </a>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-primary"
          >
            GitHub
          </a>
        </nav>

        <p className="text-xs text-muted-foreground">
          Built for duelists. Not affiliated with Konami.
        </p>
      </div>
    </footer>
  )
}
