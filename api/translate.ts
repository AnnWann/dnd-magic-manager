type Req = {
  method?: string
  body?: unknown
}

type Res = {
  status: (code: number) => Res
  setHeader: (name: string, value: string) => void
  send: (body: string) => void
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

type TranslateBody = {
  texts: string[]
  source?: string
  target?: string
}

type TranslateProvider = 'libre' | 'google'

function ok(res: Res, body: Json, status = 200): void {
  res.status(status)
  res.setHeader('Content-Type', 'application/json')
  res.send(JSON.stringify(body))
}

function decodeHtmlEntities(input: string): string {
  // Google Translate API v2 may return HTML entities in translatedText.
  // Keep this lightweight to avoid extra deps.
  return input
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => {
      const codePoint = Number.parseInt(String(hex), 16)
      if (!Number.isFinite(codePoint)) return _m
      try {
        return String.fromCodePoint(codePoint)
      } catch {
        return _m
      }
    })
    .replace(/&#(\d+);/g, (_m, dec) => {
      const codePoint = Number.parseInt(String(dec), 10)
      if (!Number.isFinite(codePoint)) return _m
      try {
        return String.fromCodePoint(codePoint)
      } catch {
        return _m
      }
    })
}

function getProvider(): TranslateProvider {
  const raw = (process.env.TRANSLATE_PROVIDER || '').trim().toLowerCase()
  if (raw === 'google') return 'google'
  if (raw === 'libre') return 'libre'

  // Default: prefer Google if configured, otherwise keep current LibreTranslate behavior.
  return process.env.GOOGLE_TRANSLATE_API_KEY ? 'google' : 'libre'
}

function getTranslateUrl(): string {
  // You can override to your own LibreTranslate instance
  // libretranslate.de currently redirects; use the canonical host by default.
  return process.env.TRANSLATE_API_URL || 'https://de.libretranslate.com/translate'
}

function getTranslateApiKey(): string | undefined {
  return process.env.TRANSLATE_API_KEY
}

function getGoogleTranslateApiKey(): string | undefined {
  return process.env.GOOGLE_TRANSLATE_API_KEY
}

async function translateOne(args: {
  text: string
  source: string
  target: string
}): Promise<string> {
  const url = getTranslateUrl()
  const apiKey = getTranslateApiKey()

  const payload: Record<string, unknown> = {
    q: args.text,
    source: args.source,
    target: args.target,
    format: 'text',
  }
  if (apiKey) payload.api_key = apiKey

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const contentType = res.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const data = (await res.json().catch(() => null)) as null | { error?: unknown; message?: unknown }
      const msg =
        (typeof data?.error === 'string' && data.error) ||
        (typeof data?.message === 'string' && data.message) ||
        ''
      throw new Error(msg || `HTTP ${res.status}`)
    }

    const text = await res.text().catch(() => '')
    throw new Error(text || `HTTP ${res.status}`)
  }

  const data = (await res.json()) as { translatedText?: unknown }
  if (typeof data.translatedText !== 'string') {
    throw new Error('Resposta inválida do serviço de tradução.')
  }
  return data.translatedText
}

async function translateGoogleBatch(args: {
  texts: string[]
  source: string
  target: string
}): Promise<string[]> {
  const apiKey = getGoogleTranslateApiKey()
  if (!apiKey) {
    throw new Error('Google Translate não configurado. Defina GOOGLE_TRANSLATE_API_KEY.')
  }

  const url = `https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(apiKey)}`
  const payload = {
    q: args.texts,
    source: args.source,
    target: args.target,
    format: 'text',
  }

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!res.ok) {
    const contentType = res.headers.get('content-type') || ''
    if (contentType.includes('application/json')) {
      const data = (await res.json().catch(() => null)) as
        | null
        | { error?: { message?: unknown } | unknown; message?: unknown }
      const errObj = (data && typeof data === 'object' ? (data as any).error : undefined) as
        | undefined
        | { message?: unknown }
      const msg =
        (typeof errObj?.message === 'string' && errObj.message) ||
        (typeof (data as any)?.message === 'string' && (data as any).message) ||
        ''
      throw new Error(msg || `HTTP ${res.status}`)
    }

    const text = await res.text().catch(() => '')
    throw new Error(text || `HTTP ${res.status}`)
  }

  const data = (await res.json()) as unknown
  const translations = (data as any)?.data?.translations
  if (!Array.isArray(translations)) {
    throw new Error('Resposta inválida do Google Translate.')
  }

  const out: string[] = []
  for (const item of translations) {
    const t = (item as any)?.translatedText
    if (typeof t !== 'string') throw new Error('Resposta inválida do Google Translate.')
    out.push(decodeHtmlEntities(t))
  }

  if (out.length !== args.texts.length) {
    throw new Error('Resposta inválida do Google Translate (tamanho inesperado).')
  }
  return out
}

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return ok(res, { error: 'Método não permitido.' }, 405)
  }

  let body: unknown = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body) as unknown
    } catch {
      return ok(res, { error: 'JSON inválido.' }, 400)
    }
  }

  const texts = (body as TranslateBody | null | undefined)?.texts
  const source = ((body as TranslateBody | null | undefined)?.source ?? 'en').toString()
  const target = ((body as TranslateBody | null | undefined)?.target ?? 'pt').toString()

  if (!Array.isArray(texts) || texts.some((t) => typeof t !== 'string')) {
    return ok(res, { error: 'Payload inválido. Use { texts: string[] }.' }, 400)
  }

  // Guardrails to avoid abuse / runaway payload sizes
  const trimmed = texts.map((t) => t.trim()).filter(Boolean)
  if (trimmed.length === 0) return ok(res, { translations: [] })
  if (trimmed.length > 30) return ok(res, { error: 'Limite de 30 blocos por requisição.' }, 400)
  const totalChars = trimmed.reduce((acc, t) => acc + t.length, 0)
  if (totalChars > 20000) return ok(res, { error: 'Texto muito grande para traduzir.' }, 400)

  try {
    const provider = getProvider()
    const translations =
      provider === 'google'
        ? await translateGoogleBatch({ texts: trimmed, source, target })
        : await Promise.all(trimmed.map((text) => translateOne({ text, source, target })))
    return ok(res, { translations })
  } catch (err: unknown) {
    return ok(res, { error: err instanceof Error ? err.message : 'Falha ao traduzir.' }, 502)
  }
}
