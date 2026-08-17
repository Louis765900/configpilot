import { useMemo, useState } from 'react'
import { ArrowRight, Clipboard, RefreshCw, Share2, Trash2 } from 'lucide-react'
import { categoryLabels, products, starterBuilds } from '../data'
import { buildSummary, categoryOrder, formatSpec, getProduct, money } from '../engine'
import { buildVerdict, checkCompatibility } from '../compatibility'
import { Panel, StatusBadge, StatusIcon } from '../ui'
import { PartArt } from '../illustrations'
import type { Build, CheckGroup, Category } from '../types'
import type { Route } from '../routes'

const GROUP_ORDER: CheckGroup[] = ['Plateforme', 'Mémoire', 'Refroidissement', 'Alimentation', 'Intégration', 'Stockage']
const SUMMARY_SPEC: Partial<Record<Category, string[]>> = {
  cpu: ['Socket', 'Cœurs', 'TDP'],
  gpu: ['VRAM', 'Consommation (W)', 'Longueur (mm)'],
  motherboard: ['Chipset', 'Format', 'RAM'],
  ram: ['Type', 'Capacité', 'Fréquence'],
  psu: ['Puissance', 'Certification'],
  case: ['Format', 'GPU max (mm)'],
  storage: ['Type', 'Capacité'],
  cooling: ['Type', 'Capacité thermique'],
  expansion: ['Type', 'Interface'],
}

