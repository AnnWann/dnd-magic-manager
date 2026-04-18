import * as React from 'react'
import { cn } from '../../lib/cn'

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        className={cn(
          'min-h-24 w-full rounded-lg border border-border bg-bg px-3 py-2 text-sm text-textH placeholder:text-text/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accentBorder focus-visible:border-accentBorder',
          className,
        )}
        {...props}
      />
    )
  },
)
Textarea.displayName = 'Textarea'
