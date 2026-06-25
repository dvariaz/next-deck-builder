'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/modules/common/components/Collapsible/Collapsible'
import { cn } from '@/lib/utils'

interface FilterSectionProps {
  title: string
  badge?: number
  defaultOpen?: boolean
  children: React.ReactNode
}

export function FilterSection({ title, badge, defaultOpen = true, children }: FilterSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger className="flex w-full items-center justify-between rounded-md px-1 py-2.5 text-sm font-medium transition-colors hover:bg-muted/50">
        <span className="flex items-center gap-2">
          {title}
          {badge !== undefined && badge > 0 && (
            <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/20 px-1.5 text-xs text-primary">
              {badge}
            </span>
          )}
        </span>
        <ChevronDown className={cn('h-4 w-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </CollapsibleTrigger>
      <CollapsibleContent className="px-1 pb-3 pt-1">
        {children}
      </CollapsibleContent>
    </Collapsible>
  )
}