export default function Builder({ build, setBuild, go }: {
  build: Build
  setBuild: (build: Build) => void
  go: (route: Route) => void
}) {
  const [saved, setSaved] = useState<{ name: string; build: Build }[]>(() => {
    try { return JSON.parse(localStorage.getItem('configpilot:saved-builds') ?? '[]') } catch { return [] }
  })
  const [copied, setCopied] = useState('')

  const checks = useMemo(() => checkCompatibility(build), [build])
  const verdict = useMemo(() => buildVerdict(checks), [checks])
  const summary = buildSummary(build)
  const filled = categoryOrder.filter(category => build[category]).length

  const persist = (next: { name: string; build: Build }[]) => {
    setSaved(next)
    localStorage.setItem('configpilot:saved-builds', JSON.stringify(next))
  }
  const asText = () => categoryOrder
    .map(category => `${categoryLabels[category]} : ${getProduct(build[category])?.name ?? 'non sélectionné'}`)
    .join('\n') + `\nTotal indicatif : ${money(summary.total)}`
  const copy = async (text: string, message: string) => {
    try { await navigator.clipboard.writeText(text); setCopied(message) } catch { setCopied('Copie refusée par le navigateur') }
  }

  return (
    <div className="view">
      <div className="page-head">
        <div>
          <span className="eyebrow">Configurateur</span>
          <h1>Assemblez. On contrôle chaque croisement.</h1>
          <p>Chaque contrôle indique la règle appliquée et les champs de fiche sur lesquels il se prononce. Une donnée absente n’est jamais interprétée en votre faveur.</p>
        </div>
        <div className="head-actions">
          <select className="btn secondary" aria-label="Charger une base"
            value="" onChange={event => { const found = starterBuilds.find(item => item.id === event.target.value); if (found) setBuild({ ...found.build } as Build) }}>
            <option value="">Charger une base…</option>
            {starterBuilds.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <button className="btn ghost" onClick={() => setBuild({})}><Trash2 /> Vider</button>
        </div>
      </div>

      <div className="builder">
        <section className="stack">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h2>Composants ({filled}/{categoryOrder.length})</h2>
            <span className="badge">{summary.priced} fiche{summary.priced > 1 ? 's' : ''} chiffrée{summary.priced > 1 ? 's' : ''}</span>
          </div>

          <div className="slot-list">
            {categoryOrder.map(category => {
              const item = getProduct(build[category])
              const choices = products.filter(product => product.category === category)
              return (
                <div className={`slot ${item ? 'filled' : 'empty-slot'}`} key={category}>
                  <div className="art-frame sm"><PartArt category={category} product={item} /></div>
                  <div style={{ minWidth: 0 }}>
                    <div className="slot-label">{categoryLabels[category]}</div>
                    {item ? (
                      <>
                        <h3>{item.name}</h3>
                        <div className="detail">
                          {(SUMMARY_SPEC[category] ?? []).filter(key => key in item.specs)
                            .map(key => `${key} ${formatSpec(item.specs[key])}`).join(' · ') || item.reference}
                          {' · '}{money(item.newPrice ?? item.usedPrice)}
                        </div>
                      </>
                    ) : <h3 className="muted" style={{ fontWeight: 500 }}>Aucun composant sélectionné</h3>}
                  </div>
                  <div className="slot-actions">
                    <select aria-label={`Choisir ${categoryLabels[category]}`} value={build[category] ?? ''}
                      onChange={event => {
                        const next = { ...build }
                        if (event.target.value) next[category] = event.target.value
                        else delete next[category]
                        setBuild(next)
                      }}>
                      <option value="">Choisir…</option>
                      {choices.map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
                    </select>
                    {item && (
                      <button className="btn ghost" onClick={() => go({ page: 'product', id: item.id })} aria-label={`Ouvrir la fiche de ${item.name}`}>
                        Fiche
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <div className="row">
            <button className="btn primary" onClick={() => persist([...saved, { name: `Configuration ${saved.length + 1}`, build }])}>
              Sauvegarder localement
            </button>
            <button className="btn secondary" onClick={() => copy(asText(), 'Configuration copiée')}><Clipboard /> Copier</button>
            <button className="btn secondary" onClick={() => {
              const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(build))))
              const url = `${location.origin}${location.pathname}#builder?build=${encoded}`
              copy(url, 'Lien de partage copié')
            }}><Share2 /> Partager</button>
            {copied && <span className="badge ok">{copied}</span>}
          </div>

          {saved.length > 0 && (
            <Panel title="Configurations sauvegardées" hint="Stockées dans ce navigateur">
              <div className="stack tight">
                {saved.map((entry, index) => (
                  <div className="metric" key={index}>
                    <span>{entry.name} — {Object.keys(entry.build).length} composants</span>
                    <span className="row">
                      <button className="btn ghost" onClick={() => setBuild(entry.build)}>Charger</button>
                      <button className="btn danger" onClick={() => persist(saved.filter((_, position) => position !== index))}>Supprimer</button>
                    </span>
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </section>

        <aside className="stack">
          <div className={`verdict-banner ${verdict.status === 'unknown' ? 'unknown' : verdict.status}`}>
            <span className="icon"><StatusIcon status={verdict.status} /></span>
            <div>
              <h2>{verdict.title}</h2>
              <p>{verdict.detail}</p>
            </div>
          </div>

          <div className="grid cols-2">
            <div className="kpi"><small>Total indicatif</small><strong>{money(summary.total)}</strong><span>{summary.priced}/{summary.parts} fiches chiffrées</span></div>
            <div className="kpi"><small>Consommation</small><strong>{summary.estimated} W</strong><span>{summary.recommended} W conseillés</span></div>
            <div className="kpi"><small>Indice jeu</small><strong>{summary.gaming ?? '—'}</strong><span>{summary.balance}</span></div>
            <div className="kpi"><small>Indice applicatif</small><strong>{summary.application ?? '—'}</strong><span>Processeur pondéré</span></div>
          </div>

          <Panel title="Diagnostic" hint={`${checks.length} contrôles`}>
            <div className="row" style={{ marginBottom: 14 }}>
              {(['error', 'warning', 'unknown', 'ok'] as const).filter(status => verdict.counts[status] > 0)
                .map(status => <StatusBadge key={status} status={status} label={`${verdict.counts[status]} ${status === 'error' ? 'conflit' : status === 'warning' ? 'à confirmer' : status === 'unknown' ? 'sans donnée' : 'validés'}`} />)}
            </div>
            {GROUP_ORDER.filter(group => checks.some(check => check.group === group)).map(group => (
              <div key={group} style={{ marginBottom: 16 }}>
                <h3 className="mono" style={{ fontSize: 11, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--on-surface-variant)', marginBottom: 8 }}>{group}</h3>
                <div className="diag">
                  {checks.filter(check => check.group === group).map(check => (
                    <div className={`diag-item ${check.status}`} key={check.id}>
                      <StatusIcon status={check.status} />
                      <div>
                        <b>{check.label}</b>
                        <p>{check.detail}</p>
                        <div className="basis">Champs lus : {check.basis}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Panel>

          <button className="btn secondary block" onClick={() => go({ page: 'advisor' })}>
            <RefreshCw /> Voir une base conseillée <ArrowRight />
          </button>
        </aside>
      </div>
    </div>
  )
}
