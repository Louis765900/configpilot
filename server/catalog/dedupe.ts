import type { NormalizedComponent } from './types.js'
import { normalizeIdentifier, normalizeText, normalizedCodes } from './normalize.js'

export type MatchReason = 'source_record' | 'exact_mpn' | 'exact_gtin' | 'exact_ean' | 'exact_upc' | 'strict_identity'

export type ComparableComponent = Pick<NormalizedComponent,
  'brand' | 'name' | 'manufacturerPartNumbers' | 'gtin' | 'ean' | 'upc' | 'identityHash' | 'specifications'>

const capacity = (component: ComparableComponent) => {
  const raw = component.specifications.capacity
  return typeof raw === 'number' ? raw : null
}

/**
 * Décision pure utilisée par les tests et la couche SQL. Aucun rapprochement
 * approximatif ne provoque une fusion automatique.
 */
export function exactMatchReason(left: ComparableComponent, right: ComparableComponent): MatchReason | null {
  const leftCodes = normalizedCodes(left as NormalizedComponent)
  const rightCodes = normalizedCodes(right as NormalizedComponent)
  for (const a of leftCodes) {
    const b = rightCodes.find(candidate => candidate.type === a.type && candidate.value === a.value && candidate.brandScope === a.brandScope)
    if (b) return `exact_${a.type}` as MatchReason
  }
  if (normalizeText(left.brand) !== normalizeText(right.brand)) return null
  if (left.identityHash !== right.identityHash) return null
  const leftCapacity = capacity(left), rightCapacity = capacity(right)
  if (leftCapacity != null && rightCapacity != null && leftCapacity !== rightCapacity) return null
  return 'strict_identity'
}

export function potentialDuplicateScore(left: ComparableComponent, right: ComparableComponent) {
  if (normalizeText(left.brand) !== normalizeText(right.brand)) return 0
  const leftName = new Set(normalizeText(left.name).split(' ').filter(Boolean))
  const rightName = new Set(normalizeText(right.name).split(' ').filter(Boolean))
  const intersection = [...leftName].filter(token => rightName.has(token)).length
  const union = new Set([...leftName, ...rightName]).size
  const nameScore = union ? intersection / union : 0
  const mpnPrefix = left.manufacturerPartNumbers.some(a => right.manufacturerPartNumbers.some(b => {
    const x = normalizeIdentifier(a), y = normalizeIdentifier(b)
    return x.length >= 6 && y.length >= 6 && (x.startsWith(y) || y.startsWith(x))
  })) ? .15 : 0
  return Math.min(.99, Number((nameScore * .85 + mpnPrefix).toFixed(4)))
}
