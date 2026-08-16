import { useEffect, useMemo, useState } from 'react'
import {
  ArrowRight, BarChart3, Bot, Check, ChevronLeft, ChevronRight, Clipboard, Compass, Cpu, ExternalLink,
  Gauge, HardDrive, Heart, Menu, Moon, PackageSearch, Plus, RefreshCw, Search, ShieldCheck,
  Sparkles, Sun, TriangleAlert, X, Zap,
} from 'lucide-react'
import { categoryLabels, frequentSockets, louisBuild, products } from './data'
import sourceRegistry from './catalog/source-registry.json'
import { analyzeListing, buildSummary, categoryOrder, checkCompatibility, getProduct, money, searchProducts, valueScore } from './engine'
import type { Build, Category, ListingInput, Product } from './types'

type Page = 'home' | 'catalog' | 'compare' | 'builder' | 'estimate' | 'recommend' | 'bots' | 'glossary'
const validPages: Page[] = ['home','catalog','compare','builder','estimate','recommend','bots','glossary']

function useStoredState<T>(key: string, initial: T) {
  const [value,setValue] = useState<T>(() => {
    try { const saved = localStorage.getItem(key); return saved ? JSON.parse(saved) : initial } catch { return initial }
  })
  useEffect(() => { localStorage.setItem(key,JSON.stringify(value)) },[key,value])
  return [value,setValue] as const
}

function Logo({ compact = false }: { compact?: boolean }) {
  return <span className="logo-wrap" aria-label="ConfigPilot">
    <span className="logo-mark"><Compass size={compact ? 22 : 28}/><b>CP</b></span>
    {!compact && <span className="logo-type">Config<span>Pilot</span></span>}
  </span>
}

function IconFor({ category }: { category: Category }) {
  if (category === 'cpu' || category === 'motherboard' || category === 'ram') return <Cpu />
  if (category === 'storage') return <HardDrive />
  if (category === 'psu') return <Zap />
  return <Gauge />
}

const statusText = { ok:'Validé', warning:'À vérifier', error:'Incompatible', unknown:'Information manquante' }

function Pill({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: string }) {
  return <span className={`pill ${tone}`}>{children}</span>
}

function EmptyState({ query }: { query?: string }) {
  return <div className="empty-state"><PackageSearch/><h3>Aucune référence trouvée</h3><p>{query ? `Aucun résultat pour « ${query} ». Essaie une référence, une marque ou un socket.` : 'Modifie les filtres pour élargir la recherche.'}</p></div>
}

function Header({ page, navigate, dark, setDark }: { page: Page; navigate:(p:Page)=>void; dark:boolean; setDark:(v:boolean)=>void }) {
  const [open,setOpen] = useState(false)
  const links: [Page,string][] = [['catalog','Catalogue'],['compare','Comparer'],['builder','Configurer'],['estimate','Estimer'],['recommend','Recommander'],['bots','Bots']]
  return <header className="topbar">
    <button className="brand-button" onClick={()=>navigate('home')}><Logo/></button>
    <nav className={open ? 'nav-open' : ''} aria-label="Navigation principale">
      {links.map(([id,label])=><button key={id} className={page===id?'active':''} onClick={()=>{navigate(id);setOpen(false)}}>{label}</button>)}
    </nav>
    <div className="header-actions">
      <button className="icon-button" onClick={()=>setDark(!dark)} aria-label={dark?'Activer le thème clair':'Activer le thème sombre'}>{dark?<Sun/>:<Moon/>}</button>
      <button className="icon-button menu" onClick={()=>setOpen(!open)} aria-label="Ouvrir le menu">{open?<X/>:<Menu/>}</button>
    </div>
  </header>
}

function Home({ navigate }: { navigate:(p:Page)=>void }) {
  const counts = Object.fromEntries(categoryOrder.map(c=>[c,products.filter(p=>p.category===c).length]))
  return <main>
    <section className="hero shell">
      <div className="hero-copy">
        <Pill tone="orange"><Sparkles size={14}/> Décidez avec les bonnes données</Pill>
        <h1>Le copilote de votre <em>configuration PC.</em></h1>
        <p className="hero-lead">Comparez les composants, détectez les incompatibilités et évaluez une annonce — sans jargon inutile ni fausses promesses de prix en direct.</p>
        <div className="hero-actions">
          <button className="button primary" onClick={()=>navigate('builder')}>Construire ma configuration <ArrowRight/></button>
          <button className="button secondary" onClick={()=>navigate('estimate')}>Estimer une annonce</button>
        </div>
        <div className="trust-line"><ShieldCheck/> Catalogue documenté · Estimations transparentes · Données locales</div>
      </div>
      <div className="hero-console" aria-label="Aperçu d’une analyse de configuration">
        <div className="console-top"><span><i></i><i></i><i></i></span><b>DIAGNOSTIC / LOUIS-PC</b><Pill tone="green">Actif</Pill></div>
        <div className="console-score"><div><small>Indice global</small><strong>78</strong><span>/100</span></div><div className="radar"><Compass/><span>CONFIG<br/>PILOT</span></div></div>
        <div className="console-list">
          <div><Check/><span><b>Socket LGA1151 v2</b><small>CPU et carte mère alignés</small></span><Pill tone="green">OK</Pill></div>
          <div><TriangleAlert/><span><b>BIOS Z370</b><small>Version compatible 9e gén. requise</small></span><Pill tone="yellow">Vérifier</Pill></div>
          <div><TriangleAlert/><span><b>Refroidissement</b><small>Modèle encore inconnu</small></span><Pill>Inconnu</Pill></div>
        </div>
        <button onClick={()=>navigate('builder')}>Analyser ma configuration <ChevronRight/></button>
      </div>
    </section>
    <section className="stats-band">
      <div className="shell stats-grid">
        <div><strong>{products.length}</strong><span>références locales</span></div>
        <div><strong>{counts.cpu}</strong><span>processeurs</span></div>
        <div><strong>{counts.gpu}</strong><span>cartes graphiques</span></div>
        <div><strong>{counts.motherboard}</strong><span>cartes mères</span></div>
      </div>
    </section>
    <section className="shell section-pad">
      <div className="section-heading"><div><span className="eyebrow">UNE MÉTHODE CLAIRE</span><h2>Quatre outils. Une décision plus sûre.</h2></div><button className="text-link" onClick={()=>navigate('catalog')}>Explorer le catalogue <ArrowRight/></button></div>
      <div className="feature-grid">
        {[
          [BarChart3,'Comparer','Alignez jusqu’à quatre références et repérez les écarts de performance, de prix et de valeur.','compare'],
          [ShieldCheck,'Vérifier','Croisez socket, RAM, format, dimensions, alimentation, BIOS et refroidissement.','builder'],
          [Gauge,'Estimer','Intégrez l’état, les preuves, les frais et le risque propre à chaque catégorie.','estimate'],
          [Sparkles,'Recommander','Trouvez une base cohérente avec votre budget, votre résolution et vos composants.','recommend'],
        ].map(([Icon,title,text,id])=><button className="feature-card" key={title as string} onClick={()=>navigate(id as Page)}>
          <span className="feature-icon"><Icon/></span><span className="feature-number">0{['Comparer','Vérifier','Estimer','Recommander'].indexOf(title as string)+1}</span>
          <h3>{title as string}</h3><p>{text as string}</p><span className="card-link">Ouvrir l’outil <ChevronRight/></span>
        </button>)}
      </div>
    </section>
    <section className="shell louis-callout">
      <div><Pill tone="orange">Configuration préchargée</Pill><h2>Le PC de Louis, prêt à être diagnostiqué.</h2><p>i9-9900KF, MSI Z370 à identifier, GTX 1660 Super, 48 Go DDR4 et EVGA 600 W1. Les zones d’incertitude restent volontairement visibles.</p></div>
      <button className="button light" onClick={()=>navigate('builder')}>Améliorer mon PC actuel <ArrowRight/></button>
    </section>
  </main>
}

