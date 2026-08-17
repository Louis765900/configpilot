/* Suivi de prix et verdict d'achat.
 *
 * ConfigPilot ne relève aucun prix marchand : ni API payante, ni marketplace, ni scraping.
 * Ce module travaille donc sur trois sources explicites :
 *   — le tarif public conseillé au lancement, documenté dans `launch-prices.ts` ;
 *   — les prix indicatifs du catalogue local ;
 *   — les relevés saisis à la main dans `observations`, vides tant que personne n'en ajoute.
 * Tout point calculé entre ces ancres est signalé comme modélisé, jamais comme relevé.
 */

import { products } from './data'
import { valueScore } from './engine'
import type { Category, Product } from './types'

export type PriceKind = 'launch' | 'modelled' | 'observed' | 'current'
export type PricePoint = { year: number; value: number; kind: PriceKind; label: string }
export type PriceTrack = {
  launch: number | null
  current: number | null
  used: number | null
  points: PricePoint[]
  /** Décote cumulée depuis le lancement, en pourcentage. */
  dropPercent: number | null
  /** Rythme moyen de décote, en pourcentage par an. */
  annualPercent: number | null
  method: string
}
export type Reason = { status: 'ok' | 'warning' | 'error' | 'info'; text: string }
export type PriceInsight = {
  verdict: string
  score: number | null
  confidence: 'Bonne' | 'Moyenne' | 'Faible'
  reasons: Reason[]
  track: PriceTrack
}

/** Décote annuelle moyenne retenue par catégorie, utilisée seulement faute d'ancre récente. */
const ANNUAL_RETENTION: Record<Category, number> = {
  cpu: 0.86, gpu: 0.80, motherboard: 0.84, ram: 0.88, psu: 0.90,
  case: 0.92, storage: 0.82, cooling: 0.90, expansion: 0.85,
}
/** Horizon au-delà duquel une référence devient difficile à conseiller en achat neuf. */
const SERVICE_LIFE: Record<Category, number> = {
  cpu: 8, gpu: 8, motherboard: 8, ram: 10, psu: 10,
  case: 15, storage: 8, cooling: 12, expansion: 8,
}
/** Sockets encore approvisionnés en processeurs neufs, et sockets matures mais fermés. */
const ACTIVE_SOCKETS = ['AM5', 'LGA1851']
const MATURE_SOCKETS = ['AM4', 'LGA1700']

const round = (value: number) => Math.round(value)

/** Reconstitue la trajectoire de prix d'une référence entre son lancement et aujourd'hui. */
export function priceTrack(product: Product, nowYear = new Date().getFullYear()): PriceTrack {
  const launch = product.launchPrice
  const current = product.newPrice
  const used = product.usedPrice
  const from = product.year
  const span = from == null ? null : Math.max(0, nowYear - from)
  const points: PricePoint[] = []

  if (launch != null && from != null) {
    points.push({ year: from, value: launch, kind: 'launch', label: 'Tarif conseillé au lancement' })
  }

  let method = 'Aucune trajectoire calculable : tarif de lancement ou année de sortie manquants.'
  if (launch != null && from != null && span != null && span > 0) {
    // Deux ancres connues : interpolation géométrique qui passe exactement par les deux.
    // Une seule ancre : décote moyenne de la catégorie.
    const ratio = current != null && current > 0 ? current / launch : null
    const retention = ratio != null ? Math.pow(ratio, 1 / span) : ANNUAL_RETENTION[product.category]
    method = ratio != null
      ? 'Interpolation entre le tarif de lancement et le prix indicatif actuel du catalogue.'
      : `Décote moyenne de la catégorie ${product.category} appliquée au tarif de lancement, faute de prix actuel documenté.`
    for (let step = 1; step <= span; step += 1) {
      const modelled = launch * Math.pow(retention, step)
      const isLast = step === span
      points.push({
        year: from + step,
        value: round(isLast && current != null ? current : modelled),
        kind: isLast && current != null ? 'current' : 'modelled',
        label: isLast && current != null ? 'Prix indicatif actuel du catalogue' : 'Valeur modélisée',
      })
    }
  } else if (launch != null && from != null && current != null) {
    points.push({ year: nowYear, value: current, kind: 'current', label: 'Prix indicatif actuel du catalogue' })
    method = 'Référence sortie cette année : aucune décote modélisée.'
  }

  for (const observation of product.observations ?? []) {
    const year = Number(observation.date.slice(0, 4))
    if (Number.isFinite(year)) {
      points.push({ year, value: observation.price, kind: 'observed', label: `Relevé saisi — ${observation.source}` })
    }
  }
  points.sort((left, right) => left.year - right.year || left.value - right.value)

  const dropPercent = launch != null && current != null ? round((1 - current / launch) * 100) : null
  const annualPercent = launch != null && current != null && span != null && span > 0
    ? round((1 - Math.pow(current / launch, 1 / span)) * 100)
    : null

  return { launch, current, used, points, dropPercent, annualPercent, method }
}

