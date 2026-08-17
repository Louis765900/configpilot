/* Primitives d'interface partagées par les écrans. */

import { Check, CircleHelp, Info, PackageSearch, TriangleAlert, X } from 'lucide-react'
import { categoryLabels } from './data'
import { formatSpec, groupedSpecs, money } from './engine'
import type { CheckStatus, Category, Product } from './types'
import type { PriceTrack } from './pricing'

const TONE: Record<CheckStatus, string> = { ok: 'ok', warning: 'warn', error: 'err', unknown: '', info: 'info' }
const STATUS_LABEL: Record<CheckStatus, string> = {
  ok: 'Validé', warning: 'À confirmer', error: 'Conflit', unknown: 'Information manquante', info: 'À savoir',
}

export function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === 'ok') return <Check />
  if (status === 'error') return <X />
  if (status === 'warning') return <TriangleAlert />
  if (status === 'info') return <Info />
  return <CircleHelp />
}

export function Badge({ tone = '', children }: { tone?: string; children: React.ReactNode }) {
  return <span className={`badge ${tone}`}>{children}</span>
}

export function StatusBadge({ status, label }: { status: CheckStatus; label?: string }) {
  return (
    <span className={`badge ${TONE[status]}`}>
      <StatusIcon status={status} />
      {label ?? STATUS_LABEL[status]}
    </span>
  )
}

export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <PackageSearch />
      <b>{title}</b>
      <p>{text}</p>
    </div>
  )
}

export function Panel({ title, hint, actions, children }: { title?: string; hint?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel">
      {(title || actions) && (
        <div className="panel-head">
          <h2>{title}</h2>
          {actions ?? (hint ? <span className="hint">{hint}</span> : null)}
        </div>
      )}
      <div className="panel-body">{children}</div>
    </section>
  )
}

/** Caractéristiques d'une fiche, groupées par thème. « À vérifier » reste visible. */
export function SpecSheet({ product }: { product: Product }) {
  return (
    <div className="grid cols-2">
      {groupedSpecs(product).map(([section, entries]) => (
        <div className="spec-block" key={section}>
          <h3>{section}</h3>
          <dl>
            {entries.map(([key, value]) => (
              <div key={key}>
                <dt>{key}</dt>
                <dd className={value == null ? 'unknown' : undefined}>{formatSpec(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  )
}

/** Courbe de prix. Les segments modélisés sont pointillés, les ancres sont pleines. */
export function PriceChart({ track }: { track: PriceTrack }) {
  const points = track.points.filter(point => point.kind !== 'observed')
  if (points.length < 2) {
    return <p className="muted" style={{ fontSize: 13 }}>Pas assez de points documentés pour tracer une trajectoire.</p>
  }
  const width = 480, height = 190, left = 52, right = 14, top = 16, bottom = 34
  const years = points.map(point => point.year)
  const minYear = Math.min(...years), maxYear = Math.max(...years)
  const maxValue = Math.max(...track.points.map(point => point.value)) * 1.12
  const x = (year: number) => left + ((year - minYear) / Math.max(1, maxYear - minYear)) * (width - left - right)
  const y = (value: number) => top + (1 - value / maxValue) * (height - top - bottom)
  const path = points.map((point, index) => `${index ? 'L' : 'M'}${x(point.year).toFixed(1)} ${y(point.value).toFixed(1)}`).join(' ')
  const ticks = [0, 0.5, 1].map(ratio => Math.round((maxValue * ratio) / 10) * 10)

  return (
    <>
      <svg className="price-chart" viewBox={`0 0 ${width} ${height}`} role="img"
        aria-label={`Trajectoire de prix de ${minYear} à ${maxYear}`}>
        <title>Trajectoire de prix modélisée</title>
        {ticks.map(tick => (
          <g key={tick}>
            <line x1={left} x2={width - right} y1={y(tick)} y2={y(tick)} stroke="var(--outline-variant)" strokeWidth="1" />
            <text x={left - 8} y={y(tick) + 4} textAnchor="end" fill="var(--on-surface-variant)"
              fontSize="10" fontFamily="var(--font-mono)">{tick} €</text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" />
        {points.map(point => (
          <g key={`${point.year}-${point.kind}`}>
            <circle cx={x(point.year)} cy={y(point.value)} r={point.kind === 'modelled' ? 2.5 : 4.5}
              fill={point.kind === 'modelled' ? 'var(--surface)' : 'var(--accent)'}
              stroke="var(--accent)" strokeWidth="2" />
            <title>{`${point.year} — ${money(point.value)} · ${point.label}`}</title>
          </g>
        ))}
        {track.points.filter(point => point.kind === 'observed').map((point, index) => (
          <circle key={index} cx={x(point.year)} cy={y(point.value)} r="4" fill="var(--info)" stroke="var(--surface)" strokeWidth="1.5" />
        ))}
        {[minYear, maxYear].map(year => (
          <text key={year} x={x(year)} y={height - 12} textAnchor="middle" fill="var(--on-surface-variant)"
            fontSize="10" fontFamily="var(--font-mono)">{year}</text>
        ))}
      </svg>
      <div className="chart-legend">
        <span><i /> Ancre documentée</span>
        <span><i className="dashed" /> Segment modélisé</span>
      </div>
    </>
  )
}

export function CategoryChip({ category }: { category: Category }) {
  return <span className="badge">{categoryLabels[category]}</span>
}
