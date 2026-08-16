import { useMemo, useState } from 'react'
import { BarChart3, ChevronLeft, ChevronRight, LayoutGrid, List } from 'lucide-react'
import { categoryLabels, frequentSockets, products } from '../data'
import { categoryOrder, formatSpec, money, searchProducts, valueScore } from '../engine'
import { Empty } from '../ui'
import { PartArt } from '../illustrations'
import type { Category, Product } from '../types'
import type { Route } from '../routes'

const PAGE_SIZE = 24
const HEADLINE: Partial<Record<Category, string[]>> = {
  cpu: ['Socket', 'Cœurs', 'TDP'],
  gpu: ['VRAM', 'Consommation (W)', 'Longueur (mm)'],
  motherboard: ['Socket', 'Chipset', 'Format'],
  ram: ['Type', 'Capacité', 'Fréquence'],
  psu: ['Puissance', 'Certification', 'Modularité'],
  case: ['Format', 'GPU max (mm)', 'Ventirad max (mm)'],
  storage: ['Type', 'Capacité', 'Lecture'],
  cooling: ['Type', 'Hauteur (mm)', 'Radiateur (mm)'],
  expansion: ['Type', 'Interface', 'Profil'],
}

const headlineSpecs = (product: Product) =>
  (HEADLINE[product.category] ?? Object.keys(product.specs).slice(0, 3))
    .filter(key => key in product.specs)
    .map(key => [key, formatSpec(product.specs[key])] as [string, string])

