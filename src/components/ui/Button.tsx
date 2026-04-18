import * as React from 'react'
import { cn } from '../../lib/cn'

type Variant = 'primary' | 'secondary' | 'ghost'

type Size = 'sm' | 'md'

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
}

export function Button({
  className,
  variant = 'secondary',
  size = 'md',
  ...props
}: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-lg border px-3 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50'

  const variants: Record<Variant, string> = {
    primary:
      'border-accentBorder bg-accentBg text-textH hover:bg-[color:var(--accent-bg)]',
    secondary:
      'border-border bg-bg text-textH hover:bg-[color:var(--social-bg)]',
    ghost: 'border-transparent bg-transparent text-textH hover:bg-[color:var(--social-bg)]',
  }

  const sizes: Record<Size, string> = {
    sm: 'h-8 text-xs',
    md: 'h-10 text-sm',
  }

  return (
    <button
      className={cn(base, variants[variant], sizes[size], className)}
      {...props}
    />
  )
}
