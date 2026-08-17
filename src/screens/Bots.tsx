import { useEffect, useMemo, useState } from 'react'
import { Bot, Check, Clipboard, ExternalLink, RefreshCw, Search, ShieldCheck, X } from 'lucide-react'
import { categoryLabels, products } from '../data'
import { categoryOrder } from '../engine'
import { Empty, Panel } from '../ui'
import sourceRegistry from '../catalog/source-registry.json'
import type { Category } from '../types'

type Triage = 'retail-product' | 'product-family' | 'component-model' | 'hardware-identifier' | 'false-positive' | 'needs-review'
type Candidate = {
  id: string; label: string; description: string; url: string; brand: string; category: Category
  duplicate: boolean; discoveredAt?: string; sourceId?: string; confidence?: string
  triage?: Triage; triageReason?: string; promotable?: boolean
}
type Verification = { candidateId: string; status: 'verified' | 'variant-required' | 'rejected'; manufacturer: string; officialUrl: string; reason: string; requiredField?: string }
type Evidence = { candidateId: string; status: 'structured-product' | 'page-metadata' | 'insufficient-metadata'; officialUrl: string; identity: Record<string, string>; page: { title: string } ; properties: unknown[] }
type EvidenceDoc = { summary: { collected: number }; evidence: Evidence[] }
type SpecConfidence = 'high' | 'medium' | 'low'
type NormalizedSpec = { field: string; label: string; rawField: string; rawValue: string; value: string | number | boolean | string[]; unit: string | null; method: string; confidence: SpecConfidence }
type SpecRecord = { candidateId: string; officialUrl: string; collectedAt: string; specs: NormalizedSpec[]; missingFields: string[]; review: { reason: string } }
type SpecDoc = { summary: { collected: number; remaining: number; rawValues: number; normalizedValues: number; byConfidence: Record<SpecConfidence, number> }; records: SpecRecord[] }
type Report = { totals: { registeredBrands: number; registeredQueries: number; officialCandidates: number; categoriesWithCandidates: number; registeredCategories: number }; collection: { status: string; date: string | null }; coverage: { category: Category; registeredBrands: string[]; candidates: number; officialCandidates: number; hardwareIdentifiers: number }[] }

const registry = sourceRegistry as { policy: { minimumDelayMs: number; wikidataPageSize?: number; maxLagSeconds?: number }; sources: { id: string; name: string; type: string; url: string; enabled: boolean }[]; queries: { category: Category; brand: string; query: string }[] }
const officialSources = registry.sources.filter(source => source.enabled && source.type === 'manufacturer-index')
const aliases = categoryOrder.reduce((groups, category) => ({
  ...groups, [category]: Object.fromEntries(registry.queries.filter(query => query.category === category).map(query => [query.brand, query.query])),
}), {} as Record<Category, Record<string, string>>)
const CONFIDENCE_LABEL: Record<SpecConfidence, string> = { high: 'Confiance élevée', medium: 'Confiance moyenne', low: 'Confiance faible' }
const METHOD_LABEL: Record<string, string> = {
  'json-ld': 'JSON-LD', 'spec-table': 'Tableau constructeur', 'definition-list': 'Liste de définitions',
  'spec-list': 'Liste étiquetée', meta: 'Métadonnées de page',
}
const TRIAGE_LABEL: Record<Triage, string> = {
  'retail-product': 'Produit précis', 'product-family': 'Famille de produits', 'component-model': 'Composant intégré',
  'hardware-identifier': 'Identifiant PCI', 'false-positive': 'Faux positif', 'needs-review': 'Nature à confirmer',
}
const formatValue = (spec: NormalizedSpec) =>
  Array.isArray(spec.value) ? spec.value.join(', ')
    : typeof spec.value === 'boolean' ? (spec.value ? 'Oui' : 'Non')
      : `${spec.value}${spec.unit ? ` ${spec.unit}` : ''}`