export default function Catalog({ query, category, setCategory, go, compare, toggleCompare }: {
  query: string
  category: Category | 'all'
  setCategory: (value: Category | 'all') => void
  go: (route: Route) => void
  compare: string[]
  toggleCompare: (product: Product) => void
}) {
  const [brand, setBrand] = useState(''), [socket, setSocket] = useState(''), [sort, setSort] = useState('relevance')
  const [onlyPriced, setOnlyPriced] = useState(false), [layout, setLayout] = useState<'grid' | 'rows'>('grid')
  const [page, setPage] = useState(1)

  const visible = useMemo(() => {
    const list = searchProducts(query, category, socket)
      .filter(item => (!brand || item.brand === brand) && (!onlyPriced || item.newPrice != null || item.usedPrice != null))
    return [...list].sort((left, right) =>
      sort === 'price-asc' ? (left.usedPrice ?? left.newPrice ?? Infinity) - (right.usedPrice ?? right.newPrice ?? Infinity)
        : sort === 'price-desc' ? (right.usedPrice ?? right.newPrice ?? -1) - (left.usedPrice ?? left.newPrice ?? -1)
          : sort === 'performance' ? (right.performance ?? -1) - (left.performance ?? -1)
            : sort === 'value' ? (valueScore(right) ?? -1) - (valueScore(left) ?? -1)
              : (right.performance ?? -1) - (left.performance ?? -1))
  }, [query, category, socket, brand, sort, onlyPriced])

  const total = Math.max(1, Math.ceil(visible.length / PAGE_SIZE))
  const current = Math.min(page, total)
  const shown = visible.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE)
  const brands = [...new Set(products.filter(item => category === 'all' || item.category === category).map(item => item.brand))].sort()
  const reset = () => { setBrand(''); setSocket(''); setSort('relevance'); setOnlyPriced(false); setCategory('all'); setPage(1) }
  const pick = <T,>(setter: (value: T) => void) => (value: T) => { setter(value); setPage(1) }

  return (
    <div className="view">
      <div className="page-head">
        <div>
          <span className="eyebrow">Catalogue</span>
          <h1>Les composants, sans le bruit.</h1>
          <p>Caractéristiques structurées et zones d’incertitude signalées. Une valeur absente s’affiche « À vérifier » plutôt que d’être comblée.</p>
        </div>
        {compare.length > 0 && (
          <button className="btn primary" onClick={() => go({ page: 'compare' })}>
            <BarChart3 /> Comparer {compare.length} référence{compare.length > 1 ? 's' : ''}
          </button>
        )}
      </div>

      <div className="catalog">
        <aside className="filters">
          <div className="filters-head">
            <b>Filtres</b>
            <button className="btn ghost" onClick={reset}>Réinitialiser</button>
          </div>

          <fieldset>
            <legend>Catégorie</legend>
            <label className="filter-line">
              <input type="radio" name="category" checked={category === 'all'} onChange={() => pick(setCategory)('all')} />
              <span>Toutes</span>
              <span>{products.length}</span>
            </label>
            {categoryOrder.map(item => (
              <label className="filter-line" key={item}>
                <input type="radio" name="category" checked={category === item} onChange={() => pick(setCategory)(item)} />
                <span>{categoryLabels[item]}</span>
                <span>{products.filter(product => product.category === item).length}</span>
              </label>
            ))}
          </fieldset>

          <label className="field">
            <span>Marque</span>
            <select value={brand} onChange={event => pick(setBrand)(event.target.value)}>
              <option value="">Toutes les marques</option>
              {brands.map(item => <option key={item}>{item}</option>)}
            </select>
          </label>

          {(category === 'cpu' || category === 'motherboard') && (
            <label className="field">
              <span>Socket</span>
              <select value={socket} onChange={event => pick(setSocket)(event.target.value)}>
                <option value="">Tous les sockets</option>
                {frequentSockets.map(item => <option key={item}>{item}</option>)}
              </select>
            </label>
          )}

          <label className={`check ${onlyPriced ? 'on' : ''}`}>
            <input type="checkbox" checked={onlyPriced} onChange={event => pick(setOnlyPriced)(event.target.checked)} />
            Uniquement les fiches chiffrées
          </label>
        </aside>

        <div>
          <div className="result-head">
            <h2>{visible.length.toLocaleString('fr-FR')} résultat{visible.length > 1 ? 's' : ''}</h2>
            <span className="spacer" />
            <label className="field">
              <select aria-label="Trier les résultats" value={sort} onChange={event => pick(setSort)(event.target.value)}>
                <option value="relevance">Performance décroissante</option>
                <option value="price-asc">Prix croissant</option>
                <option value="price-desc">Prix décroissant</option>
                <option value="value">Performance par euro</option>
              </select>
            </label>
            <div className="view-switch">
              <button className={layout === 'grid' ? 'active' : ''} onClick={() => setLayout('grid')} aria-label="Affichage en cartes"><LayoutGrid /></button>
              <button className={layout === 'rows' ? 'active' : ''} onClick={() => setLayout('rows')} aria-label="Affichage en liste"><List /></button>
            </div>
          </div>

          {!visible.length && <Empty title="Aucune référence trouvée" text="Élargis la recherche ou réinitialise les filtres." />}

          {visible.length > 0 && layout === 'grid' && (
            <div className="part-grid">
              {shown.map(product => (
                <article className={`part-card ${product.status === 'Détaillée' ? 'ok' : ''}`} key={product.id}>
                  <div className="part-card-top">
                    <div className="art-frame md"><PartArt category={product.category} product={product} /></div>
                    <div className="part-card-id">
                      <span className="badge">{product.brand}</span>
                      <h3>{product.name}</h3>
                      <span className="ref">{product.reference}</span>
                    </div>
                  </div>
                  <dl>
                    {headlineSpecs(product).map(([key, value]) => (
                      <div key={key}><dt>{key}</dt><dd>{value}</dd></div>
                    ))}
                  </dl>
                  <div className="part-card-foot">
                    {product.newPrice ?? product.usedPrice
                      ? <span className="price">{money(product.newPrice ?? product.usedPrice)}</span>
                      : <span className="price none">Prix à vérifier</span>}
                    <div className="row">
                      <button className="btn ghost" onClick={() => toggleCompare(product)}>
                        {compare.includes(product.id) ? 'Retirer' : 'Comparer'}
                      </button>
                      <button className="btn secondary" onClick={() => go({ page: 'product', id: product.id })}>
                        Fiche <ChevronRight />
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {visible.length > 0 && layout === 'rows' && (
            <div className="part-rows">
              {shown.map(product => {
                const specs = headlineSpecs(product)
                return (
                  <button className="part-row" key={product.id} onClick={() => go({ page: 'product', id: product.id })}>
                    <div className="art-frame sm"><PartArt category={product.category} product={product} /></div>
                    <div>
                      <h3>{product.name}</h3>
                      <span className="ref">{product.brand} · {product.reference}</span>
                    </div>
                    <span className="cell hide-sm">{specs[0]?.[0]}<b>{specs[0]?.[1] ?? '—'}</b></span>
                    <span className="cell hide-sm">{specs[1]?.[0]}<b>{specs[1]?.[1] ?? '—'}</b></span>
                    <span className="cell"><b>{money(product.newPrice ?? product.usedPrice)}</b></span>
                  </button>
                )
              })}
            </div>
          )}

          {visible.length > PAGE_SIZE && (
            <nav className="pager" aria-label="Pagination du catalogue">
              <button className="btn secondary" disabled={current === 1} onClick={() => setPage(value => Math.max(1, value - 1))}>
                <ChevronLeft /> Précédent
              </button>
              <span className="mono">Page {current} / {total}</span>
              <button className="btn secondary" disabled={current === total} onClick={() => setPage(value => Math.min(total, value + 1))}>
                Suivant <ChevronRight />
              </button>
            </nav>
          )}
        </div>
      </div>
    </div>
  )
}
