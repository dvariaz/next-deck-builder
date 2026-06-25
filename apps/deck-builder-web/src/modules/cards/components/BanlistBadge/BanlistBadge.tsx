import { cn } from '@/lib/utils'
import { Badge } from '@/modules/common/components/Badge/Badge'
import { BanlistStatusIcon } from '@/modules/common/components/BanlistStatusIcon/BanlistStatusIcon'
import { formatBanlistLabel } from '@/modules/common/utils/formatBanlistLabel'

type BanStatus = 'FORBIDDEN' | 'LIMITED' | 'SEMI_LIMITED'

interface BanlistBadgeProps {
  status: BanStatus
}

const banlistStyles: Record<BanStatus, string> = {
  FORBIDDEN: 'bg-red-500/20 text-red-400 border-red-500/30',
  LIMITED: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  SEMI_LIMITED: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
}

export function BanlistBadge({ status }: BanlistBadgeProps) {
  return (
    <Badge variant="outline" className={cn('flex items-center gap-2', banlistStyles[status])}>
      <BanlistStatusIcon status={status} size="sm" />
      {formatBanlistLabel(status)}
    </Badge>
  )
}
