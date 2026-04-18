import { neon } from '@neondatabase/serverless'
import type { NeonQueryFunction } from '@neondatabase/serverless'

type Json = null | boolean | number | string | Json[] | { [key: string]: Json }

type AppState = {
  version: 1
  characters: Json
  activeCharacterId: Json
}

type Req = {
  method?: string
  query?: Record<string, string | string[] | undefined>
  body?: unknown
}

type Res = {
  status: (code: number) => Res
  setHeader: (name: string, value: string) => void
  send: (body: string) => void
}

function firstQueryValue(value: string | string[] | undefined): string {
  if (!value) return ''
  if (Array.isArray(value)) return value[0] ?? ''
  return value
}

function getKeyFromReq(req: Req): string {
  const key = firstQueryValue(req.query?.key) || firstQueryValue(req.query?.k)
  return key
}

function isValidKey(key: string): boolean {
  // Simple guard to avoid trivial keys
  return key.trim().length >= 12
}

function getPostgresUrl(): string | undefined {
  // Vercel/Neon commonly provide one of these
  return (
    process.env.POSTGRES_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL
  )
}

async function ensureTable<ArrayMode extends boolean, FullResults extends boolean>(
  sql: NeonQueryFunction<ArrayMode, FullResults>,
): Promise<void> {
  await sql`
    CREATE TABLE IF NOT EXISTS dndmm_state (
      key TEXT PRIMARY KEY,
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `
}

function ok(res: Res, body: Json, status = 200): void {
  res.status(status)
  res.setHeader('Content-Type', 'application/json')
  res.send(JSON.stringify(body))
}

export default async function handler(req: Req, res: Res) {
  const key = getKeyFromReq(req)
  if (!isValidKey(key)) {
    return ok(res, { error: 'Chave inválida (mínimo 12 caracteres).' }, 400)
  }

  const postgresUrl = getPostgresUrl()
  if (!postgresUrl) {
    return ok(
      res,
      {
        error:
          'Banco não configurado. Defina POSTGRES_URL (ou DATABASE_URL) nas variáveis de ambiente.',
      },
      500,
    )
  }

  const sql = neon(postgresUrl)
  await ensureTable(sql)

  if (req.method === 'GET') {
    const rows =
      (await sql`SELECT state, updated_at FROM dndmm_state WHERE key = ${key}`) as unknown as Array<{
        state: AppState
        updated_at: string
      }>

    if (!rows.length) {
      return ok(res, { state: null, updatedAt: null })
    }

    return ok(res, { state: rows[0].state, updatedAt: rows[0].updated_at })
  }

  if (req.method === 'PUT') {
    let body: unknown = req.body
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body) as unknown
      } catch {
        return ok(res, { error: 'JSON inválido.' }, 400)
      }
    }

    const state = (body as { state?: AppState } | null | undefined)?.state
    if (!state || state.version !== 1) {
      return ok(res, { error: 'Payload inválido.' }, 400)
    }

    await sql`
      INSERT INTO dndmm_state (key, state, updated_at)
      VALUES (${key}, ${state}::jsonb, NOW())
      ON CONFLICT (key)
      DO UPDATE SET state = EXCLUDED.state, updated_at = NOW();
    `

    return ok(res, { ok: true })
  }

  res.setHeader('Allow', 'GET, PUT')
  return ok(res, { error: 'Método não permitido.' }, 405)
}