/** Médiane de l'indice performance/prix d'une catégorie, pour situer une référence. */
export function categoryValueMedian(category: Category): number | null {
  const scores = products
    .filter(item => item.category === category)
    .map(valueScore)
    .filter((score): score is number => score != null)
    .sort((left, right) => left - right)
  if (!scores.length) return null
  const middle = Math.floor(scores.length / 2)
  return scores.length % 2 ? scores[middle] : round((scores[middle - 1] + scores[middle]) / 2)
}

/** Verdict d'achat argumenté : chaque facteur est énoncé, aucun n'est agrégé en silence. */
export function priceInsight(product: Product, nowYear = new Date().getFullYear()): PriceInsight {
  const track = priceTrack(product, nowYear)
  const reasons: Reason[] = []
  const age = product.year == null ? null : Math.max(0, nowYear - product.year)
  let score = 50
  let weighted = 0

  if (track.dropPercent != null) {
    weighted += 1
    if (track.dropPercent >= 45) {
      score += 18
      reasons.push({ status: 'ok', text: `La référence a déjà perdu ${track.dropPercent} % de son tarif de lancement : l’essentiel de la décote est derrière elle.` })
    } else if (track.dropPercent >= 20) {
      score += 6
      reasons.push({ status: 'info', text: `Décote de ${track.dropPercent} % depuis le lancement, au rythme d’environ ${track.annualPercent} % par an. Une baisse reste possible.` })
    } else if (track.dropPercent >= 0) {
      score -= 10
      reasons.push({ status: 'warning', text: `Seulement ${track.dropPercent} % de décote depuis le lancement : le prix n’a pas encore bougé, attendre peut être payant.` })
    } else {
      score -= 14
      reasons.push({ status: 'warning', text: `Le prix actuel dépasse le tarif de lancement de ${Math.abs(track.dropPercent)} % : tension d’approvisionnement ou fin de production.` })
    }
  } else {
    reasons.push({ status: 'info', text: 'Tarif de lancement ou prix actuel non documentés : la décote ne peut pas être mesurée.' })
  }

  const value = valueScore(product)
  const median = categoryValueMedian(product.category)
  if (value != null && median != null) {
    weighted += 1
    const gap = round(((value - median) / median) * 100)
    if (gap >= 12) {
      score += 16
      reasons.push({ status: 'ok', text: `Rapport performance/prix supérieur de ${gap} % à la médiane de la catégorie.` })
    } else if (gap <= -12) {
      score -= 16
      reasons.push({ status: 'warning', text: `Rapport performance/prix inférieur de ${Math.abs(gap)} % à la médiane de la catégorie.` })
    } else {
      reasons.push({ status: 'info', text: 'Rapport performance/prix dans la moyenne de la catégorie.' })
    }
  }

  if (age != null) {
    weighted += 1
    const life = SERVICE_LIFE[product.category]
    if (age >= life) {
      score -= 18
      reasons.push({ status: 'error', text: `${age} ans depuis la sortie, au-delà de l’horizon de ${life} ans retenu pour cette catégorie. À réserver à une réparation ou à un budget très contraint.` })
    } else if (age >= life * 0.65) {
      score -= 8
      reasons.push({ status: 'warning', text: `${age} ans depuis la sortie : la référence approche de la fin de son cycle utile.` })
    } else if (age <= 1) {
      reasons.push({ status: 'info', text: 'Référence récente : peu de recul sur sa fiabilité et sur l’évolution de son prix.' })
    } else {
      score += 8
      reasons.push({ status: 'ok', text: `${age} ans depuis la sortie : la référence est mature et documentée, sans être dépassée.` })
    }
  }

  if (product.category === 'cpu' || product.category === 'motherboard') {
    const socket = typeof product.specs.Socket === 'string' ? product.specs.Socket : null
    if (socket) {
      weighted += 1
      if (ACTIVE_SOCKETS.includes(socket)) {
        score += 14
        reasons.push({ status: 'ok', text: `Socket ${socket} encore alimenté en nouveaux processeurs : la plateforme pourra évoluer.` })
      } else if (MATURE_SOCKETS.includes(socket)) {
        reasons.push({ status: 'info', text: `Socket ${socket} mature : l’offre est complète et bon marché, mais la plateforme n’accueillera plus de nouvelle génération.` })
      } else {
        score -= 14
        reasons.push({ status: 'warning', text: `Socket ${socket} fermé : aucune évolution processeur à attendre, tout achat ferme la plateforme.` })
      }
    }
  }

  if (product.newPrice == null && product.usedPrice == null) {
    reasons.push({ status: 'info', text: 'Fiche documentaire sans prix indicatif : le verdict repose uniquement sur les caractéristiques.' })
  }

  const bounded = Math.max(0, Math.min(100, round(score)))
  const confidence: PriceInsight['confidence'] = weighted >= 3 ? 'Bonne' : weighted >= 2 ? 'Moyenne' : 'Faible'
  const verdict = weighted === 0 ? 'Données insuffisantes'
    : bounded >= 72 ? 'Bon achat aujourd’hui'
      : bounded >= 56 ? 'Achat défendable'
        : bounded >= 40 ? 'À surveiller'
          : 'Difficile à conseiller aujourd’hui'

  return { verdict, score: weighted === 0 ? null : bounded, confidence, reasons, track }
}
