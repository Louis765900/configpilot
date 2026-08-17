import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  BarChart3, BookOpen, Bot, Calculator, CircuitBoard, Compass, LayoutGrid, Menu, Moon, Search, Sparkles, Sun, X,
} from 'lucide-react'
import { getProduct } from './engine'
import packageJson from '../package.json'
import { parseHash, toHash } from './routes'
import type { Page, Route } from './routes'
import type { Build, Category, ListingInput, Product } from './types'
import Home from './screens/Home'
import Catalog from './screens/Catalog'
import ProductSheet from './screens/ProductSheet'
import Compare from './screens/Compare'
import Builder from './screens/Builder'
import Estimator from './screens/Estimator'
import Advisor from './screens/Advisor'
import Bots from './screens/Bots'
import Glossary from './screens/Glossary'

const NAV: [Page, string, React.ReactNode][] = [
  ['home', 'Accueil', <Compass key="i" />],
  ['catalog', 'Catalogue', <LayoutGrid key="i" />],
  ['builder', 'Configurateur', <CircuitBoard key="i" />],
  ['compare', 'Comparateur', <BarChart3 key="i" />],
  ['estimate', 'Estimateur', <Calculator key="i" />],
  ['advisor', 'Assistant', <Sparkles key="i" />],
]
const NAV_SECONDARY: [Page, string, React.ReactNode][] = [
  ['bots', 'Bots & sources', <Bot key="i" />],
  ['glossary', 'Glossaire', <BookOpen key="i" />],
]

function useStored<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try { const saved = localStorage.getItem(key); return saved ? JSON.parse(saved) : initial } catch { return initial }
  })
  useEffect(() => { localStorage.setItem(key, JSON.stringify(value)) }, [key, value])
  return [value, setValue] as const
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash))
  const [dark, setDark] = useStored('configpilot:dark', true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<Category | 'all'>('all')
  const [compare, setCompare] = useStored<string[]>('configpilot:compare', [])
  const [build, setBuild] = useStored<Build>('configpilot:build', {})
  const [listing, setListing] = useState<ListingInput>({
    productId: 'cpu-5600', price: 120, shipping: 0, protection: 0, condition: 'good',
    box: false, invoice: false, warranty: false, tested: true, benchmarks: false, professional: false,
  })

  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light' }, [dark])
  useEffect(() => {
    const sync = () => setRoute(parseHash(location.hash))
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])
  useEffect(() => {
    const encoded = location.hash.split('build=')[1]
    if (!encoded) return
    try { setBuild(JSON.parse(decodeURIComponent(escape(atob(encoded))))) } catch { /* lien de partage illisible */ }
  }, [setBuild])

  const go = useCallback((next: Route) => {
    setRoute(next)
    setMenuOpen(false)
    if (next.category) setCategory(next.category)
    location.hash = toHash(next)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  const toggleCompare = useCallback((product: Product) => {
    setCompare(current => {
      if (current.includes(product.id)) return current.filter(id => id !== product.id)
      const existing = current.map(getProduct).filter(Boolean) as Product[]
      if (existing.length && existing[0].category !== product.category) return [product.id]
      return current.length < 4 ? [...current, product.id] : current
    })
  }, [setCompare])

  const addToBuild = useCallback((product: Product) => {
    setBuild(current => ({ ...current, [product.category]: product.id }))
  }, [setBuild])

  const estimate = useCallback((product: Product) => {
    setListing(current => ({ ...current, productId: product.id }))
    go({ page: 'estimate' })
  }, [go])

  const onSearch = (value: string) => {
    setQuery(value)
    if (value && route.page !== 'catalog') go({ page: 'catalog' })
  }

  const active = useMemo(() => (route.page === 'product' ? 'catalog' : route.page), [route.page])

  return (
    <div className="app">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <button className="sidebar-brand" onClick={() => go({ page: 'home' })}>
          <span className="brand-mark"><Compass /></span>
          <span className="brand-text"><b>ConfigPilot</b><span>configuration PC</span></span>
        </button>
        <nav className="sidebar-nav" aria-label="Navigation principale">
          {NAV.map(([page, label, icon]) => (
            <button key={page} className={active === page ? 'active' : ''} onClick={() => go({ page })}>
              {icon}{label}
            </button>
          ))}
        </nav>
        <div className="sidebar-section">Transparence</div>
        <nav className="sidebar-nav" aria-label="Navigation secondaire">
          {NAV_SECONDARY.map(([page, label, icon]) => (
            <button key={page} className={active === page ? 'active' : ''} onClick={() => go({ page })}>
              {icon}{label}
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <p className="sidebar-note">
            Prix indicatifs calculés localement. Aucun relevé marchand en direct, aucune caractéristique devinée.
          </p>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <button className="icon-button menu-toggle" onClick={() => setMenuOpen(open => !open)}
            aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}>
            {menuOpen ? <X /> : <Menu />}
          </button>
          <label className="global-search">
            <Search />
            <span className="sr-only">Rechercher un composant</span>
            <input value={query} onChange={event => onSearch(event.target.value)}
              placeholder="Rechercher un composant (référence, marque, socket…)" />
          </label>
          <div className="topbar-actions">
            <button className="icon-button" onClick={() => setDark(!dark)}
              aria-label={dark ? 'Activer le thème clair' : 'Activer le thème sombre'}>
              {dark ? <Sun /> : <Moon />}
            </button>
          </div>
        </header>

        {route.page === 'home' && <Home go={go} loadBuild={setBuild} />}
        {route.page === 'catalog' && (
          <Catalog query={query} category={category} setCategory={setCategory} go={go} compare={compare} toggleCompare={toggleCompare} />
        )}
        {route.page === 'product' && (
          <ProductSheet product={getProduct(route.id)} go={go} addToBuild={addToBuild}
            toggleCompare={toggleCompare} compare={compare} estimate={estimate} />
        )}
        {route.page === 'compare' && <Compare ids={compare} setIds={setCompare} go={go} />}
        {route.page === 'builder' && <Builder build={build} setBuild={setBuild} go={go} />}
        {route.page === 'estimate' && <Estimator input={listing} setInput={setListing} />}
        {route.page === 'advisor' && <Advisor go={go} loadBuild={setBuild} />}
        {route.page === 'bots' && <Bots />}
        {route.page === 'glossary' && <Glossary />}

        <footer className="foot">
          <span>ConfigPilot · version {packageJson.version}</span>
          <nav>
            <button onClick={() => go({ page: 'glossary' })}>Glossaire</button>
            <button onClick={() => go({ page: 'bots' })}>Sources et méthode</button>
            <span>Prix indicatifs, jamais relevés en direct</span>
          </nav>
        </footer>
      </div>
    </div>
  )
}
