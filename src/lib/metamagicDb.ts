export type MetamagicOption = {
  id: string
  nameEn: string
  namePt?: string
  descPt?: string[]
}

export type MetamagicDbPayloadV1 = {
  version: 1
  generatedAt: number
  metamagics: MetamagicOption[]
}

let cachedPayload: MetamagicDbPayloadV1 | null = null
let inflight: Promise<MetamagicDbPayloadV1> | null = null

export async function loadMetamagicDb(signal?: AbortSignal): Promise<MetamagicDbPayloadV1> {
  if (cachedPayload) return cachedPayload
  if (inflight) return inflight

  inflight = (async () => {
    const res = await fetch('/metamagics.v1.json', { signal })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(text || `HTTP ${res.status} fetching /metamagics.v1.json`)
    }
    const payload = (await res.json()) as MetamagicDbPayloadV1
    cachedPayload = payload
    return payload
  })()

  try {
    return await inflight
  } finally {
    inflight = null
  }
}

export function metamagicDisplayName(m: MetamagicOption): string {
  return (m.namePt?.trim() || m.nameEn).trim()
}