function ProductRow({ product, compare, toggleCompare, onDetail, onBuild, onEstimate, favorite, toggleFavorite }: {
  product:Product; compare:string[]; toggleCompare:(p:Product)=>void; onDetail:(p:Product)=>void; onBuild:(p:Product)=>void; onEstimate:(p:Product)=>void; favorite:boolean; toggleFavorite:(id:string)=>void
}) {
  return <article className="product-row">
    <button className="favorite" onClick={()=>toggleFavorite(product.id)} aria-label={favorite?'Retirer des favoris':'Ajouter aux favoris'}><Heart fill={favorite?'currentColor':'none'}/></button>
    <div className="product-icon"><IconFor category={product.category}/></div>
    <div className="product-main"><Pill>{categoryLabels[product.category]}</Pill><h3>{product.name}</h3><p>{product.reference} · {product.series} · {product.year ?? 'Année à vérifier'}</p></div>
    <div className="product-spec"><small>CARACTÉRISTIQUE</small><strong>{String(product.specs.Socket ?? product.specs.Architecture ?? product.specs.Type ?? product.specs.Puissance ?? 'À vérifier')}</strong></div>
    <div className="product-spec"><small>INDICE</small><strong>{product.performance ?? '—'}<span>{product.performance ? '/100':''}</span></strong></div>
    <div className="product-price"><small>OCCASION INDICATIVE</small><strong>{money(product.usedPrice)}</strong><span>Neuf : {money(product.newPrice)}</span></div>
    <div className="row-actions">
      <button onClick={()=>onDetail(product)}>Voir la fiche</button>
      <button className={compare.includes(product.id)?'selected':''} onClick={()=>toggleCompare(product)}>{compare.includes(product.id)?<Check/>:<Plus/>} Comparer</button>
      <div className="more-actions"><button onClick={()=>onBuild(product)}>+ Config</button><button onClick={()=>onEstimate(product)}>€ Analyser</button></div>
    </div>
  </article>
}

function Catalog({ compare, setCompare, onDetail, navigate, setBuild, favorites, setFavorites, estimatorSelect }:{
  compare:string[]; setCompare:(ids:string[])=>void; onDetail:(p:Product)=>void; navigate:(p:Page)=>void; setBuild:(b:Build|((x:Build)=>Build))=>void; favorites:string[]; setFavorites:(x:string[])=>void; estimatorSelect:(id:string)=>void
}) {
  const [query,setQuery] = useState(''), [category,setCategory] = useState<Category|'all'>('all'), [socket,setSocket] = useState(''), [brand,setBrand] = useState(''), [sort,setSort] = useState('relevance'), [maxPrice,setMaxPrice] = useState(1000), [pageNumber,setPageNumber] = useState(1)
  const visible = useMemo(()=>{
    const list = searchProducts(query,category,socket).filter(p=>(!brand||p.brand===brand)&&(p.usedPrice??p.newPrice??0)<=maxPrice)
    return [...list].sort((a,b)=>sort==='price-asc'?(a.usedPrice??a.newPrice??Infinity)-(b.usedPrice??b.newPrice??Infinity):sort==='price-desc'?(b.usedPrice??b.newPrice??-1)-(a.usedPrice??a.newPrice??-1):sort==='performance'?(b.performance??-1)-(a.performance??-1):sort==='value'?(valueScore(b)??-1)-(valueScore(a)??-1):0)
  },[query,category,socket,brand,sort,maxPrice])
  const pageSize=40, totalPages=Math.max(1,Math.ceil(visible.length/pageSize)), activePage=Math.min(pageNumber,totalPages), paged=visible.slice((activePage-1)*pageSize,activePage*pageSize)
  const brands = [...new Set(products.filter(p=>category==='all'||p.category===category).map(p=>p.brand))].sort()
  const toggleCompare = (p:Product) => {
    const existing = compare.map(getProduct).filter(Boolean) as Product[]
    if (compare.includes(p.id)) return setCompare(compare.filter(id=>id!==p.id))
    if (existing.length && existing[0].category!==p.category) { setCompare([p.id]); return }
    if (compare.length<4) setCompare([...compare,p.id])
  }
  const reset=()=>{setQuery('');setCategory('all');setSocket('');setBrand('');setSort('relevance');setMaxPrice(1000);setPageNumber(1)}
  return <main className="shell app-page">
    <div className="page-title"><div><span className="eyebrow">CATALOGUE ÉTENDU</span><h1>Les composants, sans le bruit.</h1><p>Caractéristiques structurées, prix indicatifs et zones d’incertitude clairement signalées.</p></div><div className="result-count"><strong>{visible.length}</strong><span>résultat{visible.length>1?'s':''}</span></div></div>
    <div className="catalog-toolbar">
      <label className="search-box"><Search/><span className="sr-only">Rechercher</span><input value={query} onChange={e=>{setQuery(e.target.value);setPageNumber(1)}} placeholder="Nom, référence, marque, socket…"/><kbd>⌘ K</kbd></label>
      <select aria-label="Catégorie" value={category} onChange={e=>{setCategory(e.target.value as Category|'all');setSocket('');setPageNumber(1)}}><option value="all">Toutes les catégories</option>{categoryOrder.map(c=><option value={c} key={c}>{categoryLabels[c]}</option>)}</select>
      <select aria-label="Trier" value={sort} onChange={e=>{setSort(e.target.value);setPageNumber(1)}}><option value="relevance">Pertinence</option><option value="price-asc">Prix croissant</option><option value="price-desc">Prix décroissant</option><option value="performance">Performance</option><option value="value">Performance / euro</option></select>
    </div>
    <div className="catalog-layout">
      <aside className="filters">
        <div className="filter-heading"><b>Filtres</b><button onClick={reset}>Réinitialiser</button></div>
        <label>Marque<select value={brand} onChange={e=>{setBrand(e.target.value);setPageNumber(1)}}><option value="">Toutes</option>{brands.map(b=><option key={b}>{b}</option>)}</select></label>
        <label>Prix maximal <span>{maxPrice} €</span><input type="range" min="25" max="1000" step="25" value={maxPrice} onChange={e=>{setMaxPrice(+e.target.value);setPageNumber(1)}}/></label>
        <fieldset><legend>Catégories</legend>{categoryOrder.map(c=><button className={category===c?'active':''} onClick={()=>{setCategory(c);setSocket('');setPageNumber(1)}} key={c}><IconFor category={c}/>{categoryLabels[c]}<span>{products.filter(p=>p.category===c).length}</span></button>)}</fieldset>
      </aside>
      <div className="catalog-content">
        {(category==='cpu'||category==='motherboard'||category==='all')&&<div className="socket-strip"><span>SOCKETS</span><div>{frequentSockets.map(s=><button key={s} className={socket===s?'active':''} onClick={()=>{setSocket(socket===s?'':s);setCategory(category==='all'?'cpu':category);setPageNumber(1)}}>{s}</button>)}</div></div>}
        {compare.length>0&&<div className="compare-toast"><span><BarChart3/> {compare.length}/4 produit{compare.length>1?'s':''} à comparer</span><button onClick={()=>navigate('compare')}>Ouvrir le comparateur <ArrowRight/></button></div>}
        <div className="product-list">{visible.length?paged.map(p=><ProductRow key={p.id} product={p} compare={compare} toggleCompare={toggleCompare} onDetail={onDetail} favorite={favorites.includes(p.id)} toggleFavorite={id=>setFavorites(favorites.includes(id)?favorites.filter(x=>x!==id):[...favorites,id])} onBuild={p=>{setBuild(b=>({...b,[p.category]:p.id}));navigate('builder')}} onEstimate={p=>{estimatorSelect(p.id);navigate('estimate')}}/>):<EmptyState query={query}/>}</div>
        {visible.length>pageSize&&<nav className="pagination" aria-label="Pagination du catalogue"><button disabled={activePage===1} onClick={()=>setPageNumber(page=>Math.max(1,page-1))}><ChevronLeft/> Précédent</button><span>Page <b>{activePage}</b> sur {totalPages}</span><button disabled={activePage===totalPages} onClick={()=>setPageNumber(page=>Math.min(totalPages,page+1))}>Suivant <ChevronRight/></button></nav>}
      </div>
    </div>
  </main>
}

