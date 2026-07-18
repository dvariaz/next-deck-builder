'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Swords, Shield, Star, Check } from 'lucide-react'
import type { CardResponseDto } from '@/generated/model'
import { formatCardTypeLabel } from '@/modules/cards/utils/formatCardType'
import { BanlistStatusIcon } from '@/modules/common/components/BanlistStatusIcon/BanlistStatusIcon'
import { LinkLevelIcon } from '@/modules/cards/components/LinkLevelIcon/LinkLevelIcon'
import { CardItemOverlay } from '@/modules/cards/components/CardItemOverlay/CardItemOverlay'
import { cn } from '@/lib/utils'

interface CardItemProps {
  card: CardResponseDto
  priority?: boolean
  onPreview: (card: CardResponseDto) => void
  className?: string
  style?: React.CSSProperties
}

export function CardItem({ card, priority = false, onPreview, className, style }: CardItemProps) {
  const [isHovered, setIsHovered] = useState(false)
  const [imageError, setImageError] = useState(false)
  const [isFullImageLoaded, setIsFullImageLoaded] = useState(false)
  const [flyAnimation, setFlyAnimation] = useState(false)
  const [feedback, setFeedback] = useState<{ show: boolean; success: boolean; message: string }>({
    show: false, success: false, message: '',
  })

  const imageUrl = card.cardImages[0]?.imageUrl
  const smallImageUrl = card.cardImages[0]?.imageUrlSmall
  const banStatus = card.banStatusTcg

  const handleAdded = (result: { success: boolean; message: string }) => {
    setFeedback({ show: true, success: result.success, message: result.message })
    setTimeout(() => setFeedback({ show: false, success: false, message: '' }), 1500)
    if (result.success) {
      setFlyAnimation(true)
      setTimeout(() => setFlyAnimation(false), 500)
    }
  }

  return (
    <div
      className={cn(
        'group relative flex flex-col cursor-pointer bg-card border border-border',
        isHovered && 'shadow-xl shadow-primary/10 border-primary/50',
        className,
      )}
      style={style}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onPreview(card)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onPreview(card)
        }
      }}
      aria-label={`View details for ${card.name}`}
    >
      {flyAnimation && (
        <div className="absolute inset-0 z-50 pointer-events-none">
          <div className="absolute inset-0 animate-fly-to-deck">
            <div className="w-full h-full bg-primary/30 rounded-lg" />
          </div>
        </div>
      )}

      {feedback.show && (
        <div className={cn(
          'absolute top-2 left-1/2 -translate-x-1/2 z-50 px-3 py-1.5 rounded-full text-xs font-medium shadow-lg animate-in fade-in slide-in-from-top-2 duration-200 whitespace-nowrap',
          feedback.success ? 'bg-green-500 text-white' : 'bg-destructive text-destructive-foreground',
        )}>
          {feedback.success ? (
            <span className="flex items-center gap-1"><Check className="h-3 w-3" /> Added!</span>
          ) : (
            feedback.message
          )}
        </div>
      )}

      <div className="relative aspect-421/614 w-full bg-muted @container">
        {!imageError && imageUrl ? (
          <>
            {smallImageUrl && (
              <Image
                src={smallImageUrl}
                alt=""
                aria-hidden="true"
                fill
                sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 20vw"
                className={cn(
                  'object-contain transition-opacity duration-300',
                  isFullImageLoaded ? 'opacity-0' : 'opacity-100',
                )}
                unoptimized
                priority={priority}
              />
            )}
            <Image
              src={imageUrl}
              alt={card.name}
              fill
              sizes="(max-width: 640px) 45vw, (max-width: 1024px) 30vw, 20vw"
              className={cn(
                'object-contain transition-opacity duration-300',
                isFullImageLoaded ? 'opacity-100' : 'opacity-0',
              )}
              onLoad={() => setIsFullImageLoaded(true)}
              onError={() => setImageError(true)}
              unoptimized
            />
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="text-muted-foreground text-xs">No Image</span>
          </div>
        )}

        {(banStatus === 'FORBIDDEN' || banStatus === 'LIMITED' || banStatus === 'SEMI_LIMITED') && (
          <BanlistStatusIcon status={banStatus} className="absolute -top-2.5 -left-2.5 z-10" />
        )}

        <CardItemOverlay
          card={card}
          isHovered={isHovered}
          onAdded={handleAdded}
        />
      </div>

      <div className="p-2 space-y-1.5 bg-card">
        <h3 className="font-semibold text-sm text-foreground line-clamp-1 leading-tight">{card.name}</h3>
        <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            {card.cardType === 'MONSTER' && (
              <>
                {card.linkVal ? (
                  <span className="flex items-center gap-0.5">
                    <LinkLevelIcon linkMarkers={card.linkMarkers ?? []} size={16} /> {card.linkVal}
                  </span>
                ) : card.level ? (
                  <span className="flex items-center gap-0.5 text-amber-400">
                    <Star className="h-3 w-3 fill-amber-400" />{card.level}
                  </span>
                ) : null}
                {(card.atk !== undefined) && (card.atk !== null) && (
                  <span className="flex items-center gap-0.5 text-red-400">
                    <Swords className="h-3 w-3" />{card.atk >= 0 ? card.atk : '?'}
                  </span>
                )}
                {(card.def !== undefined) && (card.def !== null) && (
                  <span className="flex items-center gap-0.5 text-blue-400">
                    <Shield className="h-3 w-3" />{card.def >= 0 ? card.def : '?'}
                  </span>
                )}
              </>
            )}
            {card.cardType !== 'MONSTER' && (
              <span className="capitalize">{formatCardTypeLabel(card)}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
