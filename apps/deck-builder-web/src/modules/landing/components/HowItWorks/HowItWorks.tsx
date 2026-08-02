import Link from 'next/link'
import { Search, PlusCircle, Swords, ArrowRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/modules/common/components/Button/Button'
import { Reveal } from '@/modules/landing/components/Reveal/Reveal'

interface Step {
  icon: LucideIcon
  title: string
  description: string
}

const STEPS: Step[] = [
  {
    icon: Search,
    title: 'Search & filter',
    description:
      'Dial in the exact cards you want with instant search and stackable filters.',
  },
  {
    icon: PlusCircle,
    title: 'Add to your deck',
    description:
      'One click drops a card into your build — with copy limits and banlist status handled for you.',
  },
  {
    icon: Swords,
    title: 'Tune & dominate',
    description:
      'Refine your ratios, spot the gaps, and take a sharpened deck into your next duel.',
  },
]

export function HowItWorks() {
  return (
    <section className="relative border-y border-border/60 bg-card/30 py-24">
      <div className="mx-auto max-w-6xl px-4 lg:px-6">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            From blank slate to battle-ready in{' '}
            <span className="text-primary">three steps</span>
          </h2>
        </Reveal>

        <div className="relative mt-16 grid gap-10 md:grid-cols-3">
          {/* Connector line across the steps (desktop only) */}
          <div className="pointer-events-none absolute inset-x-[16%] top-8 hidden h-px bg-linear-to-r from-transparent via-primary/40 to-transparent md:block" />

          {STEPS.map((step, i) => (
            <Reveal key={step.title} delay={i * 120} className="relative">
              <div className="flex flex-col items-center text-center">
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-primary/40 bg-background neon-glow-cyan">
                  <step.icon className="h-7 w-7 text-primary" />
                  <span className="absolute -right-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {i + 1}
                  </span>
                </div>
                <h3 className="mt-6 text-xl font-semibold text-foreground">
                  {step.title}
                </h3>
                <p className="mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
                  {step.description}
                </p>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-16 flex justify-center" delay={120}>
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
        </Reveal>
      </div>
    </section>
  )
}
