import { ZodError } from 'zod'
import { getDatabase } from '../db.js'
import { buildComponentListQuery, buildLookupQuery, parseListQuery } from './component-query.js'

type VercelRequest = { method?: string; query: Record<string, string | string[] | undefined> }
type VercelResponse = {
  setHeader(name: string, value: string): void
  status(code: number): VercelResponse
  json(value: unknown): VercelResponse
}

type LookupKind = 'id' | 'slug' | 'mpn'

const first = (value: string | string[] | undefined) => Array.isArray(value) ? value[0] : value
const decode = (value: string) => {
  try { return decodeURIComponent(value) } catch { return '' }
}

export function parseLookupTarget(query: VercelRequest['query']): { kind: LookupKind; value: string } | null {
  const directKind = first(query.kind)
  const directValue = first(query.value)
  if ((directKind === 'id' || directKind === 'slug' || directKind === 'mpn') && directValue) {
    const value = decode(directValue)
    return value ? { kind: directKind, value } : null
  }

  const path = Array.isArray(query.path) ? query.path : query.path ? [query.path] : []
  const [prefix, ...rest] = path
  if (!prefix || prefix === 'search') return null
  const kind: LookupKind = prefix === 'slug' || prefix === 'mpn' ? prefix : 'id'
  const encodedValue = kind === 'id' ? [prefix, ...rest].join('/') : rest.join('/')
  const value = decode(encodedValue)
  return value ? { kind, value } : null
}

const headers = (response: VercelResponse) => {
  response.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=1800')
  response.setHeader('X-Content-Type-Options', 'nosniff')
}

const fail = (response: VercelResponse, status: number, code: string, message: string, details?: unknown) =>
  response.status(status).json({ error: { code, message, details } })

export async function listComponents(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'GET') return fail(response, 405, 'METHOD_NOT_ALLOWED', 'Seule la méthode GET est acceptée.')
  try {
    const params = parseListQuery(request.query)
    const query = buildComponentListQuery(params)
    const rows = await getDatabase().unsafe(query.text, query.values as never[])
    headers(response)
    const total = Number(rows[0]?.total_count ?? 0)
    return response.status(200).json({
      data: rows.map((row) =>
        Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'total_count')),
      ),
      pagination: { page: params.page, limit: params.limit, total, pages: Math.ceil(total / params.limit) },
    })
  } catch (error) {
    if (error instanceof ZodError) return fail(response, 400, 'INVALID_QUERY', 'Paramètres de recherche invalides.', error.issues)
    console.error('[components:list]', error)
    return fail(response, 503, 'CATALOG_UNAVAILABLE', 'Le catalogue serveur est temporairement indisponible.')
  }
}

export async function lookupComponent(request: VercelRequest, response: VercelResponse) {
  if (request.method !== 'GET') return fail(response, 405, 'METHOD_NOT_ALLOWED', 'Seule la méthode GET est acceptée.')
  const path = Array.isArray(request.query.path) ? request.query.path : request.query.path ? [request.query.path] : []
  if (path[0] === 'search') return listComponents(request, response)
  const target = parseLookupTarget(request.query)
  if (!target || target.value.length > 180) return fail(response, 400, 'INVALID_IDENTIFIER', 'Identifiant invalide.')
  try {
    const query = buildLookupQuery(target.kind, target.value)
    const rows = await getDatabase().unsafe(query.text, query.values as never[])
    if (!rows.length) return fail(response, 404, 'COMPONENT_NOT_FOUND', 'Aucun composant ne correspond à cet identifiant.')
    if (target.kind === 'mpn' && rows.length > 1) return fail(response, 409, 'AMBIGUOUS_MPN', 'Plusieurs fabricants utilisent cette référence. Précisez la marque.')
    headers(response)
    return response.status(200).json({ data: rows[0] })
  } catch (error) {
    console.error('[components:lookup]', error)
    return fail(response, 503, 'CATALOG_UNAVAILABLE', 'Le catalogue serveur est temporairement indisponible.')
  }
}