const flatten = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export default function Bots() {
  const [category, setCategory] = useState<Category>('motherboard')
  const [brand, setBrand] = useState('ASUS')
  const [lane, setLane] = useState<'products' | 'identifiers' | 'false-positives'>('products')
  const [running, setRunning] = useState(false)
  const [progress, setProgress] = useState('Prêt')
  const [error, setError] = useState('')
  const [live, setLive] = useState<Candidate[]>([])
  const [decisions, setDecisions] = useState<Record<string, 'pending' | 'verified' | 'rejected'>>(() => {
    try { return JSON.parse(localStorage.getItem('configpilot:bot-decisions') ?? '{}') } catch { return {} }
  })
  const [feed, setFeed] = useState<{ candidates: Candidate[]; identifiers: Candidate[]; rejected: Candidate[]; verifications: Verification[]; evidence: EvidenceDoc | null; specs: SpecDoc | null; report: Report | null }>(
    { candidates: [], identifiers: [], rejected: [], verifications: [], evidence: null, specs: null, report: null })

  useEffect(() => {
    let active = true
    Promise.all([
      import('../catalog/discovery.generated.json'), import('../catalog/hardware-identifiers.generated.json'),
      import('../catalog/rejected.generated.json'), import('../catalog/candidate-verification.generated.json'),
      import('../catalog/manufacturer-evidence.generated.json'), import('../catalog/manufacturer-specs.generated.json'),
      import('../catalog/discovery-report.generated.json'),
    ]).then(([discovery, hardware, rejected, verification, evidence, specs, report]) => {
      if (!active) return
      setFeed({
        candidates: (discovery.default as any).candidates, identifiers: (hardware.default as any).identifiers,
        rejected: (rejected.default as any).candidates, verifications: (verification.default as any).candidates,
        evidence: evidence.default as unknown as EvidenceDoc, specs: specs.default as unknown as SpecDoc,
        report: report.default as unknown as Report,
      })
    })
    return () => { active = false }
  }, [])

  const known = useMemo(() => new Set(products.flatMap(product => [product.name, product.reference].map(flatten))), [])
  const all = useMemo(() => {
    const merged = new Map(feed.candidates.map(candidate => [candidate.id, candidate]))
    live.forEach(candidate => merged.set(candidate.id, candidate))
    return [...merged.values()]
  }, [feed.candidates, live])
  const verificationById = useMemo(() => new Map(feed.verifications.map(item => [item.candidateId, item])), [feed.verifications])
  const evidenceById = useMemo(() => new Map((feed.evidence?.evidence ?? []).map(item => [item.candidateId, item])), [feed.evidence])
  const specsById = useMemo(() => new Map((feed.specs?.records ?? []).map(item => [item.candidateId, item])), [feed.specs])
  const verified = feed.verifications.filter(item => item.status === 'verified').length
  const integrated = products.filter(product => product.candidateId).length
  const shown = lane === 'products' ? all.filter(candidate => (decisions[candidate.id] ?? 'pending') === 'pending')
    : lane === 'identifiers' ? feed.identifiers : feed.rejected

  const decide = (id: string, decision: 'pending' | 'verified' | 'rejected') => {
    const next = { ...decisions, [id]: decision }
    setDecisions(next)
    localStorage.setItem('configpilot:bot-decisions', JSON.stringify(next))
  }

  const discover = async (brands: string[]) => {
    setRunning(true); setError('')
    const found: Candidate[] = []
    let failures = 0
    for (let index = 0; index < brands.length; index += 1) {
      const current = brands[index].trim()
      if (!current) continue
      setProgress(`${index + 1}/${brands.length} · ${current}`)
      try {
        const params = new URLSearchParams({
          action: 'wbsearchentities', search: aliases[category][current] ?? `${current} computer hardware`,
          language: 'en', uselang: 'fr', type: 'item', limit: String(Math.min(50, registry.policy.wikidataPageSize ?? 50)),
          maxlag: String(registry.policy.maxLagSeconds ?? 5), format: 'json', formatversion: '2', origin: '*',
        })
        const response = await fetch(`https://www.wikidata.org/w/api.php?${params}`)
        if (!response.ok) throw new Error(String(response.status))
        const payload = await response.json() as { search?: { id: string; label?: string; description?: string }[] }
        for (const hit of payload.search ?? []) {
          const label = hit.label?.trim()
          if (!label) continue
          found.push({
            id: `live-${hit.id}-${category}`, label, description: hit.description?.trim() || 'Description non fournie',
            url: `https://www.wikidata.org/wiki/${hit.id}`, brand: current, category,
            duplicate: known.has(flatten(label)), discoveredAt: new Date().toISOString(), sourceId: 'wikidata',
            confidence: 'Faible', triage: 'needs-review',
            triageReason: 'Résultat immédiat non encore classé par le tri automatique.', promotable: false,
          })
        }
      } catch { failures += 1 }
      if (brands.length > 1) await new Promise(resolve => window.setTimeout(resolve, registry.policy.minimumDelayMs))
    }
    setLive(previous => [...new Map([...previous, ...found].map(item => [item.id, item])).values()])
    setProgress(`${found.length} candidat${found.length > 1 ? 's' : ''} trouvé${found.length > 1 ? 's' : ''}`)
    if (failures === brands.length) setError('Wikidata est momentanément indisponible ou limite les requêtes.')
    setRunning(false)
  }

  const categoryBrands = Object.keys(aliases[category])

  return (
    <div className="view">
      <div className="page-head">
        <div>
          <span className="eyebrow">Bots &amp; sources</span>
          <h1>Élargir le catalogue, sans rien inventer.</h1>
          <p>Les robots interrogent des sources ouvertes et des index constructeurs autorisés, puis placent chaque résultat en quarantaine. Aucun candidat n’est publié comme fiche fiable sans relecture humaine.</p>
        </div>
        <div className="kpi"><small>En attente</small><strong>{all.filter(candidate => (decisions[candidate.id] ?? 'pending') === 'pending').length}</strong><span>candidats à relire</span></div>
      </div>

      <div className="sheet-layout">
        <div className="stack">
          <Panel title="Bot de découverte multimarque" hint="Automatisation gratuite">
            <p className="muted" style={{ fontSize: 13 }}>
              {feed.candidates.length} candidats produits, {feed.identifiers.length} identifiants matériels et {feed.rejected.length} faux
              positifs en quarantaine. {feed.report?.totals.officialCandidates ?? 0} proviennent d’index officiels ;
              {' '}{feed.evidence?.summary.collected ?? 0} ont des métadonnées constructeur collectées, {verified} sont validés
              humainement et {integrated} sont intégrés au catalogue.
              {' '}{feed.specs?.summary.collected ?? 0} fiches ont des caractéristiques normalisées à relire.
            </p>

            <div className="field-grid" style={{ marginTop: 16 }}>
              <label className="field">
                <span>Catégorie</span>
                <select value={category} onChange={event => setCategory(event.target.value as Category)}>
                  {categoryOrder.map(item => <option key={item} value={item}>{categoryLabels[item]}</option>)}
                </select>
              </label>
              <label className="field">
                <span>Marque</span>
                <input list="bot-brands" value={brand} onChange={event => setBrand(event.target.value)} placeholder="Toute marque…" />
                <datalist id="bot-brands">{[...new Set(Object.values(aliases).flatMap(group => Object.keys(group)))].sort().map(item => <option key={item} value={item} />)}</datalist>
              </label>
            </div>
            <div className="row" style={{ marginTop: 12 }}>
              <button className="btn primary" disabled={running || !brand.trim()} onClick={() => discover([brand])}><Search /> Rechercher cette marque</button>
              <button className="btn secondary" disabled={running} onClick={() => discover(categoryBrands)}><RefreshCw /> Balayer {categoryBrands.length} marques</button>
            </div>
            <div className={`notice ${error ? 'warn' : ''}`} style={{ marginTop: 12 }}>
              <ShieldCheck />
              <p><b>{progress}</b>{error || 'Résultats candidats uniquement, validation constructeur requise.'}</p>
            </div>
          </Panel>

          {feed.specs && (
            <Panel title="Caractéristiques normalisées" hint={`${feed.specs.summary.rawValues} valeurs brutes relevées`}>
              <div className="grid cols-3" style={{ marginBottom: 14 }}>
                <div className="kpi"><small>Fiches</small><strong>{feed.specs.summary.collected}</strong><span>{feed.specs.summary.remaining} restantes</span></div>
                <div className="kpi"><small>Valeurs normalisées</small><strong>{feed.specs.summary.normalizedValues}</strong><span>à relire</span></div>
                <div className="kpi"><small>Promotion</small><strong>Bloquée</strong><span>relecture obligatoire</span></div>
              </div>
              <div className="confidence-chips">
                {(['high', 'medium', 'low'] as SpecConfidence[]).map(level => (
                  <span className={level} key={level}><b>{feed.specs!.summary.byConfidence[level]}</b>{CONFIDENCE_LABEL[level]}</span>
                ))}
              </div>
              <p className="muted" style={{ fontSize: 12, marginTop: 12, lineHeight: 1.6 }}>
                Chaque valeur conserve la valeur brute publiée, le champ d’origine, la source constructeur, la date de collecte,
                la méthode d’extraction et un niveau de confiance. Une caractéristique absente de la fiche reste inconnue :
                elle n’est jamais transformée en réponse négative, et aucune valeur normalisée ne déclenche de promotion.
              </p>
            </Panel>
          )}

          {feed.report && (
            <Panel title="Couverture mesurée" hint={`${officialSources.length} index constructeurs`}>
              <div className="row" style={{ marginBottom: 12 }}>
                <span className="badge">{feed.report.totals.registeredBrands} marques</span>
                <span className="badge">{feed.report.totals.registeredQueries} recherches</span>
                <span className="badge">{feed.report.totals.categoriesWithCandidates}/{feed.report.totals.registeredCategories} catégories</span>
              </div>
              <div className="table-scroll">
                <table className="data">
                  <thead><tr><th>Catégorie</th><th>Marques</th><th>Candidats</th><th>Officiels</th><th>Identifiants</th></tr></thead>
                  <tbody>
                    {feed.report.coverage.map(row => (
                      <tr key={row.category}>
                        <th>{categoryLabels[row.category]}</th>
                        <td className="numeric">{row.registeredBrands.length}</td>
                        <td className="numeric">{row.candidates}</td>
                        <td className="numeric">{row.officialCandidates}</td>
                        <td className="numeric">{row.hardwareIdentifiers}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          )}

          <Panel title="Sources activées">
            <div className="market-links">
              <a href="https://www.wikidata.org/" target="_blank" rel="noreferrer">Wikidata <ExternalLink /></a>
              <a href="https://pci-ids.ucw.cz/" target="_blank" rel="noreferrer">PCI IDs <ExternalLink /></a>
              {officialSources.map(source => (
                <a href={source.url} target="_blank" rel="noreferrer" key={source.id}>{source.name} <ExternalLink /></a>
              ))}
            </div>
          </Panel>
        </div>

        <div className="stack">
          <div className="lane-tabs" role="tablist" aria-label="Nature des résultats">
            {([['products', 'Produits', all.length], ['identifiers', 'Identifiants PCI', feed.identifiers.length], ['false-positives', 'Faux positifs', feed.rejected.length]] as const).map(([value, label, count]) => (
              <button role="tab" aria-selected={lane === value} className={lane === value ? 'active' : ''} key={value} onClick={() => setLane(value)}>
                {label}<span>{count}</span>
              </button>
            ))}
          </div>

          <div className="candidate-list">
            {!shown.length && <Empty title="Aucun candidat dans cette vue" text="Change d’onglet ou lance une nouvelle recherche." />}
            {shown.map(candidate => {
              const proof = verificationById.get(candidate.id)
              const evidence = evidenceById.get(candidate.id)
              const record = specsById.get(candidate.id)
              const tone = lane === 'false-positives' ? 'err' : proof?.status === 'verified' ? 'ok' : evidence || candidate.duplicate ? 'warn' : ''
              const label = proof?.status === 'verified' ? 'Validé constructeur'
                : proof?.status === 'variant-required' ? 'Variante requise'
                  : evidence?.status === 'structured-product' ? 'Produit structuré'
                    : evidence?.status === 'page-metadata' ? 'Métadonnées constructeur'
                      : candidate.triage ? TRIAGE_LABEL[candidate.triage] : 'À vérifier'
              return (
                <article className="candidate" key={candidate.id}>
                  <div>
                    <span className={`badge ${tone}`}>{label}</span>
                    <h3>{candidate.label}</h3>
                    <p>{candidate.description}</p>
                    {(proof?.reason || candidate.triageReason) && (
                      <p className="quote">{proof?.reason ?? candidate.triageReason} Promotion bloquée tant qu’une relecture humaine n’a pas eu lieu.</p>
                    )}
                    <span className="meta">
                      {candidate.brand} · {categoryLabels[candidate.category]} · {evidence ? 'preuve automatique à relire' : candidate.sourceId ?? 'recherche locale'} · {candidate.id}
                    </span>
                    {record && record.specs.length > 0 && (
                      <details className="spec-details">
                        <summary>{record.specs.length} caractéristique{record.specs.length > 1 ? 's' : ''} normalisée{record.specs.length > 1 ? 's' : ''} · preuve automatique à relire</summary>
                        <div className="table-scroll">
                          <table className="data">
                            <thead><tr><th>Caractéristique</th><th>Valeur ConfigPilot</th><th>Valeur brute relevée</th><th>Confiance</th></tr></thead>
                            <tbody>
                              {record.specs.map(item => (
                                <tr key={item.field}>
                                  <th>{item.label}</th>
                                  <td className="value"><b>{formatValue(item)}</b></td>
                                  <td className="value"><span className="mono" style={{ display: 'block', fontSize: 10, color: 'var(--accent)' }}>{item.rawField}</span>{item.rawValue}</td>
                                  <td><span className={`badge ${item.confidence === 'high' ? 'ok' : item.confidence === 'medium' ? 'warn' : ''}`}>{CONFIDENCE_LABEL[item.confidence]}</span>
                                    <small className="mono" style={{ display: 'block', marginTop: 3, fontSize: 10 }}>{METHOD_LABEL[item.method] ?? item.method}</small></td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <p className="source-note">
                          {record.review.reason} Source : <a href={record.officialUrl} target="_blank" rel="noreferrer">fiche constructeur</a>,
                          relevée le {record.collectedAt}.
                          {record.missingFields.length > 0 && ` ${record.missingFields.length} caractéristique${record.missingFields.length > 1 ? 's' : ''} de cette catégorie ne figure${record.missingFields.length > 1 ? 'nt' : ''} pas sur la page et reste${record.missingFields.length > 1 ? 'nt' : ''} inconnue${record.missingFields.length > 1 ? 's' : ''}.`}
                          {' '}Promotion bloquée.
                        </p>
                      </details>
                    )}
                  </div>
                  <div className="candidate-actions">
                    <a href={proof?.officialUrl ?? evidence?.officialUrl ?? candidate.url} target="_blank" rel="noreferrer" aria-label={`Vérifier ${candidate.label} à la source`}><ExternalLink /></a>
                    <button onClick={() => navigator.clipboard?.writeText(candidate.id)} aria-label={`Copier l’identifiant de ${candidate.label}`}><Clipboard /></button>
                    {lane === 'products' && (
                      <>
                        <button onClick={() => decide(candidate.id, 'verified')} aria-label={`Marquer ${candidate.label} comme relu`}><Check /></button>
                        <button onClick={() => decide(candidate.id, 'rejected')} aria-label={`Rejeter ${candidate.label}`}><X /></button>
                      </>
                    )}
                  </div>
                </article>
              )
            })}
          </div>

          <div className="notice">
            <Bot />
            <p><b>Trois étapes, jamais raccourcies.</b> Découverte sur sources ouvertes, mise en quarantaine avec dédoublonnage, puis décision humaine. Une validation locale ne publie pas de fiche.</p>
          </div>
        </div>
      </div>
    </div>
  )
}
