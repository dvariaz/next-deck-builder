import { Database, SlidersHorizontal, Search, ShieldCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Reveal } from '@/modules/landing/components/Reveal/Reveal'

interface Feature {
  icon: LucideIcon
  title: string
  description: string
}

const FEATURES: Feature[] = [
  {
    icon: Database,
    title: 'The whole card pool',
    description:
      'Every monster, spell, and trap with official art, stats, and set data — kept in sync so you never build around a card that doesn’t exist.',
  },
  {
    icon: SlidersHorizontal,
    title: 'Filters that go deep',
    description:
      'Slice by attribute, type, race, ATK/DEF, level, link markers, archetype and ban status. Stack them to surface exactly the tech you need.',
  },
  {
    icon: Search,
    title: 'Search that keeps up',
    description:
      'Multi-word, order-independent search finds the card while you’re still typing — “Primite Ether” lands on Primite Dragon Ether Beryl instantly.',
  },
  {
    icon: ShieldCheck,
    title: 'Banlist-aware building',
    description:
      'TCG and OCG limits are baked in, so forbidden and limited cards are flagged the moment they hit your deck.',
  },
]

export function Features() {
  return (
    <section id="features" className="relative mx-auto max-w-6xl px-4 py-24 lg:px-6">
      <Reveal className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
          Everything you need to{' '}
          <span className="text-primary">out-build</span> the meta
        </h2>
        <p className="mt-4 text-lg text-muted-foreground">
          A builder tuned for the way duelists actually think — fast, precise,
          and out of your way.
        </p>
      </Reveal>

      <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {FEATURES.map((feature, i) => (
          <Reveal key={feature.title} delay={i * 90}>
            <article className="group h-full rounded-xl border border-border bg-card p-6 transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-xl hover:shadow-primary/10">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/15 text-primary transition-all duration-300 group-hover:neon-glow-cyan">
                <feature.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-foreground">
                {feature.title}
              </h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  )
}
