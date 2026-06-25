import { cn } from '@/lib/utils'
import { formatBanlistLabel } from '@/modules/common/utils/formatBanlistLabel'

type BanStatus = 'FORBIDDEN' | 'LIMITED' | 'SEMI_LIMITED'

interface BanlistStatusIconProps {
  status: BanStatus
  size?: 'sm' | 'md'
  className?: string
}

const sizeStyles = {
  md: { container: 'w-7 h-7 border-[3px] shadow-lg shadow-black/50', svg: 'w-4 h-4', text: 'text-sm' },
  sm: { container: 'w-4 h-4 border-[2px]', svg: 'w-2.5 h-2.5', text: 'text-[9px]' },
}

function ForbiddenSymbol({ className }: { className: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <circle cx="10" cy="10" r="7.5" stroke="#facc15" strokeWidth="1.75" />
      <line x1="4.5" y1="15.5" x2="15.5" y2="4.5" stroke="#facc15" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function BanlistStatusIcon({ status, size = 'md', className }: BanlistStatusIconProps) {
  const label = formatBanlistLabel(status)
  const styles = sizeStyles[size]

  return (
    <div
      className={cn(
        'flex items-center justify-center rounded-full bg-black border-red-600',
        styles.container,
        className,
      )}
      title={label}
      aria-label={label}
    >
      {status === 'FORBIDDEN' ? (
        <ForbiddenSymbol className={styles.svg} />
      ) : (
        <span className={cn('text-yellow-400 font-black leading-none select-none', styles.text)}>
          {status === 'LIMITED' ? '1' : '2'}
        </span>
      )}
    </div>
  )
}
