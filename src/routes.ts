import type { Category } from './types'

export type Page = 'home' | 'catalog' | 'product' | 'compare' | 'builder' | 'estimate' | 'advisor' | 'bots' | 'glossary'
export type Route = { page: Page; id?: string; category?: Category }

export const pages: Page[] = ['home', 'catalog', 'product', 'compare', 'builder', 'estimate', 'advisor', 'bots', 'glossary']

/** Navigation par fragment d'URL : `#catalog`, `#product/cpu-5600`, `#builder?build=…`. */
export function parseHash(hash: string): Route {
  const clean = hash.replace(/^#/, '').split('?')[0]
  const [page, id] = clean.split('/')
  return pages.includes(page as Page) ? { page: page as Page, id: id || undefined } : { page: 'home' }
}

export const toHash = (route: Route) => `#${route.page}${route.id ? `/${route.id}` : ''}`
