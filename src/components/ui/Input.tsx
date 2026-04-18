import * as React from 'react'
import { cn } from '../../lib/cn'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          'h-10 w-full rounded-lg border border-border bg-bg px-3 text-sm text-textH placeholder:text-text/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accentBorder focus-visible:border-accentBorder',
          className,
        )}
        {...props}
      />
    )
  },
)
Input.displayName = 'Input'