function Compare({ ids, setIds, onDetail, navigate }:{ids:string[];setIds:(x:string[])=>void;onDetail:(p:Product)=>void;navigate:(p:Page)=>void}) {
  const chosen=ids.map(getProduct).filter(Boolean) as Product[]
  const allKeys=[...new Set(chosen.flatMap(p=>Object.keys(p.specs)))]
  const values = chosen.map(valueScore), maxPerf=Math.max(...chosen.map(p=>p.performance??-1)), maxValue=Math.max(...values.map(v=>v??-1))
  if(!chosen.length)return <main className="shell app-page"><div className="page-title"><div><span className="eyebrow">COMPARATEUR</span><h1>Comparez ce qui est comparable.</h1></div></div><div className="empty-panel"><BarChart3/><h2>Votre comparateur est vide</h2><p>Ajoutez jusqu’à quatre produits d’une même catégorie depuis le catalogue.</p><button className="button primary" onClick={()=>navigate('catalog')}>Explorer le catalogue</button></div></main>
  return <main className="shell app-page compare-page">
    <div className="page-title"><div><span className="eyebrow">COMPARATEUR · {categoryLabels[chosen[0].category].toUpperCase()}</span><h1>{chosen.length} références, face à face.</h1><p>Les meilleurs indices sont mis en évidence. « À vérifier » signifie que le catalogue ne permet pas de conclure.</p></div><button className="button secondary" onClick={()=>navigate('catalog')}><Plus/> Ajouter</button></div>
    <div className="compare-scroll"><table className="compare-table"><thead><tr><th>Critère</th>{chosen.map(p=><th key={p.id}><button className="remove-compare" onClick={()=>setIds(ids.filter(id=>id!==p.id))}><X/></button><div className="compare-product-icon"><IconFor category={p.category}/></div><h3>{p.name}</h3><button className="text-link" onClick={()=>onDetail(p)}>Voir la fiche</button></th>)}</tr></thead><tbody>
      <tr className="highlight-row"><th>Indice global</th>{chosen.map(p=><td className={p.performance===maxPerf?'best':''} key={p.id}><strong>{p.performance??'À vérifier'}</strong>{p.performance===maxPerf&&<Pill tone="green">Meilleur</Pill>}</td>)}</tr>
      <tr><th>Prix neuf indicatif</th>{chosen.map(p=><td key={p.id}>{money(p.newPrice)}</td>)}</tr><tr><th>Prix occasion indicatif</th>{chosen.map(p=><td key={p.id}>{money(p.usedPrice)}</td>)}</tr>
      <tr className="highlight-row"><th>Indice valeur</th>{chosen.map((p,i)=><td className={values[i]===maxValue?'best':''} key={p.id}><strong>{values[i]??'À vérifier'}</strong>{values[i]===maxValue&&<Pill tone="green">Meilleur</Pill>}</td>)}</tr>
      {allKeys.map(key=><tr key={key}><th>{key}</th>{chosen.map(p=><td key={p.id}>{p.specs[key]==null?'À vérifier':Array.isArray(p.specs[key])?(p.specs[key] as string[]).join(', '):String(p.specs[key])}</td>)}</tr>)}
    </tbody></table></div>
    <div className="verdict"><Sparkles/><div><b>Verdict ConfigPilot</b><p>{chosen.sort((a,b)=>(valueScore(b)??-1)-(valueScore(a)??-1))[0]?.name} offre ici le meilleur indice performance/prix d’occasion parmi les fiches comparées. Ce verdict repose sur les indices et prix indicatifs du catalogue, pas sur des annonces en direct.</p></div></div>
  </main>
}

