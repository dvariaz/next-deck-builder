'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Star, Swords, Shield, FileText, ImageIcon } from 'lucide-react'
import type { CardResponseDto } from '@/generated/model'
import { cn } from '@/lib/utils'
import { Dialog, DialogContent, DialogTitle } from '@/modules/common/components/Dialog/Dialog'
import { Badge } from '@/modules/common/components/Badge/Badge'
import { ScrollArea } from '@/modules/common/components/ScrollArea/ScrollArea'
import { AttributeBadge } from '@/modules/cards/components/AttributeBadge/AttributeBadge'
import { BanlistBadge } from '@/modules/cards/components/BanlistBadge/BanlistBadge'
import { CardTypeBadge } from '@/modules/cards/components/CardTypeBadge/CardTypeBadge'
import { BanlistStatusIcon } from '@/modules/common/components/BanlistStatusIcon/BanlistStatusIcon'
import { LinkLevelIcon } from '../LinkLevelIcon/LinkLevelIcon'

interface CardPreviewDialogProps {
  card: CardResponseDto | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CardPreviewDialog({ card, open, onOpenChange }: CardPreviewDialogProps) {
  const [mobileTab, setMobileTab] = useState<'image' | 'details'>('image')

  if (!card) return null

  const imageUrl = card.cardImages[0]?.imageUrl ?? card.cardImages[0]?.imageUrlSmall
  const banStatus = card.banStatusTcg
  const cardLevel = card.level ?? card.linkVal

  const CardImage = () => (
    <div className="flex items-center justify-center h-full w-full bg-black/20 p-4 md:p-6">
      <div className="relative h-full w-full max-w-[520px]" style={{ aspectRatio: '421/614' }}>
        {banStatus && banStatus !== 'UNLIMITED' && (
          <BanlistStatusIcon status={banStatus} className="absolute -top-2.5 -left-2.5 z-10" />
        )}
        {imageUrl ? (
          <Image
            src={imageUrl}
            alt={card.name}
            fill
            sizes="(max-width: 768px) 80vw, 520px"
            className="object-contain rounded-sm"
            unoptimized
            priority
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted rounded-sm">
            <span className="text-muted-foreground text-sm">No Image</span>
          </div>
        )}
      </div>
    </div>
  )

  const CardDetails = () => (
    <div className="flex flex-col h-full min-h-0">
      <div className="p-4 lg:p-6 border-b border-border shrink-0">
        <div className="pr-8">
          <DialogTitle className="text-xl lg:text-2xl font-bold text-foreground text-balance">
            {card.name}
          </DialogTitle>
        </div>
        <div className="flex flex-wrap items-center gap-2 mt-3">
          {banStatus && banStatus !== 'UNLIMITED' && (
            <BanlistBadge status={banStatus} />
          )}
          <CardTypeBadge cardType={card.cardType} spellTrapSubType={card.spellTrapSubType} monsterEffectType={card.monsterEffectType} />
          {card.race && (
            <Badge variant="outline" className="bg-muted/50">{card.race}</Badge>
          )}
          {card.attribute && (
            <AttributeBadge attribute={card.attribute} />
          )}
        </div>
      </div>

      {/* Stats */}
      {card.cardType === 'MONSTER' && (
        <div className="px-4 lg:px-6 py-4 border-b border-border bg-muted/30 shrink-0">
          <div className="grid grid-cols-3 lg:grid-cols-4 gap-3">
            {cardLevel !== undefined && (
              <div className="flex flex-col items-center gap-2 p-2 rounded-lg bg-background/50">
                <div className="flex items-center gap-2 text-amber-400 mb-1">
                  {card.linkVal ? (
                    <>
                      <LinkLevelIcon linkMarkers={card.linkMarkers} size={24} />
                      <span className="text-lg font-bold text-foreground">Link {cardLevel}</span>
                    </>
                  ):(
                  <>
                    <span className="text-lg font-bold text-foreground">Level</span>
                    <div className='flex items-center gap-1'>
                      <Star className="h-4 w-4 fill-current" />
                      <span className="text-lg font-bold text-foreground">{cardLevel}</span>
                    </div>
                  </>
                )}
                </div>
              </div>
            )}
            {(card.isTuner) && (
              <div className="flex justify-center items-center p-2 rounded-lg bg-background/50">
                <span className="text-lg font-bold text-foreground">Tuner</span>
              </div>
            )}
            {(card.isFlip) && (
              <div className="flex justify-center items-center p-2 rounded-lg bg-background/50">
                <span className="text-lg font-bold text-foreground">Flip</span>
              </div>
            )}
            {(card.atk !== undefined) && (card.atk !== null) && (
              <div className="flex justify-center items-center gap-2 p-2 rounded-lg bg-background/50">
                <Swords className="h-4 w-4 text-red-400" />
                <span className="text-lg font-bold text-foreground">{card.atk >= 0 ? card.atk : '?'}</span>
                <span className="text-sm font-bold text-foreground">ATK</span>
              </div>
            )}
            {(card.def !== undefined) && (card.def !== null) && (
              <div className="flex items-center gap-2 p-2 rounded-lg bg-background/50">
                <Shield className="h-4 w-4 text-blue-400" />
                <span className="text-lg font-bold text-foreground">{card.def >= 0 ? card.def : '?'}</span>
                <span className="text-sm font-bold text-foreground">DEF</span>
              </div>
            )}
          </div>
        </div>
      )}

      <ScrollArea className="flex-1 min-h-0">
        <div className="p-4 lg:p-6 space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-muted-foreground mb-2">Card Text</h4>
            <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{card.description}</p>
          </div>

          <div className="pt-4 border-t border-border space-y-3">
            {card.archetype && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Archetype:</span>
                <Badge variant="secondary" className="bg-primary/10 text-primary">{card.archetype}</Badge>
              </div>
            )}
          </div>

          {card.cardSets && card.cardSets.length > 0 && (
            <div className="pt-4 border-t border-border">
              <h4 className="text-sm font-semibold text-muted-foreground mb-2">Card Sets</h4>
              <div className="space-y-1.5">
                {card.cardSets.map((set) => (
                  <div key={set.id} className="flex items-center justify-between text-xs gap-3 py-1">
                    <span className="text-foreground font-medium truncate">{set.setName}</span>
                    <div className="flex items-center gap-2 shrink-0 text-muted-foreground">
                      <span>{set.setCode}</span>
                      <span>·</span>
                      <span>{set.setRarity}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[98vw] max-w-[1400px] sm:max-w-[1400px] h-[90vh] md:h-[80vh] p-0 overflow-hidden bg-card border-border flex flex-col" showCloseButton>
        {/* Mobile tabs */}
        <div className="flex border-b border-border shrink-0 md:hidden">
          <button
            onClick={() => setMobileTab('image')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors',
              mobileTab === 'image' ? 'text-primary border-b-2 border-primary bg-primary/5' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            <ImageIcon className="h-4 w-4" /> Card Image
          </button>
          <button
            onClick={() => setMobileTab('details')}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors',
              mobileTab === 'details' ? 'text-primary border-b-2 border-primary bg-primary/5' : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
            )}
          >
            <FileText className="h-4 w-4" /> Details
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-hidden md:hidden">
          {mobileTab === 'image' ? <CardImage /> : <CardDetails />}
        </div>
        <div className="hidden md:flex flex-1 min-h-0">
          <div className="w-1/2 shrink-0 border-r border-border"><CardImage /></div>
          <div className="w-1/2 flex flex-col min-h-0 min-w-0"><CardDetails /></div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
