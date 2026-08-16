export type Category = 'cpu' | 'gpu' | 'motherboard' | 'ram' | 'psu' | 'case' | 'storage' | 'cooling' | 'expansion'

export type Product = {
  id: string
  candidateId?: string
  category: Category
  brand: string
  name: string
  reference: string
  series: string
  year: number | null
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
export type CheckStatus = 'ok' | 'warning' | 'error' | 'unknown'
export type CompatibilityCheck = { id: string; label: string; detail: string; status: CheckStatus }

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