function Builder({ build, setBuild, navigate }:{build:Build;setBuild:(b:Build)=>void;navigate:(p:Page)=>void}) {
  const checks=checkCompatibility(build), summary=buildSummary(build), hasError=checks.some(c=>c.status==='error'), hasUnknown=checks.some(c=>c.status==='unknown'||c.status==='warning')
  const [saved,setSaved]=useStoredState<{name:string;build:Build}[]>('configpilot:saved-builds',[])
  const exportText=()=>categoryOrder.map(c=>`${categoryLabels[c]} : ${getProduct(build[c])?.name??'Non sélectionné'}`).join('\n')+`\nPrix indicatif : ${money(summary.total)}`
  const copy=async()=>{try{await navigator.clipboard.writeText(exportText())}catch{/* clipboard may be blocked */}}
  const share=()=>{const encoded=btoa(unescape(encodeURIComponent(JSON.stringify(build))));location.hash=`builder?build=${encoded}`;copy()}
  return <main className="shell app-page">
    <div className="page-title"><div><span className="eyebrow">CONFIGURATEUR INTELLIGENT</span><h1>Construisez. Nous contrôlons.</h1><p>Les vérifications distinguent les conflits, les avertissements et les informations encore inconnues.</p></div><button className="button secondary" onClick={()=>setBuild({...louisBuild})}><RefreshCw/> Charger le PC de Louis</button></div>
    <div className="builder-layout">
      <section className="builder-parts"><div className="panel-title"><h2>Votre configuration</h2><Pill>{Object.keys(build).length}/9 composants</Pill></div>
        {categoryOrder.map(category=>{const item=getProduct(build[category]);const choices=products.filter(p=>p.category===category);return <div className="part-picker" key={category}><div className="product-icon"><IconFor category={category}/></div><div><small>{categoryLabels[category]}</small>{item?<><strong>{item.name}</strong><span>{item.reference}</span></>:<strong>À sélectionner</strong>}</div><select aria-label={`Choisir ${categoryLabels[category]}`} value={build[category]??''} onChange={e=>setBuild({...build,[category]:e.target.value||undefined})}><option value="">Choisir…</option>{choices.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select>{item&&<button className="icon-button" onClick={()=>{const next={...build};delete next[category];setBuild(next)}} aria-label="Retirer"><X/></button>}</div>})}
        <div className="builder-actions"><button className="button primary" onClick={()=>setSaved([...saved,{name:`Configuration ${saved.length+1}`,build}])}>Sauvegarder localement</button><button className="button secondary" onClick={copy}><Clipboard/> Copier</button><button className="button secondary" onClick={share}><ExternalLink/> Partager</button><button className="text-link danger" onClick={()=>setBuild({})}>Réinitialiser</button></div>
        {saved.length>0&&<div className="saved-builds"><b>Configurations sauvegardées</b>{saved.map((x,i)=><button key={i} onClick={()=>setBuild(x.build)}>{x.name}<span>{Object.keys(x.build).length} pièces</span></button>)}</div>}
      </section>
      <aside className="diagnostic-panel">
        <div className={`diagnostic-head ${hasError?'error':hasUnknown?'warning':'success'}`}><span>{hasError?<X/>:hasUnknown?<TriangleAlert/>:<Check/>}</span><div><small>STATUT GLOBAL</small><h2>{hasError?'Conflit détecté':hasUnknown?'À confirmer':'Compatible'}</h2><p>{hasError?'Cette configuration contient au moins une incompatibilité.':hasUnknown?'Aucun conflit détecté, mais certaines caractéristiques restent à confirmer.':'Tous les contrôles disponibles sont validés.'}</p></div></div>
        <div className="summary-grid"><div><small>Prix indicatif</small><strong>{money(summary.total)}</strong></div><div><small>Conso estimée</small><strong>{summary.estimated} W</strong></div><div><small>PSU conseillé</small><strong>{summary.recommended} W</strong></div><div><small>Indice gaming</small><strong>{summary.gaming??'—'}</strong></div><div><small>Indice applicatif</small><strong>{summary.application??'—'}</strong></div><div><small>Équilibre</small><strong>{summary.balance}</strong></div></div>
        <div className="checks"><h3>Contrôles de compatibilité</h3>{checks.map(c=><div className={`check ${c.status}`} key={c.id}><span>{c.status==='ok'?<Check/>:c.status==='error'?<X/>:<TriangleAlert/>}</span><div><b>{c.label}</b><p>{c.detail}</p></div><Pill tone={c.status==='ok'?'green':c.status==='error'?'red':c.status==='warning'?'yellow':'neutral'}>{statusText[c.status]}</Pill></div>)}</div>
        <button className="button full" onClick={()=>navigate('recommend')}>Voir les upgrades conseillés <ArrowRight/></button>
      </aside>
    </div>
  </main>
}

function Estimator({ input, setInput }:{input:ListingInput;setInput:(x:ListingInput)=>void}) {
  const result=analyzeListing(input)
  const selected=getProduct(input.productId)
  const conditions=[['sealed','Neuf / scellé'],['like-new','Comme neuf'],['excellent','Excellent'],['good','Bon'],['worn','Correct / usé'],['untested','Non testé'],['repair','À réparer']]
  const risk:Record<Category,string[]>={cpu:['Pins ou pads endommagés','Overclocking et stabilité','Authenticité du modèle'],gpu:['Usage minage','Températures et ventilateurs','Mémoire et connecteurs'],motherboard:['Pins socket','BIOS compatible','Ports et accessoires'],ram:['Erreurs mémoire','Profil XMP/EXPO'],psu:['Âge de la plateforme','Câbles et protections','Risque électrique'],case:['Visserie','Connectique avant'],storage:['Santé SMART','Données écrites','Secteurs défectueux'],cooling:['Pompe ou roulements','Kit de montage'],expansion:['Pilotes','Ports et accessoires']}
  const set=(key:keyof ListingInput,value:ListingInput[keyof ListingInput])=>setInput({...input,[key]:value})
  return <main className="shell app-page">
    <div className="page-title"><div><span className="eyebrow">ESTIMATEUR D’ANNONCE</span><h1>Une annonce vaut-elle vraiment son prix&nbsp;?</h1><p>Une estimation locale qui tient compte de l’état, des preuves, des frais et du risque — jamais présentée comme un relevé en temps réel.</p></div></div>
    <div className="estimator-layout"><section className="form-panel"><div className="step-title"><span>01</span><div><h2>Le composant</h2><p>Sélectionnez la référence exacte.</p></div></div>
      <label>Référence<select value={input.productId} onChange={e=>set('productId',e.target.value)}>{products.map(p=><option value={p.id} key={p.id}>{p.name}</option>)}</select></label>
      {selected&&<div className="selected-product"><div className="product-icon"><IconFor category={selected.category}/></div><div><Pill>{categoryLabels[selected.category]}</Pill><b>{selected.name}</b><span>Sortie {selected.year??'à vérifier'} · Indice {selected.performance??'à vérifier'}</span></div></div>}
      <div className="step-title"><span>02</span><div><h2>Le prix total</h2><p>Incluez tous les frais obligatoires.</p></div></div><div className="field-grid"><label>Prix de l’annonce (€)<input type="number" min="0" value={input.price} onChange={e=>set('price',+e.target.value)}/></label><label>Livraison (€)<input type="number" min="0" value={input.shipping} onChange={e=>set('shipping',+e.target.value)}/></label><label>Protection (€)<input type="number" min="0" value={input.protection} onChange={e=>set('protection',+e.target.value)}/></label></div>
      <div className="step-title"><span>03</span><div><h2>État et preuves</h2><p>Plus les preuves sont solides, plus la confiance augmente.</p></div></div><label>État<select value={input.condition} onChange={e=>set('condition',e.target.value)}>{conditions.map(([v,l])=><option value={v} key={v}>{l}</option>)}</select></label>
      <div className="check-grid">{([['box','Boîte et accessoires'],['invoice','Facture'],['warranty','Garantie restante'],['tested','Preuve de fonctionnement'],['benchmarks','Températures / benchmarks'],['professional','Vendeur professionnel']] as [keyof ListingInput,string][]).map(([key,label])=><label className="check-option" key={key}><input type="checkbox" checked={Boolean(input[key])} onChange={e=>set(key,e.target.checked)}/><span><Check/></span>{label}</label>)}</div>
    </section>
    <aside className="result-panel"><div className="result-top"><span>VERDICT CONFIGPILOT</span><Pill tone={result?.verdict==='Trop cher'||result?.verdict==='Risque élevé'?'red':result?.verdict==='Excellente affaire'||result?.verdict==='Bon prix'?'green':'yellow'}>{result?.confidence??'Faible'} confiance</Pill></div><h2>{result?.verdict??'Données insuffisantes'}</h2><div className="deal-score"><div><strong>{result?.score??0}</strong><span>/100</span><small>Score de l’annonce</small></div><div className="score-bars">{[1,2,3,4,5].map(i=><i className={(result?.score??0)>=i*20?'on':''} key={i}></i>)}</div></div>
      <div className="price-breakdown"><div><span>Prix neuf indicatif</span><b>{money(selected?.newPrice)}</b></div><div><span>Occasion indicative</span><b>{money(selected?.usedPrice)}</b></div><div><span>Prix total payé</span><b>{money(result?.total)}</b></div><hr/><div><span>Prix cible calculé</span><b className="accent">{money(result?.target)}</b></div><div><span>Maximum conseillé</span><b>{money(result?.maximum)}</b></div><div><span>Écart à la cible</span><b>{result?.delta==null?'À vérifier':`${result.delta>0?'+':''}${result.delta} %`}</b></div></div>
      <div className="notice"><TriangleAlert/><p><b>Estimation, pas prix en direct.</b> Estimation basée sur le catalogue et la décote calculée. Vérifie les annonces réelles avant l’achat.</p></div>
      {selected&&<div className="risk-list"><h3>Points à contrôler</h3>{risk[selected.category].map(x=><div key={x}><Check/>{x}</div>)}</div>}
      {selected&&<div className="market-links"><a target="_blank" rel="noreferrer" href={`https://www.ebay.fr/sch/i.html?_nkw=${encodeURIComponent(selected.name)}`}>eBay <ExternalLink/></a><a target="_blank" rel="noreferrer" href={`https://www.leboncoin.fr/recherche?text=${encodeURIComponent(selected.name)}`}>Leboncoin <ExternalLink/></a><a target="_blank" rel="noreferrer" href={`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(selected.name)}`}>Google Shopping <ExternalLink/></a></div>}
    </aside></div>
  </main>
}

function Recommend({ navigate,setBuild }:{navigate:(p:Page)=>void;setBuild:(b:Build)=>void}) {
  const [budget,setBudget]=useState(1200),[resolution,setResolution]=useState('1440p'),[used,setUsed]=useState(true),[wifi,setWifi]=useState(true),[preference,setPreference]=useState('Aucune')
  const rec=useMemo(()=>{
    if(budget<750)return {cpu:'cpu-5600',gpu:'gpu-6600',motherboard:'mb-b550',ram:'ram-16-ddr4',psu:'psu-cx650',case:'case-pop-air',storage:'ssd-sn770',cooling:'cool-pa120'} as Build
    if(budget<1450)return {cpu:'cpu-7600',gpu:resolution==='1080p'?'gpu-4060':'gpu-7800xt',motherboard:'mb-b650',ram:'ram-32-ddr5',psu:'psu-rm750e',case:'case-pop-air',storage:'ssd-sn770',cooling:'cool-pa120'} as Build
    return {cpu:'cpu-7800x3d',gpu:'gpu-4070s',motherboard:'mb-b650',ram:'ram-32-ddr5',psu:'psu-focus850',case:'case-pop-air',storage:'ssd-p3plus',cooling:'cool-pa120'} as Build
  },[budget,resolution])
  const summary=buildSummary(rec)
  return <main className="shell app-page"><div className="page-title"><div><span className="eyebrow">ASSISTANT DE RECOMMANDATION</span><h1>Le bon équilibre, pas le plus gros score.</h1><p>Le coût de plateforme, l’alimentation et l’évolutivité comptent autant que les performances brutes.</p></div></div>
    <div className="recommend-layout"><section className="form-panel"><div className="step-title"><span>01</span><div><h2>Vos priorités</h2><p>Ces réponses orientent une base de configuration locale.</p></div></div><label>Budget total <b>{budget} €</b><input type="range" min="500" max="2500" step="50" value={budget} onChange={e=>setBudget(+e.target.value)}/></label><div className="field-grid"><label>Résolution<select value={resolution} onChange={e=>setResolution(e.target.value)}><option>1080p</option><option>1440p</option><option>4K</option></select></label><label>Préférence<select value={preference} onChange={e=>setPreference(e.target.value)}><option>Aucune</option><option>AMD</option><option>Intel</option><option>NVIDIA</option></select></label></div><div className="check-grid"><label className="check-option"><input type="checkbox" checked={used} onChange={e=>setUsed(e.target.checked)}/><span><Check/></span>Occasion acceptée</label><label className="check-option"><input type="checkbox" checked={wifi} onChange={e=>setWifi(e.target.checked)}/><span><Check/></span>Wi-Fi requis</label></div><div className="notice"><Sparkles/><p><b>Choix actuel :</b> {resolution}, budget {budget} €, préférence {preference.toLowerCase()}. Le catalogue local ne simule pas une disponibilité marchande.</p></div></section>
      <section className="recommend-result"><div className="panel-title"><div><Pill tone="green">Option équilibrée</Pill><h2>Configuration proposée</h2></div><strong>{money(summary.total)}</strong></div>{categoryOrder.filter(c=>rec[c]).map(c=>{const item=getProduct(rec[c]);return item&&<div className="recommend-part" key={c}><div className="product-icon"><IconFor category={c}/></div><div><small>{categoryLabels[c]}</small><b>{item.name}</b><span>{c==='cpu'?'Plateforme et performance cohérentes':c==='psu'?'Marge et qualité adaptées':item.strengths[0]}</span></div><strong>{money(used?item.usedPrice??item.newPrice:item.newPrice)}</strong></div>})}<div className="summary-grid"><div><small>Indice gaming</small><strong>{summary.gaming}</strong></div><div><small>PSU conseillé</small><strong>{summary.recommended} W</strong></div><div><small>Équilibre</small><strong>{summary.balance}</strong></div></div><button className="button primary full" onClick={()=>{setBuild(rec);navigate('builder')}}>Vérifier cette configuration <ArrowRight/></button></section>
    </div></main>
}

type CandidateTriage = 'retail-product'|'product-family'|'component-model'|'hardware-identifier'|'false-positive'|'needs-review'
type BotCandidate = { id:string; label:string; description:string; url:string; brand:string; category:Category; duplicate:boolean; discoveredAt?:string; firstSeenAt?:string; sourceId?:string; kind?:string; confidence?:'Moyenne'|'Faible'; triage?:CandidateTriage; triageReason?:string; promotable?:boolean; promotionBlocker?:string|null }
type WikidataSearchResult = { id:string; label?:string; description?:string; concepturi?:string }
type ReviewDecision = 'pending'|'verified'|'rejected'
type CandidateLane = 'products'|'identifiers'|'false-positives'
type CandidateVerification = { candidateId:string; status:'verified'|'variant-required'|'rejected'; manufacturer:string; officialUrl:string; reason:string; requiredField?:string }
type ManufacturerEvidence = { candidateId:string; sourceId:string; status:'structured-product'|'page-metadata'|'insufficient-metadata'; brand:string; officialUrl:string; identity:Record<string,string>; page:{title:string;description:string;canonicalUrl:string}; properties:{name:string;value:string}[]; match:{score:number;signals:string[]}; review:{status:'pending';reason:string} }
type ManufacturerEvidenceDocument = { summary:{officialCandidates:number;collected:number;remaining:number;failures:number;byStatus:Record<string,number>}; evidence:ManufacturerEvidence[] }
type DiscoveryCoverage = { category:Category; registeredBrands:string[]; observedBrands:string[]; candidates:number; officialCandidates:number; promotable:number; hardwareIdentifiers:number; rejected:number }
type DiscoveryReport = { generatedAt:string; collection:{date:string|null;status:'not-run'|'success'|'partial'|'failed';queriesAttempted:number;queriesCompleted:number;pagesRequested:number;requestsSucceeded:number;budgetExhausted:boolean;manufacturerIndexesAttempted?:number;manufacturerIndexesCompleted?:number;manufacturerPagesRequested?:number;manufacturerRequestsSucceeded?:number;manufacturerBudgetExhausted?:boolean;errors:string[]}; totals:{registeredQueries:number;registeredBrands:number;registeredCategories:number;categoriesWithCandidates:number;candidates:number;officialCandidates:number;hardwareIdentifiers:number;rejected:number}; coverage:DiscoveryCoverage[] }
const registryConfig=sourceRegistry as {policy:{minimumDelayMs:number;wikidataPageSize?:number;maxLagSeconds?:number};sources:{id:string;name:string;type:string;url:string;enabled:boolean}[];queries:{category:Category;brand:string;query:string}[]}
const registeredQueries=registryConfig.queries
const officialSources=registryConfig.sources.filter(source=>source.enabled&&source.type==='manufacturer-index')
const discoveryAliases=categoryOrder.reduce((groups,category)=>({...groups,[category]:Object.fromEntries(registeredQueries.filter(query=>query.category===category).map(query=>[query.brand,query.query]))}),{} as Record<Category,Record<string,string>>)
const discoveryBrands=[...new Set(Object.values(discoveryAliases).flatMap(group=>Object.keys(group)))].sort()
const normalizeBotText=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()

function CatalogBots(){
  const [category,setCategory]=useState<Category>('motherboard'),[brand,setBrand]=useState('ASUS'),[candidates,setCandidates]=useStoredState<BotCandidate[]>('configpilot:bot-candidates',[]),[decisions,setDecisions]=useStoredState<Record<string,ReviewDecision>>('configpilot:bot-decisions',{}),[filter,setFilter]=useState<ReviewDecision>('pending'),[lane,setLane]=useState<CandidateLane>('products'),[running,setRunning]=useState(false),[progress,setProgress]=useState('Prêt'),[error,setError]=useState('')
  const [automaticCandidates,setAutomaticCandidates]=useState<BotCandidate[]>([]),[hardwareIdentifiers,setHardwareIdentifiers]=useState<BotCandidate[]>([]),[automaticRejections,setAutomaticRejections]=useState<BotCandidate[]>([]),[verifications,setVerifications]=useState<CandidateVerification[]>([]),[manufacturerEvidence,setManufacturerEvidence]=useState<ManufacturerEvidenceDocument|null>(null),[coverageReport,setCoverageReport]=useState<DiscoveryReport|null>(null)
  useEffect(()=>{let active=true;Promise.all([import('./catalog/discovery.generated.json'),import('./catalog/hardware-identifiers.generated.json'),import('./catalog/rejected.generated.json'),import('./catalog/candidate-verification.generated.json'),import('./catalog/manufacturer-evidence.generated.json'),import('./catalog/discovery-report.generated.json')]).then(([discovery,hardware,rejected,verification,evidence,report])=>{if(!active)return;setAutomaticCandidates((discovery.default as unknown as {candidates:BotCandidate[]}).candidates);setHardwareIdentifiers((hardware.default as unknown as {identifiers:BotCandidate[]}).identifiers);setAutomaticRejections((rejected.default as unknown as {candidates:BotCandidate[]}).candidates);setVerifications((verification.default as unknown as {candidates:CandidateVerification[]}).candidates);setManufacturerEvidence(evidence.default as unknown as ManufacturerEvidenceDocument);setCoverageReport(report.default as unknown as DiscoveryReport)});return()=>{active=false}},[])
  const known=useMemo(()=>new Set(products.flatMap(product=>[product.name,product.reference].map(normalizeBotText))),[])
  const categoryBrands=Object.keys(discoveryAliases[category])
  const allCandidates=useMemo(()=>{const merged=new Map(automaticCandidates.map(candidate=>[candidate.id,candidate]));candidates.forEach(candidate=>merged.set(candidate.id,candidate));return [...merged.values()]},[automaticCandidates,candidates])
  const decisionFor=(candidate:BotCandidate):ReviewDecision=>decisions[candidate.id]??'pending'
  const laneCandidates=lane==='products'?allCandidates:lane==='identifiers'?hardwareIdentifiers:automaticRejections
  const shownCandidates=lane==='products'?laneCandidates.filter(candidate=>decisionFor(candidate)===filter):laneCandidates
  const reviewCounts={pending:allCandidates.filter(candidate=>decisionFor(candidate)==='pending').length,verified:allCandidates.filter(candidate=>decisionFor(candidate)==='verified').length,rejected:allCandidates.filter(candidate=>decisionFor(candidate)==='rejected').length}
  const verificationById=useMemo(()=>new Map(verifications.map(item=>[item.candidateId,item])),[verifications])
  const evidenceById=useMemo(()=>new Map((manufacturerEvidence?.evidence??[]).map(item=>[item.candidateId,item])),[manufacturerEvidence])
  const manufacturerVerified=verifications.filter(item=>item.status==='verified').length
  const integratedCount=products.filter(product=>product.candidateId).length
  const triageLabels:Record<CandidateTriage,string>={'retail-product':'Produit précis','product-family':'Famille de produits','component-model':'Composant intégré','hardware-identifier':'Identifiant PCI','false-positive':'Faux positif','needs-review':'Nature à confirmer'}
  const discover=async(brands:string[])=>{
    setRunning(true);setError('');const found:BotCandidate[]=[];let failures=0
    try{
      for(let index=0;index<brands.length;index++){
        const current=brands[index].trim();if(!current)continue
        setProgress(`${index+1}/${brands.length} · ${current}`)
        try{
          const query=discoveryAliases[category][current]??`${current} computer hardware`
          const params=new URLSearchParams({action:'wbsearchentities',search:query,language:'en',uselang:'fr',type:'item',limit:String(Math.min(50,registryConfig.policy.wikidataPageSize??50)),maxlag:String(registryConfig.policy.maxLagSeconds??5),format:'json',formatversion:'2',origin:'*'})
          const response=await fetch(`https://www.wikidata.org/w/api.php?${params}`)
          if(!response.ok)throw new Error(`réponse ${response.status}`)
          const payload=await response.json() as {search?:WikidataSearchResult[]}
          for(const hit of payload.search??[]){const label=hit.label?.trim();if(!label)continue;found.push({id:`live-${hit.id}-${category}`,label,description:hit.description?.trim()||'Description non fournie',url:`https://www.wikidata.org/wiki/${hit.id}`,brand:current,category,duplicate:known.has(normalizeBotText(label)),discoveredAt:new Date().toISOString(),sourceId:'wikidata',kind:'product-candidate',confidence:'Faible',triage:'needs-review',triageReason:'Résultat immédiat non encore classé par le tri automatique.',promotable:false,promotionBlocker:'Lancez le tri automatique puis contrôlez une source constructeur.'})}
        }catch{failures++}
        if(brands.length>1)await new Promise(resolve=>window.setTimeout(resolve,registryConfig.policy.minimumDelayMs))
      }
      setCandidates(previous=>{const merged=new Map(previous.map(candidate=>[candidate.id,candidate]));found.forEach(candidate=>merged.set(candidate.id,candidate));return [...merged.values()].sort((a,b)=>(b.discoveredAt??'').localeCompare(a.discoveredAt??''))})
      setProgress(`${found.length} candidat${found.length>1?'s':''} trouvé${found.length>1?'s':''}${failures?` · ${failures} source${failures>1?'s':''} indisponible${failures>1?'s':''}`:''}`)
      if(failures===brands.length)setError('Wikidata est temporairement indisponible ou limite les requêtes. Réessayez plus tard.')
    }catch(reason){setError(reason instanceof Error?reason.message:'La recherche a échoué.');setProgress('Recherche interrompue')}
    finally{setRunning(false)}
  }
  return <main className="shell app-page bots-page">
    <div className="page-title"><div><span className="eyebrow">BOTS DE DÉCOUVERTE · 0 €</span><h1>Élargir le catalogue, sans inventer.</h1><p>Les bots interrogent des sources ouvertes, détectent les doublons et placent chaque résultat en quarantaine. Aucun candidat n’est publié automatiquement comme fiche fiable.</p></div><div className="result-count"><strong>{reviewCounts.pending}</strong><span>à vérifier</span></div></div>
    <div className="bots-layout"><section className="bot-panel"><div className="bot-heading"><span><Bot/></span><div><Pill tone="green">Automatisation gratuite</Pill><h2>Bot de découverte multimarque</h2><p>{automaticCandidates.length} candidats produits, {hardwareIdentifiers.length} identifiants matériels et {automaticRejections.length} faux positif restent en quarantaine. {coverageReport?.totals.officialCandidates??0} candidats viennent d’index officiels ; {manufacturerEvidence?.summary.collected??0} ont des métadonnées constructeur collectées, {manufacturerVerified} sont validés humainement et {integratedCount} sont intégrés.</p></div></div>
      <div className="bot-controls"><label>Catégorie<select value={category} onChange={event=>setCategory(event.target.value as Category)}>{categoryOrder.map(item=><option key={item} value={item}>{categoryLabels[item]}</option>)}</select></label><label>Marque<input list="discovery-brands" value={brand} onChange={event=>setBrand(event.target.value)} placeholder="Toute marque…"/><datalist id="discovery-brands">{discoveryBrands.map(item=><option key={item} value={item}/>)}</datalist></label></div>
      <div className="bot-actions"><button className="button primary" disabled={running||!brand.trim()} onClick={()=>discover([brand])}><Search/> Rechercher cette marque</button><button className="button secondary" disabled={running} onClick={()=>discover(categoryBrands)}><RefreshCw/> Balayer {categoryBrands.length} marques</button></div>
      <div className={`bot-status ${error?'error':''}`}><span className={running?'pulse':''}></span><div><b>{progress}</b><small>{error||'Résultats candidats uniquement · validation constructeur requise'}</small></div></div>
      {coverageReport&&<section className="coverage-panel" aria-label="Couverture du bot"><div className="coverage-heading"><div><small>COUVERTURE MESURÉE</small><b>{coverageReport.totals.registeredBrands} marques · {coverageReport.totals.registeredQueries} recherches</b></div><span>{officialSources.length} index constructeurs · {coverageReport.totals.categoriesWithCandidates}/{coverageReport.totals.registeredCategories} catégories</span></div><div className="coverage-grid">{coverageReport.coverage.map(item=><article key={item.category} className={item.candidates+item.hardwareIdentifiers?'covered':''}><b>{categoryLabels[item.category]}</b><strong>{item.registeredBrands.length}</strong><small>marques suivies</small><span>{item.candidates+item.hardwareIdentifiers} résultat{item.candidates+item.hardwareIdentifiers>1?'s':''}{item.officialCandidates?` · ${item.officialCandidates} officiels`:''}</span></article>)}</div><p>{coverageReport.collection.status==='not-run'?'Le prochain passage hebdomadaire remplira les nouvelles catégories.':`Dernier passage : ${coverageReport.collection.queriesCompleted}/${coverageReport.collection.queriesAttempted} recherches Wikidata et ${coverageReport.collection.manufacturerIndexesCompleted??0}/${coverageReport.collection.manufacturerIndexesAttempted??officialSources.length} index constructeurs terminés le ${coverageReport.collection.date}.`} Chaque résultat reste en quarantaine.</p></section>}
      <div className="bot-rules"><article><Search/><b>1. Découverte</b><p>Recherche hebdomadaire et immédiate sur sources ouvertes.</p></article><article><ShieldCheck/><b>2. Quarantaine</b><p>Dédoublonnage et validation automatique du format.</p></article><article><Clipboard/><b>3. Décision</b><p>Contrôle humain obligatoire avant publication.</p></article></div>
      <div className="source-links"><a className="source-link" href="https://www.wikidata.org/" target="_blank" rel="noreferrer">Wikidata <ExternalLink/></a><a className="source-link" href="https://pci-ids.ucw.cz/" target="_blank" rel="noreferrer">PCI IDs <ExternalLink/></a>{officialSources.map(source=><a className="source-link" href={source.url} target="_blank" rel="noreferrer" key={source.id}>{source.name} <ExternalLink/></a>)}</div>
    </section><aside className="candidate-panel"><div className="panel-title"><div><small>TRIAGE AUTOMATIQUE</small><h2>Résultats découverts</h2></div>{candidates.length>0&&<button className="text-link danger" onClick={()=>setCandidates([])}>Effacer les recherches manuelles</button>}</div>
      <div className="candidate-lanes" role="tablist" aria-label="Nature des résultats">{([['products','Produits',allCandidates.length],['identifiers','Identifiants PCI',hardwareIdentifiers.length],['false-positives','Faux positifs',automaticRejections.length]] as [CandidateLane,string,number][]).map(([state,label,count])=><button role="tab" aria-selected={lane===state} className={lane===state?'active':''} onClick={()=>setLane(state)} key={state}>{label}<span>{count}</span></button>)}</div>
      {lane==='products'&&<div className="candidate-tabs" role="tablist" aria-label="État des candidats">{([['pending','À vérifier'],['verified','Vérifiés'],['rejected','Rejetés']] as [ReviewDecision,string][]).map(([state,label])=><button role="tab" aria-selected={filter===state} className={filter===state?'active':''} onClick={()=>setFilter(state)} key={state}>{label}<span>{reviewCounts[state]}</span></button>)}</div>}
      <div className="candidate-list">{shownCandidates.length?shownCandidates.map(candidate=>{const proof=verificationById.get(candidate.id),evidence=evidenceById.get(candidate.id);const promotionReady=candidate.promotable&&proof?.status==='verified';const evidenceLabel=evidence?.status==='structured-product'?'Produit structuré':evidence?.status==='page-metadata'?'Métadonnées constructeur':evidence?'Identité insuffisante':null;return <article key={candidate.id}><div><Pill tone={lane==='false-positives'||decisionFor(candidate)==='rejected'?'red':proof?.status==='verified'?'green':proof?.status==='variant-required'||candidate.duplicate||evidence?'yellow':'neutral'}>{lane==='products'&&decisionFor(candidate)==='rejected'?'Rejeté':proof?.status==='verified'?'Validé constructeur':proof?.status==='variant-required'?'Variante requise':lane==='products'&&decisionFor(candidate)==='verified'?'Vérifié localement':evidenceLabel??(candidate.triage?triageLabels[candidate.triage]:candidate.duplicate?'Doublon possible':'À vérifier')}</Pill><h3>{candidate.label}</h3><p>{candidate.description}</p>{proof?<p className="triage-reason">{proof.reason}{proof.requiredField?` Champ requis : ${proof.requiredField}.`:''}{promotionReady?' Promotion autorisée.':' Promotion bloquée.'}</p>:evidence?<p className="triage-reason">{evidence.status==='structured-product'?`Objet produit relevé : ${evidence.identity.name??evidence.page.title}. ${evidence.properties.length} propriété${evidence.properties.length>1?'s':''} structurée${evidence.properties.length>1?'s':''}.`:evidence.status==='page-metadata'?`Titre relevé sur la fiche : ${evidence.page.title}.`:'La fiche officielle ne fournit pas assez de métadonnées pour confirmer l’identité.'} Relecture humaine obligatoire ; promotion bloquée.</p>:candidate.triageReason&&<p className="triage-reason">{candidate.triageReason} Promotion bloquée tant qu’une preuve constructeur n’est pas enregistrée.</p>}<small>{candidate.brand} · {categoryLabels[candidate.category]} · {proof?`source ${proof.manufacturer}`:evidence?'preuve automatique à relire':candidate.sourceId??'recherche locale'} · confiance {candidate.confidence??'Faible'} · {candidate.id}</small></div><div><a href={proof?.officialUrl??evidence?.officialUrl??candidate.url} target="_blank" rel="noreferrer" aria-label={`Vérifier ${candidate.label} à la source`}><ExternalLink/></a><button onClick={()=>navigator.clipboard?.writeText(candidate.id)} aria-label={`Copier l’identifiant de ${candidate.label}`}><Clipboard/></button>{lane==='products'&&decisionFor(candidate)!=='verified'&&<button className="approve-candidate" onClick={()=>setDecisions({...decisions,[candidate.id]:'verified'})} aria-label={`Marquer ${candidate.label} comme vérifié`}><Check/></button>}{lane==='products'&&(decisionFor(candidate)!=='rejected'?<button onClick={()=>setDecisions({...decisions,[candidate.id]:'rejected'})} aria-label={`Rejeter ${candidate.label}`}><X/></button>:<button onClick={()=>setDecisions({...decisions,[candidate.id]:'pending'})} aria-label={`Remettre ${candidate.label} à vérifier`}><RefreshCw/></button>)}</div></article>}):<div className="candidate-empty"><Bot/><b>Aucun candidat dans cette vue</b><p>Changez de filtre ou lancez une nouvelle recherche.</p></div>}</div>
    </aside></div>
  </main>
}

const glossary=[['Socket','Le support physique et électrique reliant le processeur à la carte mère. Les noms doivent correspondre exactement.'],['Chipset','Le contrôleur de la carte mère qui détermine une partie de ses fonctions et des générations CPU prises en charge.'],['TDP','Un indicateur thermique, utile pour dimensionner le refroidissement mais différent de la consommation maximale réelle.'],['VRM','Le circuit qui alimente le processeur. Sa qualité influence températures et stabilité avec un CPU exigeant.'],['XMP / EXPO','Des profils mémoire préconfigurés. XMP est historiquement associé à Intel, EXPO à AMD.'],['PCIe','L’interface des GPU, SSD et cartes d’extension. Les générations sont généralement rétrocompatibles à vitesse réduite.']]
function Glossary(){return <main className="shell app-page"><div className="page-title"><div><span className="eyebrow">GLOSSAIRE</span><h1>Le matériel PC, en langage clair.</h1></div></div><div className="glossary-grid">{glossary.map(([t,d])=><article key={t}><span>{t.slice(0,2).toUpperCase()}</span><h2>{t}</h2><p>{d}</p></article>)}</div></main>}

function DetailModal({ product, close, addCompare, addBuild, estimate }:{product:Product;close:()=>void;addCompare:(p:Product)=>void;addBuild:(p:Product)=>void;estimate:(p:Product)=>void}) {
  const links=[['eBay',`https://www.ebay.fr/sch/i.html?_nkw=${encodeURIComponent(product.name)}`],['Leboncoin',`https://www.leboncoin.fr/recherche?text=${encodeURIComponent(product.name)}`],['Google Shopping',`https://www.google.com/search?tbm=shop&q=${encodeURIComponent(product.name)}`]]
  return <div className="modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)close()}} role="presentation"><article className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title"><button className="modal-close" onClick={close} aria-label="Fermer"><X/></button><div className="detail-hero"><div className="large-product-icon"><IconFor category={product.category}/></div><div><Pill tone="orange">{categoryLabels[product.category]} · {product.status}</Pill><h1 id="detail-title">{product.name}</h1><p>{product.brand} · {product.reference} · Sortie {product.year??'à vérifier'}</p></div></div><div className="detail-actions"><button className="button primary" onClick={()=>addCompare(product)}><BarChart3/> Comparer</button><button className="button secondary" onClick={()=>addBuild(product)}><Plus/> Ajouter à ma configuration</button><button className="button secondary" onClick={()=>estimate(product)}>€ Estimer une annonce</button></div>
    <div className="detail-score-grid"><div><small>Indice performance</small><strong>{product.performance??'—'}</strong></div><div><small>Indice valeur</small><strong>{valueScore(product)??'—'}</strong></div><div><small>Prix neuf indicatif</small><strong>{money(product.newPrice)}</strong></div><div><small>Prix occasion indicatif</small><strong>{money(product.usedPrice)}</strong></div><div><small>Confiance</small><strong>{product.confidence}</strong></div></div>
    <div className="detail-columns"><section><h2>Caractéristiques</h2><dl>{Object.entries(product.specs).map(([k,v])=><div key={k}><dt>{k}</dt><dd>{v==null?'À vérifier':Array.isArray(v)?v.join(', '):String(v)}</dd></div>)}</dl></section><aside><div className="pros-cons"><h3>Points forts</h3>{product.strengths.map(x=><p className="pro" key={x}><Check/>{x}</p>)}<h3>Points faibles</h3>{product.weaknesses.map(x=><p className="con" key={x}><TriangleAlert/>{x}</p>)}</div><div className="notice"><TriangleAlert/><p><b>À savoir</b>{product.notes}</p></div><div><small>Usage conseillé</small><p>{product.usage}</p></div></aside></div>
    <div className="external-links">{links.map(([name,url])=><a key={name} href={url} target="_blank" rel="noreferrer">Rechercher sur {name}<ExternalLink/></a>)}</div>{product.source&&<a className="source-link" href={product.source} target="_blank" rel="noreferrer">Source constructeur disponible <ExternalLink/></a>}</article></div>
}

function Footer({navigate}:{navigate:(p:Page)=>void}){return <footer><div className="shell footer-grid"><div><Logo/><p>Ta configuration. Les bons composants. Le juste prix.</p></div><div><b>Outils</b><button onClick={()=>navigate('catalog')}>Catalogue</button><button onClick={()=>navigate('builder')}>Configurateur</button><button onClick={()=>navigate('estimate')}>Estimateur</button><button onClick={()=>navigate('bots')}>Bots catalogue</button></div><div><b>Comprendre</b><button onClick={()=>navigate('glossary')}>Glossaire</button><span>Prix indicatifs, jamais en direct</span><span>Catalogue local évolutif</span></div><div className="footer-note"><ShieldCheck/><p>ConfigPilot ne remplace pas la vérification des références exactes, du BIOS et des annonces réelles avant achat.</p></div></div><div className="shell copyright">© {new Date().getFullYear()} ConfigPilot <span>Version locale 1.7.0</span></div></footer>}

export default function App(){
  const initialHash=location.hash.replace('#','').split('?')[0] as Page
  const [page,setPage]=useState<Page>(validPages.includes(initialHash)?initialHash:'home'),[dark,setDark]=useStoredState('configpilot:dark',false),[compare,setCompare]=useStoredState<string[]>('configpilot:compare',[]),[build,setBuildState]=useStoredState<Build>('configpilot:build',{...louisBuild}),[favorites,setFavorites]=useStoredState<string[]>('configpilot:favorites',[]),[detail,setDetail]=useState<Product|null>(null)
  const [listing,setListing]=useState<ListingInput>({productId:'cpu-9900kf',price:200,shipping:0,protection:0,condition:'good',box:false,invoice:false,warranty:false,tested:true,benchmarks:false,professional:false})
  useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light'},[dark])
  useEffect(()=>{const raw=location.hash.split('build=')[1];if(raw){try{setBuildState(JSON.parse(decodeURIComponent(escape(atob(raw)))))}catch{/* invalid shared build */}}},[setBuildState])
  useEffect(()=>{
    const syncPageFromHash=()=>{
      const next=location.hash.replace('#','').split('?')[0] as Page
      setPage(validPages.includes(next)?next:'home')
    }
    window.addEventListener('hashchange',syncPageFromHash)
    return()=>window.removeEventListener('hashchange',syncPageFromHash)
  },[])
  const navigate=(next:Page)=>{setPage(next);location.hash=next;window.scrollTo({top:0,behavior:'smooth'})}
  const addCompare=(p:Product)=>{const current=compare.map(getProduct).filter(Boolean) as Product[];setCompare(current.length&&current[0].category!==p.category?[p.id]:compare.includes(p.id)?compare:compare.length<4?[...compare,p.id]:compare);setDetail(null);navigate('compare')}
  const addBuild=(p:Product)=>{setBuildState({...build,[p.category]:p.id});setDetail(null);navigate('builder')}
  const estimate=(p:Product)=>{setListing({...listing,productId:p.id});setDetail(null);navigate('estimate')}
  return <div className="app"><Header page={page} navigate={navigate} dark={dark} setDark={setDark}/>{page==='home'&&<Home navigate={navigate}/>} {page==='catalog'&&<Catalog compare={compare} setCompare={setCompare} onDetail={setDetail} navigate={navigate} setBuild={setBuildState} favorites={favorites} setFavorites={setFavorites} estimatorSelect={id=>setListing({...listing,productId:id})}/>} {page==='compare'&&<Compare ids={compare} setIds={setCompare} onDetail={setDetail} navigate={navigate}/>} {page==='builder'&&<Builder build={build} setBuild={setBuildState} navigate={navigate}/>} {page==='estimate'&&<Estimator input={listing} setInput={setListing}/>} {page==='recommend'&&<Recommend navigate={navigate} setBuild={setBuildState}/>} {page==='bots'&&<CatalogBots/>} {page==='glossary'&&<Glossary/>}<Footer navigate={navigate}/>{detail&&<DetailModal product={detail} close={()=>setDetail(null)} addCompare={addCompare} addBuild={addBuild} estimate={estimate}/>}</div>
}
