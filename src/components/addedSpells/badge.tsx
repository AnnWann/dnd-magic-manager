import type { ReactNode } from 'react'

export function badge(
  text: string,
  opts?: { title?: string; limit?: boolean; kind?: 'inline' | 'grid' },
): ReactNode {
  const base =
    'items-center rounded-md border border-accentBorder bg-accentBg px-2 py-1 text-xs leading-4 text-textH whitespace-nowrap'
  const inline = 'inline-flex flex-none'
  const grid = 'inline-flex min-w-0 justify-self-start'
  const limit = 'max-w-[380px] truncate'
  const gridLimit = 'max-w-[380px] truncate'
  return (
    <span
      className={`${base} ${opts?.kind === 'grid' ? grid : inline}${opts?.kind === 'grid' ? ` ${gridLimit}` : opts?.limit ? ` ${limit}` : ''}`}
      title={opts?.title ?? (opts?.limit ? text : undefined)}
    >
      {text}
    </span>
  )
}
