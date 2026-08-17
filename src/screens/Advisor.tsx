import { useMemo, useState } from 'react'
import { ArrowRight, Sparkles } from 'lucide-react'
import { categoryLabels, starterBuilds } from '../data'
import { buildSummary, categoryOrder, getProduct, money } from '../engine'
import { buildVerdict, checkCompatibility } from '../compatibility'
import { Panel, StatusIcon } from '../ui'
import { PartArt } from '../illustrations'
import type { Build } from '../types'
import type { Route } from '../routes'

/** Bases publiques, choisies par budget et résolution. Aucune n'est générée à la volée. */
const RECOMMENDATIONS: { max: number; resolutions: string[]; starter: string }[] = [
  { max: 900, resolutions: ['1080p', '1440p', '4K'], starter: 'am4-budget' },
  { max: 1400, resolutions: ['1080p'], starter: 'itx-compact' },
  { max: 1400, resolutions: ['1440p', '4K'], starter: 'am5-1440p' },
  { max: Infinity, resolutions: ['1080p', '1440p', '4K'], starter: 'am5-1440p' },
]

export default function Advisor({ go, loadBuild }: { go: (route: Route) => void; loadBuild: (build: Build) => void }) {
  const [budget, setBudget] = useState(1200)
  const [resolution, setResolution] = useState('1440p')
  const [compact, setCompact] = useState(false)

  const chosen = useMemo(() => {
    if (compact) return starterBuilds.find(item => item.id === 'itx-compact')!
    const match = RECOMMENDATIONS.find(rule => budget <= rule.max && rule.resolutions.includes(resolution))
    return starterBuilds.find(item => item.id === (match?.starter ?? 'am5-1440p'))!
  }, [budget, resolution, compact])

  const build = chosen.build as Build
  const summary = buildSummary(build)
  const verdict = buildVerdict(checkCompatibility(build))
  const overBudget = summary.total > budget

  return (
    <div className="view">
      <div className="page-head">
        <div>
          <span className="eyebrow">Assistant</span>
          <h1>Le bon équilibre, pas le plus gros score.</h1>
          <p>L’assistant propose une base publique déjà vérifiée par le configurateur. Elle reste entièrement modifiable ensuite.</p>
        </div>
      </div>

      <div className="sheet-layout">
        <Panel title="Vos priorités">
          <div className="stack">
            <label className="field">
              <span>Budget total <b className="suffix">{budget} €</b></span>
              <input type="range" min="500" max="2500" step="50" value={budget} onChange={event => setBudget(Number(event.target.value))} />
            </label>
            <label className="field">
              <span>Résolution visée</span>
              <select value={resolution} onChange={event => setResolution(event.target.value)}>
                <option>1080p</option><option>1440p</option><option>4K</option>
              </select>
            </label>
            <label className={`check ${compact ? 'on' : ''}`}>
              <input type="checkbox" checked={compact} onChange={event => setCompact(event.target.checked)} />
              Boîtier compact obligatoire
            </label>
            <div className="notice">
              <Sparkles />
              <p>
                <b>Comment la base est choisie.</b>
                Les propositions sont un petit nombre de configurations publiques écrites à la main, contrôlées par le
                même moteur de compatibilité que le configurateur. Rien n’est assemblé automatiquement à partir de prix
                du moment, faute de relevé marchand.
              </p>
            </div>
          </div>
        </Panel>

        <div className="stack">
          <div className={`verdict-banner ${verdict.status === 'unknown' ? 'unknown' : verdict.status}`}>
            <span className="icon"><StatusIcon status={verdict.status} /></span>
            <div>
              <h2>{chosen.name}</h2>
              <p>{verdict.title} · {chosen.summary}</p>
            </div>
          </div>

          <Panel title="Configuration proposée" hint={`${money(summary.total)} indicatif`}>
            <div className="slot-list">
              {categoryOrder.filter(category => build[category]).map(category => {
                const item = getProduct(build[category])!
                return (
                  <button className="slot filled" key={category} onClick={() => go({ page: 'product', id: item.id })}>
                    <div className="art-frame sm"><PartArt category={category} product={item} /></div>
                    <div style={{ minWidth: 0, textAlign: 'left' }}>
                      <div className="slot-label">{categoryLabels[category]}</div>
                      <h3>{item.name}</h3>
                    </div>
                    <span className="mono">{money(item.newPrice ?? item.usedPrice)}</span>
                  </button>
                )
              })}
            </div>
          </Panel>

          <div className="grid cols-3">
            <div className="kpi"><small>Indice jeu</small><strong>{summary.gaming ?? '—'}</strong><span>{summary.balance}</span></div>
            <div className="kpi"><small>Alimentation</small><strong>{summary.recommended} W</strong><span>{summary.estimated} W estimés</span></div>
            <div className="kpi"><small>Total</small><strong>{money(summary.total)}</strong><span>{overBudget ? 'Au-dessus du budget' : 'Dans le budget'}</span></div>
          </div>

          {overBudget && (
            <div className="notice warn">
              <Sparkles />
              <p><b>Au-dessus du budget indiqué.</b> Le total indicatif dépasse {budget} €. Baisse la résolution visée ou remplace la carte graphique depuis le configurateur.</p>
            </div>
          )}

          <button className="btn primary block" onClick={() => { loadBuild(build); go({ page: 'builder' }) }}>
            Ouvrir dans le configurateur <ArrowRight />
          </button>
        </div>
      </div>
    </div>
  )
}
