import { ZodError } from 'zod'
import { getDatabase } from '../db.js'
import { buildComponentListQuery, buildLookupQuery, parseListQuery } from './component-query.js'

type VercelRequest = { method?: string; query: Record<string, string | string[] | undefined> }
type VercelResponse = {
  setHeader(name: string, value: string): void
  status(code: number): VercelResponse
  json(value: unknown): VercelResponse
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
  const [prefix, ...rest] = path
  if (prefix === 'search') return listComponents(request, response)
  const value = decodeURIComponent(rest.join('/'))
  let kind: 'id' | 'slug' | 'mpn'
  if (prefix === 'slug' || prefix === 'mpn') kind = prefix
  else { kind = 'id'; rest.unshift(prefix); }
  const lookupValue = kind === 'id' ? decodeURIComponent(rest.join('/')) : value
  if (!lookupValue || lookupValue.length > 180) return fail(response, 400, 'INVALID_IDENTIFIER', 'Identifiant invalide.')
  try {
    const query = buildLookupQuery(kind, lookupValue)
    const rows = await getDatabase().unsafe(query.text, query.values as never[])
    if (!rows.length) return fail(response, 404, 'COMPONENT_NOT_FOUND', 'Aucun composant ne correspond à cet identifiant.')
    if (kind === 'mpn' && rows.length > 1) return fail(response, 409, 'AMBIGUOUS_MPN', 'Plusieurs fabricants utilisent cette référence. Précisez la marque.')
    headers(response)
    return response.status(200).json({ data: rows[0] })
  } catch (error) {
    console.error('[components:lookup]', error)
    return fail(response, 503, 'CATALOG_UNAVAILABLE', 'Le catalogue serveur est temporairement indisponible.')
  }
}
