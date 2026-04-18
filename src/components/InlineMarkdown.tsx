import { Fragment, type ReactNode } from 'react'

export function InlineMarkdown(props: { text: string }) {
  return <>{renderInlineMarkdown(props.text)}</>
}

type Token = '***' | '**' | '*'

function renderInlineMarkdown(text: string): ReactNode {
  function parseUntil(
    input: string,
    startIndex: number,
    stopToken?: Token,
  ): { nodes: ReactNode[]; i: number; closed: boolean } {
    const nodes: ReactNode[] = []
    let i = startIndex

    const pushText = (s: string) => {
      if (!s) return
      nodes.push(s)
    }

    while (i < input.length) {
      if (stopToken && input.startsWith(stopToken, i)) {
        return { nodes, i: i + stopToken.length, closed: true }
      }

      const star = input.indexOf('*', i)
      if (star === -1) {
        pushText(input.slice(i))
        return { nodes, i: input.length, closed: false }
      }

      if (star > i) pushText(input.slice(i, star))

      let token: Token | null = null
      if (input.startsWith('***', star)) token = '***'
      else if (input.startsWith('**', star)) token = '**'
      else token = '*'

      const inner = parseUntil(input, star + token.length, token)
      if (!inner.closed) {
        // No closing token: treat marker literally
        pushText(token)
        i = star + token.length
        continue
      }

      const children = <>{inner.nodes}</>
      if (token === '***') nodes.push(
        <strong key={`b+i:${star}`}>
          <em>{children}</em>
        </strong>,
      )
      else if (token === '**') nodes.push(<strong key={`b:${star}`}>{children}</strong>)
      else nodes.push(<em key={`i:${star}`}>{children}</em>)

      i = inner.i
    }

    return { nodes, i, closed: false }
  }

  const lines = text.split('\n')
  const out: ReactNode[] = []
  lines.forEach((line, idx) => {
    const parsed = parseUntil(line, 0)
    out.push(<Fragment key={`l:${idx}`}>{parsed.nodes}</Fragment>)
    if (idx !== lines.length - 1) out.push(<br key={`br:${idx}`} />)
  })
  return <>{out}</>
}
