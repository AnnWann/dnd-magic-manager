import * as React from 'react'
import { cn } from '../../lib/cn'

export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, ...props }, ref) => {
    return (
      <select
        ref={ref}
        className={cn(
          'h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm text-textH focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accentBorder focus-visible:border-accentBorder',
          className,
        )}
        {...props}
      />
    )
  },
)
Select.displayName = 'Select'
