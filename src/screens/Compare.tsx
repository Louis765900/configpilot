import { BarChart3, X } from 'lucide-react'
import { categoryLabels } from '../data'
import { formatSpec, getProduct, money, valueScore } from '../engine'
import { priceInsight } from '../pricing'
import { Empty } from '../ui'
import { PartArt } from '../illustrations'
import type { Product } from '../types'
import type { Route } from '../routes'

export default function Compare({ ids, setIds, go }: { ids: string[]; setIds: (ids: string[]) => void; go: (route: Route) => void }) {
  const chosen = ids.map(getProduct).filter(Boolean) as Product[]

  if (!chosen.length) {
    return (
      <div className="view">
        <div className="page-head">
          <div>
            <span className="eyebrow">Comparateur</span>
            <h1>Comparez ce qui est comparable.</h1>
            <p>Jusqu’à quatre références d’une même catégorie, alignées champ par champ.</p>
          </div>
        </div>
        <div className="panel">
          <Empty title="Comparateur vide" text="Ajoutez des références depuis le catalogue ou depuis une fiche." />
          <div className="row" style={{ justifyContent: 'center', paddingBottom: 24 }}>
            <button className="btn primary" onClick={() => go({ page: 'catalog' })}><BarChart3 /> Explorer le catalogue</button>
          </div>
        </div>
      </div>
    )
  }

  const keys = [...new Set(chosen.flatMap(product => Object.keys(product.specs)))]
  const insights = chosen.map(product => priceInsight(product))
  const values = chosen.map(valueScore)
  const bestPerformance = Math.max(...chosen.map(product => product.performance ?? -1))
  const bestValue = Math.max(...values.map(value => value ?? -1))
  const numeric = (key: string) => chosen.every(product => product.specs[key] == null || typeof product.specs[key] === 'number')

  return (
    <div className="view">
      <div className="page-head">
        <div>
          <span className="eyebrow">Comparateur · {categoryLabels[chosen[0].category]}</span>
          <h1>{chosen.length} référence{chosen.length > 1 ? 's' : ''} face à face.</h1>
          <p>« À vérifier » signifie que la fiche ne permet pas de conclure, pas que la valeur est nulle.</p>
        </div>
        <button className="btn ghost" onClick={() => setIds([])}>Vider le comparateur</button>
      </div>

      <div className="panel">
        <div className="table-scroll">
          <table className="data">
            <thead>
              <tr>
                <th>Critère</th>
                {chosen.map(product => (
                  <th key={product.id}>
                    <div className="compare-col">
                      <button className="remove" onClick={() => setIds(ids.filter(id => id !== product.id))} aria-label={`Retirer ${product.name}`}><X /></button>
                      <div className="art-frame sm"><PartArt category={product.category} product={product} /></div>
                      <button className="btn ghost" style={{ padding: 0 }} onClick={() => go({ page: 'product', id: product.id })}>{product.name}</button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th>Indice de performance</th>
                {chosen.map(product => (
                  <td className={`numeric ${product.performance === bestPerformance ? 'best' : ''}`} key={product.id}>
                    {product.performance ?? 'À vérifier'}
                  </td>
                ))}
              </tr>
              <tr>
                <th>Performance par euro</th>
                {chosen.map((product, index) => (
                  <td className={`numeric ${values[index] === bestValue ? 'best' : ''}`} key={product.id}>{values[index] ?? 'À vérifier'}</td>
                ))}
              </tr>
              <tr>
                <th>Tarif au lancement</th>
                {chosen.map((product, index) => <td className="numeric" key={product.id}>{money(insights[index].track.launch)}</td>)}
              </tr>
              <tr>
                <th>Neuf indicatif</th>
                {chosen.map(product => <td className="numeric" key={product.id}>{money(product.newPrice)}</td>)}
              </tr>
              <tr>
                <th>Occasion indicative</th>
                {chosen.map(product => <td className="numeric" key={product.id}>{money(product.usedPrice)}</td>)}
              </tr>
              <tr>
                <th>Décote depuis la sortie</th>
                {chosen.map((product, index) => (
                  <td className="numeric" key={product.id}>
                    {insights[index].track.dropPercent == null ? 'À vérifier' : `${insights[index].track.dropPercent} %`}
                  </td>
                ))}
              </tr>
              <tr>
                <th>Verdict d’achat</th>
                {chosen.map((product, index) => <td key={product.id}>{insights[index].verdict}</td>)}
              </tr>
              {keys.map(key => (
                <tr key={key}>
                  <th>{key}</th>
                  {chosen.map(product => (
                    <td className={numeric(key) ? 'numeric' : 'value'} key={product.id}>
                      <span className={product.specs[key] == null ? 'unknown' : undefined}>{formatSpec(product.specs[key])}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
