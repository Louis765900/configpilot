import { Check, ExternalLink, TriangleAlert } from 'lucide-react'
import { categoryLabels, products } from '../data'
import { analyzeListing, getProduct, money } from '../engine'
import { Panel } from '../ui'
import { PartArt } from '../illustrations'
import type { Category, ListingInput } from '../types'

const CONDITIONS: [ListingInput['condition'], string][] = [
  ['sealed', 'Neuf scellé'], ['like-new', 'Comme neuf'], ['excellent', 'Excellent'], ['good', 'Bon'],
  ['worn', 'Correct, usé'], ['untested', 'Non testé'], ['repair', 'Pour pièces'],
]
const EVIDENCE: [keyof ListingInput, string][] = [
  ['box', 'Boîte et accessoires'], ['invoice', 'Facture'], ['warranty', 'Garantie restante'],
  ['tested', 'Preuve de fonctionnement'], ['benchmarks', 'Températures ou benchmarks'], ['professional', 'Vendeur professionnel'],
]
const RISK: Record<Category, string[]> = {
  cpu: ['Broches ou pastilles du socket', 'Historique d’overclocking', 'Authenticité de la référence'],
  gpu: ['Usage en minage prolongé', 'Températures et état des ventilateurs', 'Mémoire et connecteurs d’alimentation'],
  motherboard: ['Broches du socket', 'Version du BIOS installée', 'Ports et accessoires manquants'],
  ram: ['Erreurs mémoire sous test', 'Profil XMP ou EXPO fonctionnel'],
  psu: ['Âge réel de la plateforme', 'État des câbles et protections', 'Risque électrique pour le reste du matériel'],
  case: ['Visserie complète', 'Connectique de façade fonctionnelle'],
  storage: ['Santé SMART et heures d’usage', 'Total d’écritures', 'Secteurs réalloués'],
  cooling: ['Bruit de pompe ou de roulement', 'Kit de fixation complet'],
  expansion: ['Pilotes encore maintenus', 'Accessoires et antennes'],
}

