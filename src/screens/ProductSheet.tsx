import { ArrowLeft, BarChart3, Calculator, Check, ExternalLink, Info, Plus, TriangleAlert, X } from 'lucide-react'
import { categoryLabels, products } from '../data'
import { money, valueScore } from '../engine'
import { categoryValueMedian, priceInsight } from '../pricing'
import { Empty, Panel, PriceChart, SpecSheet } from '../ui'
import { PartArt } from '../illustrations'
import type { Product } from '../types'
import type { Route } from '../routes'

const REASON_ICON = { ok: <Check />, warning: <TriangleAlert />, error: <X />, info: <Info /> }

export default function ProductSheet({ product, go, addToBuild, toggleCompare, compare, estimate }: {
  product?: Product
  go: (route: Route) => void
  addToBuild: (product: Product) => void
  toggleCompare: (product: Product) => void
  compare: string[]
  estimate: (product: Product) => void
}) {
  if (!product) {
    return (
      <div className="view">
        <Empty title="Référence introuvable" text="Cette fiche n’existe pas ou a été retirée du catalogue." />
        <div className="row" style={{ justifyContent: 'center' }}>
          <button className="btn secondary" onClick={() => go({ page: 'catalog' })}><ArrowLeft /> Retour au catalogue</button>
        </div>
      </div>
    )
  }

  const insight = priceInsight(product)
  const { track } = insight
  const median = categoryValueMedian(product.category)
  const value = valueScore(product)
  const neighbours = products
    .filter(item => item.category === product.category && item.id !== product.id && item.performance != null && product.performance != null)
    .sort((left, right) => Math.abs((left.performance ?? 0) - product.performance!) - Math.abs((right.performance ?? 0) - product.performance!))
    .slice(0, 4)

  return (
    <div className="view">
      <div className="row" style={{ marginBottom: 16 }}>
        <button className="btn ghost" onClick={() => go({ page: 'catalog', category: product.category })}>
          <ArrowLeft /> {categoryLabels[product.category]}
        </button>
      </div>

      <header className="sheet-head">
        <div className="art-frame lg"><PartArt category={product.category} product={product} /></div>
        <div className="sheet-title">
          <div className="row" style={{ marginBottom: 10 }}>
            <span className="badge">{categoryLabels[product.category]}</span>
            <span className={`badge ${product.status === 'Détaillée' ? 'ok' : ''}`}>Fiche {product.status.toLowerCase()}</span>
            <span className="badge">Confiance {product.confidence.toLowerCase()}</span>
          </div>
          <h1>{product.name}</h1>
          <p className="ref">{product.brand} · {product.reference} · {product.series} · sortie {product.year ?? 'à vérifier'}</p>
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn primary" onClick={() => { addToBuild(product); go({ page: 'builder' }) }}>
              <Plus /> Ajouter à ma configuration
            </button>
            <button className="btn secondary" onClick={() => toggleCompare(product)}>
              <BarChart3 /> {compare.includes(product.id) ? 'Retirer du comparateur' : 'Comparer'}
            </button>
            <button className="btn secondary" onClick={() => estimate(product)}>
              <Calculator /> Estimer une annonce
            </button>
          </div>
        </div>
      </header>

      <div className="sheet-layout">
        <div className="stack">
          <Panel title="Trajectoire de prix" hint={track.launch != null ? `Depuis ${product.year}` : 'Données partielles'}>
            <div className="grid cols-4" style={{ marginBottom: 18 }}>
              <div className="kpi">
                <small>Lancement</small>
                <strong>{money(track.launch)}</strong>
                <span>Tarif conseillé{product.year ? ` en ${product.year}` : ''}</span>
              </div>
              <div className="kpi">
                <small>Neuf indicatif</small>
                <strong>{money(track.current)}</strong>
                <span>Repère calculé localement</span>
              </div>
              <div className="kpi">
                <small>Occasion indicative</small>
                <strong>{money(track.used)}</strong>
                <span>Repère calculé localement</span>
              </div>
              <div className="kpi">
                <small>Décote</small>
                <strong>{track.dropPercent == null ? '—' : `${track.dropPercent} %`}</strong>
                <span>{track.annualPercent == null ? 'Non mesurable' : `≈ ${track.annualPercent} % par an`}</span>
              </div>
            </div>
            <PriceChart track={track} />
            <div className="notice" style={{ marginTop: 16 }}>
              <Info />
              <p>
                <b>Trajectoire modélisée, pas relevée.</b>
                {track.method} ConfigPilot n’interroge aucune marketplace et n’affiche aucun prix marchand en direct :
                seuls le tarif de lancement et les repères du catalogue servent d’ancres.
                {(product.observations?.length ?? 0) === 0 && ' Aucun relevé manuel n’a encore été saisi pour cette référence.'}
              </p>
            </div>
          </Panel>

          <Panel title="Caractéristiques techniques" hint={`${Object.keys(product.specs).length} champs documentés`}>
            <SpecSheet product={product} />
          </Panel>

          <div className="grid cols-2">
            <Panel title="Points forts">
              <ul className="reason-list">
                {product.strengths.map(item => <li className="ok" key={item}><Check /><span>{item}</span></li>)}
              </ul>
            </Panel>
            <Panel title="Points faibles">
              <ul className="reason-list">
                {product.weaknesses.map(item => <li className="warn" key={item}><TriangleAlert /><span>{item}</span></li>)}
              </ul>
            </Panel>
          </div>
        </div>

        <div className="stack">
          <div className="verdict-card">
            <span className="eyebrow mono" style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--accent)' }}>
              Vaut-il le coup aujourd’hui ?
            </span>
            <h3>{insight.verdict}</h3>
            <div className="score">
              <b>{insight.score ?? '—'}</b>
              <span>/ 100 · confiance {insight.confidence.toLowerCase()}</span>
            </div>
            <div className="bar"><i style={{ width: `${insight.score ?? 0}%` }} /></div>
            <ul className="reason-list">
              {insight.reasons.map(reason => (
                <li className={reason.status} key={reason.text}>
                  {REASON_ICON[reason.status]}
                  <span>{reason.text}</span>
                </li>
              ))}
            </ul>
            <p className="muted" style={{ fontSize: 11 }}>
              Verdict calculé à partir de la décote observée, du rapport performance/prix face à la catégorie,
              de l’âge et de l’état de la plateforme. Il ne remplace pas la consultation d’annonces réelles.
            </p>
          </div>

          <Panel title="Indices">
            <dl style={{ margin: 0 }}>
              <div className="metric"><dt>Performance</dt><dd className="big">{product.performance ?? 'À vérifier'}</dd></div>
              <div className="metric"><dt>Performance par euro</dt><dd>{value ?? 'À vérifier'}</dd></div>
              <div className="metric"><dt>Médiane de la catégorie</dt><dd>{median ?? 'À vérifier'}</dd></div>
            </dl>
          </Panel>

          <Panel title="À savoir">
            <p style={{ fontSize: 13, lineHeight: 1.6 }} className="muted">{product.notes}</p>
            <p style={{ fontSize: 13, marginTop: 10 }}>{product.usage}</p>
            {product.source && (
              <a className="btn secondary block" style={{ marginTop: 14 }} href={product.source} target="_blank" rel="noreferrer">
                Fiche constructeur <ExternalLink />
              </a>
            )}
          </Panel>

          <Panel title="Vérifier le prix réel" hint="Recherches, pas de relevé">
            <div className="market-links">
              <a href={`https://www.ldlc.com/recherche/${encodeURIComponent(product.name)}/`} target="_blank" rel="noreferrer">LDLC <ExternalLink /></a>
              <a href={`https://www.leboncoin.fr/recherche?text=${encodeURIComponent(product.name)}`} target="_blank" rel="noreferrer">Leboncoin <ExternalLink /></a>
              <a href={`https://www.ebay.fr/sch/i.html?_nkw=${encodeURIComponent(product.name)}`} target="_blank" rel="noreferrer">eBay <ExternalLink /></a>
            </div>
            <p className="muted" style={{ fontSize: 11, marginTop: 10 }}>
              Ces liens ouvrent une recherche chez le marchand. ConfigPilot ne lit ni ne stocke leurs prix.
            </p>
          </Panel>

          {neighbours.length > 0 && (
            <Panel title="Références proches">
              <div className="stack tight">
                {neighbours.map(item => (
                  <button className="metric" style={{ width: '100%', textAlign: 'left' }} key={item.id}
                    onClick={() => go({ page: 'product', id: item.id })}>
                    <span>{item.name}</span>
                    <strong>{item.performance ?? '—'}</strong>
                  </button>
                ))}
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}
