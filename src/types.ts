export type Category = 'cpu' | 'gpu' | 'motherboard' | 'ram' | 'psu' | 'case' | 'storage' | 'cooling' | 'expansion'

/** Relevé de prix saisi par un humain. Aucun relevé n'est collecté automatiquement. */
export type PriceObservation = { date: string; condition: 'new' | 'used'; price: number; source: string }

export type Product = {
  id: string
  candidateId?: string
  category: Category
  brand: string
  name: string
  reference: string
  series: string
  year: number | null
  /** Tarif public conseillé à la sortie, en euros. `null` tant qu'il n'est pas documenté. */
  launchPrice: number | null
  observations?: PriceObservation[]
  newPrice: number | null
  usedPrice: number | null
  confidence: 'Bonne' | 'Moyenne' | 'Faible'
  status: 'Détaillée' | 'Documentaire'
  notes: string
  performance: number | null
  specs: Record<string, string | number | boolean | string[] | null>
  strengths: string[]
  weaknesses: string[]
  usage: string
  source?: string
}

export type Build = Partial<Record<Category, string>>
export type CheckStatus = 'ok' | 'warning' | 'error' | 'unknown' | 'info'
export type CheckGroup = 'Plateforme' | 'Mémoire' | 'Refroidissement' | 'Alimentation' | 'Intégration' | 'Stockage'
export type CompatibilityCheck = {
  id: string
  group: CheckGroup
  label: string
  detail: string
  status: CheckStatus
  /** Champs de fiche réellement lus pour rendre ce verdict, affichés à l'utilisateur. */
  basis: string
}

export type ListingInput = {
  productId: string
  price: number
  shipping: number
  protection: number
  condition: 'sealed' | 'like-new' | 'excellent' | 'good' | 'worn' | 'untested' | 'repair'
  box: boolean
  invoice: boolean
  warranty: boolean
  tested: boolean
  benchmarks: boolean
  professional: boolean
}