export default function Estimator({ input, setInput }: { input: ListingInput; setInput: (value: ListingInput) => void }) {
  const result = analyzeListing(input)
  const selected = getProduct(input.productId)
  const set = <K extends keyof ListingInput>(key: K, value: ListingInput[K]) => setInput({ ...input, [key]: value })
  const tone = result?.verdict === 'Trop cher' || result?.verdict === 'Risque élevé' ? 'err'
    : result?.verdict === 'Excellente affaire' || result?.verdict === 'Bon prix' ? 'ok' : 'warn'

  return (
    <div className="view">
      <div className="page-head">
        <div>
          <span className="eyebrow">Estimateur d’annonce</span>
          <h1>Cette annonce vaut-elle son prix&nbsp;?</h1>
          <p>Un calcul local qui tient compte de l’état, de l’âge, des preuves apportées par le vendeur, des frais obligatoires et du risque propre à la catégorie.</p>
        </div>
      </div>

      <div className="sheet-layout">
        <Panel title="L’annonce">
          <div className="form-steps">
            <div>
              <div className="step-title"><span>01</span><div><h3>Le composant</h3><p>Sélectionne la référence exacte de l’annonce.</p></div></div>
              <label className="field" style={{ marginTop: 12 }}>
                <span>Référence</span>
                <select value={input.productId} onChange={event => set('productId', event.target.value)}>
                  {products.filter(product => product.newPrice != null || product.usedPrice != null)
                    .map(product => <option key={product.id} value={product.id}>{product.name}</option>)}
                </select>
              </label>
              {selected && (
                <div className="slot filled" style={{ marginTop: 12 }}>
                  <div className="art-frame sm"><PartArt category={selected.category} product={selected} /></div>
                  <div>
                    <div className="slot-label">{categoryLabels[selected.category]}</div>
                    <h3>{selected.name}</h3>
                    <div className="detail">Sortie {selected.year ?? 'à vérifier'} · indice {selected.performance ?? 'à vérifier'}</div>
                  </div>
                  <span />
                </div>
              )}
            </div>

            <div>
              <div className="step-title"><span>02</span><div><h3>Le prix total</h3><p>Inclure tous les frais obligatoires.</p></div></div>
              <div className="field-grid" style={{ marginTop: 12 }}>
                <label className="field"><span>Prix demandé (€)</span>
                  <input type="number" min="0" value={input.price} onChange={event => set('price', Number(event.target.value))} /></label>
                <label className="field"><span>Livraison (€)</span>
                  <input type="number" min="0" value={input.shipping} onChange={event => set('shipping', Number(event.target.value))} /></label>
                <label className="field"><span>Protection acheteur (€)</span>
                  <input type="number" min="0" value={input.protection} onChange={event => set('protection', Number(event.target.value))} /></label>
              </div>
            </div>

            <div>
              <div className="step-title"><span>03</span><div><h3>État et preuves</h3><p>Plus les preuves sont solides, plus la confiance monte.</p></div></div>
              <label className="field" style={{ marginTop: 12 }}>
                <span>État déclaré</span>
                <select value={input.condition} onChange={event => set('condition', event.target.value as ListingInput['condition'])}>
                  {CONDITIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <div className="check-grid" style={{ marginTop: 12 }}>
                {EVIDENCE.map(([key, label]) => (
                  <label className={`check ${input[key] ? 'on' : ''}`} key={key}>
                    <input type="checkbox" checked={Boolean(input[key])} onChange={event => set(key, event.target.checked as never)} />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </Panel>

        <div className="stack">
          <div className="verdict-card">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className={`badge ${tone}`}>{result?.confidence ?? 'Faible'} confiance</span>
              <span className="mono muted" style={{ fontSize: 11 }}>Estimation locale</span>
            </div>
            <h3>{result?.verdict ?? 'Données insuffisantes'}</h3>
            <div className="score"><b>{result?.score ?? 0}</b><span>/ 100</span></div>
            <div className="score-bars">
              {[1, 2, 3, 4, 5].map(step => <i className={(result?.score ?? 0) >= step * 20 ? 'on' : ''} key={step} />)}
            </div>
            <dl style={{ margin: 0 }}>
              <div className="metric"><dt>Prix total payé</dt><dd>{money(result?.total)}</dd></div>
              <div className="metric"><dt>Prix cible calculé</dt><dd className="big">{money(result?.target)}</dd></div>
              <div className="metric"><dt>Maximum conseillé</dt><dd>{money(result?.maximum)}</dd></div>
              <div className="metric"><dt>Écart à la cible</dt>
                <dd>{result?.delta == null ? 'À vérifier' : `${result.delta > 0 ? '+' : ''}${result.delta} %`}</dd></div>
            </dl>
          </div>

          <div className="notice warn">
            <TriangleAlert />
            <p><b>Estimation, pas relevé de marché.</b> Le calcul part des repères du catalogue et d’une décote modélisée. Confronte-le toujours à des annonces réelles avant d’acheter.</p>
          </div>

          {selected && (
            <Panel title="Points à contrôler">
              <ul className="reason-list">
                {RISK[selected.category].map(item => <li className="info" key={item}><Check /><span>{item}</span></li>)}
              </ul>
            </Panel>
          )}

          {selected && (
            <Panel title="Comparer aux annonces réelles">
              <div className="market-links">
                <a href={`https://www.leboncoin.fr/recherche?text=${encodeURIComponent(selected.name)}`} target="_blank" rel="noreferrer">Leboncoin <ExternalLink /></a>
                <a href={`https://www.ebay.fr/sch/i.html?_nkw=${encodeURIComponent(selected.name)}`} target="_blank" rel="noreferrer">eBay <ExternalLink /></a>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  )
}
