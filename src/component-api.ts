import type { Category, Product } from './types'

type ApiComponent = {
  id: string
  category: string
  subcategory: string | null
  brand: string
  name: string
  model: string | null
  series: string | null
  mpn: string | null
  manufacturer_part_numbers: string[]
  release_date: string | null
  description: string | null
  short_description: string | null
  specifications: Record<string, Product['specs'][string]>
  primary_source: string
  completeness_score: number
  confidence_score: number
}

type ApiResponse = { data: ApiComponent[]; pagination: { page: number; limit: number; total: number; pages: number } }

const categoryMap: Record<string, Category> = {
  cpu: 'cpu', gpu: 'gpu', motherboard: 'motherboard', ram: 'ram', storage: 'storage', psu: 'psu', case: 'case',
  cooling: 'cooling', fan: 'cooling', thermal_compound: 'cooling', network: 'expansion', sound_card: 'expansion',
  capture_card: 'expansion', monitor: 'expansion',
}

const cache = new Map<string, Product>()
export const remoteCatalogEnabled = import.meta.env.VITE_COMPONENT_API_ENABLED === 'true'
export const getCachedRemoteProduct = (id?: string) => id ? cache.get(id) : undefined

export function apiComponentToProduct(item: ApiComponent): Product {
  const product: Product = {
    id: item.id,
    category: categoryMap[item.category] ?? 'expansion',
    brand: item.brand,
    name: item.name,
    reference: item.mpn ?? item.manufacturer_part_numbers[0] ?? 'À vérifier',
    series: item.series ?? item.model ?? '',
    year: item.release_date ? Number(item.release_date.slice(0, 4)) : null,
    launchPrice: null, observations: [], newPrice: null, usedPrice: null,
    confidence: item.confidence_score >= 80 ? 'Bonne' : item.confidence_score >= 60 ? 'Moyenne' : 'Faible',
    status: 'Documentaire', notes: item.description ?? 'Fiche importée dans le catalogue ConfigPilot avec provenance conservée.',
    performance: null, specs: item.specifications ?? {}, strengths: [], weaknesses: [],
    usage: item.short_description ?? `Référence ${item.primary_source}, complétude ${item.completeness_score} %.`,
  }
  cache.set(product.id, product)
  return product
}

export async function searchRemoteComponents(params: { q: string; category?: Category | 'all'; brand?: string; socket?: string; signal?: AbortSignal }) {
  const query = new URLSearchParams({ q: params.q, limit: '100', sort: 'relevance' })
  if (params.category && params.category !== 'all' && params.category !== 'expansion') query.set('category', params.category)
  if (params.brand) query.set('brand', params.brand)
  if (params.socket) query.set('socket', params.socket)
  const response = await fetch(`/api/components?${query}`, { signal: params.signal, headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Catalogue serveur indisponible (${response.status})`)
  const payload = await response.json() as ApiResponse
  return { products: payload.data.map(apiComponentToProduct), total: payload.pagination.total }
}
