/* Illustrations vectorielles des composants.
   Dessinées à la main en SVG : aucune image constructeur n'est republiée, tout suit
   le thème courant et reste net à n'importe quelle taille. Chaque schéma se règle sur
   les caractéristiques réelles de la fiche (nombre de barrettes, type de refroidissement,
   longueur de carte graphique, format de boîtier, format de stockage). */

import type { Category, Product } from './types'

const BOARD = 'var(--surface-highest)'
const METAL = 'var(--surface-high)'
const DEEP = 'var(--surface-lowest)'
const EDGE = 'var(--outline-variant)'
const LINE = 'var(--outline)'
const LIVE = 'var(--accent)'

type ArtProps = { title: string; children: React.ReactNode }

function Art({ title, children }: ArtProps) {
  return (
    <svg className="part-art" viewBox="0 0 160 100" role="img" aria-label={title}
      fill="none" stroke={EDGE} strokeWidth="1.4" strokeLinejoin="round">
      <title>{title}</title>
      {children}
    </svg>
  )
}

function Repeat({ count, step, render }: { count: number; step: number; render: (offset: number, index: number) => React.ReactNode }) {
  return <>{Array.from({ length: count }, (_, index) => <g key={index}>{render(index * step, index)}</g>)}</>
}

function CpuArt() {
  return (
    <Art title="Schéma d’un processeur vu de dessus">
      <path d="M50 20h60v60H50z" fill={BOARD} />
      <path d="M50 20h8l-8 8z" fill={LIVE} stroke="none" />
      <path d="M58 28h44v44H58z" fill={METAL} />
      <path d="M66 42h28M66 50h20M66 58h24" stroke={LINE} strokeWidth="2.4" strokeLinecap="round" />
      <Repeat count={7} step={8} render={offset => (
        <>
          <path d={`M${54 + offset} 14v6`} stroke={LINE} />
          <path d={`M${54 + offset} 80v6`} stroke={LINE} />
        </>
      )} />
      <Repeat count={7} step={8} render={offset => (
        <>
          <path d={`M44 ${24 + offset}h6`} stroke={LINE} />
          <path d={`M110 ${24 + offset}h6`} stroke={LINE} />
        </>
      )} />
    </Art>
  )
}

function GpuArt({ fans }: { fans: number }) {
  const spacing = fans >= 3 ? 42 : 54
  const start = 80 - ((fans - 1) * spacing) / 2
  return (
    <Art title="Schéma d’une carte graphique">
      <path d="M14 26h134v46H14z" fill={BOARD} />
      <path d="M6 16h10v72H6z" fill={METAL} />
      <path d="M9 26h4v10H9zM9 42h4v10H9zM9 58h4v8H9z" fill={DEEP} />
      <path d="M40 72h84v8H40z" fill={METAL} />
      <path d="M62 80v-8M96 80v-8" stroke={LINE} />
      <path d="M118 18h22v8h-22z" fill={METAL} />
      <Repeat count={fans} step={spacing} render={offset => {
        const cx = start + offset
        return (
          <>
            <circle cx={cx} cy={49} r={17} fill={DEEP} />
            <circle cx={cx} cy={49} r={4} fill={METAL} />
            <Repeat count={6} step={60} render={angle => (
              <path d={`M${cx} ${49} l${13 * Math.cos((angle - 30) * Math.PI / 180)} ${13 * Math.sin((angle - 30) * Math.PI / 180)}`} stroke={LINE} strokeWidth="1" />
            )} />
          </>
        )
      }} />
    </Art>
  )
}

function MotherboardArt() {
  return (
    <Art title="Schéma d’une carte mère vue de dessus">
      <path d="M12 8h136v84H12z" fill={BOARD} />
      <path d="M20 12h56v12H20z" fill={METAL} />
      <path d="M46 30h34v30H46z" fill={DEEP} stroke={LIVE} />
      <path d="M52 36h22v18H52z" stroke={LINE} strokeWidth="1" />
      <Repeat count={4} step={9} render={offset => <path d={`M${98 + offset} 22h5v52h-5z`} fill={DEEP} />} />
      <path d="M20 66h62v6H20zM20 78h44v6H20z" fill={METAL} />
      <path d="M88 80h44v5H88z" fill={DEEP} />
      <path d="M20 32h18v18H20z" fill={METAL} />
      <path d="M24 36h10v10H24z" stroke={LINE} strokeWidth="1" />
      <circle cx="16" cy="12" r="1.6" fill={LINE} stroke="none" />
      <circle cx="144" cy="12" r="1.6" fill={LINE} stroke="none" />
      <circle cx="16" cy="88" r="1.6" fill={LINE} stroke="none" />
      <circle cx="144" cy="88" r="1.6" fill={LINE} stroke="none" />
    </Art>
  )
}

function RamArt({ modules }: { modules: number }) {
  const count = Math.min(Math.max(modules, 1), 4)
  const width = count > 2 ? 26 : 34
  const gap = count > 2 ? 8 : 12
  const total = count * width + (count - 1) * gap
  const start = 80 - total / 2
  return (
    <Art title={`Schéma de ${count} barrette${count > 1 ? 's' : ''} de mémoire`}>
      <Repeat count={count} step={width + gap} render={offset => {
        const x = start + offset
        return (
          <>
            <path d={`M${x} 22h${width}v44H${x}z`} fill={METAL} />
            <Repeat count={4} step={5} render={fin => <path d={`M${x + 4} ${27 + fin}h${width - 8}`} stroke={LINE} strokeWidth="1" />} />
            <path d={`M${x + 5} 44h${width - 10}v12h-${width - 10}z`} fill={DEEP} stroke={LINE} strokeWidth="1" />
            <path d={`M${x} 66h${width}v10H${x}z`} fill={BOARD} />
            <path d={`M${x + width * 0.42} 76v-10`} stroke={LINE} strokeWidth="2" />
            <Repeat count={5} step={Math.max(4, (width - 6) / 5)} render={pin => (
              <path d={`M${x + 3 + pin} 76v4`} stroke={LIVE} strokeWidth="1.6" />
            )} />
          </>
        )
      }} />
    </Art>
  )
}

function PsuArt() {
  return (
    <Art title="Schéma d’un bloc d’alimentation">
      <path d="M14 16h132v68H14z" fill={BOARD} />
      <circle cx="62" cy="50" r="28" fill={DEEP} />
      <circle cx="62" cy="50" r="6" fill={METAL} />
      <Repeat count={8} step={45} render={angle => (
        <path d={`M62 50 Q ${62 + 16 * Math.cos((angle - 20) * Math.PI / 180)} ${50 + 16 * Math.sin((angle - 20) * Math.PI / 180)} ${62 + 25 * Math.cos(angle * Math.PI / 180)} ${50 + 25 * Math.sin(angle * Math.PI / 180)}`} stroke={LINE} strokeWidth="1" />
      )} />
      <path d="M104 26h34v14h-34z" fill={METAL} />
      <path d="M108 30h8v6h-8zM122 30h8v6h-8z" fill={DEEP} stroke="none" />
      <Repeat count={3} step={11} render={offset => <path d={`M104 ${50 + offset}h34`} stroke={LINE} strokeWidth="1" />} />
      <path d="M146 44h8v14h-8z" fill={METAL} />
    </Art>
  )
}

function CaseArt({ compact }: { compact: boolean }) {
  const top = compact ? 26 : 8
  return (
    <Art title={`Schéma d’un boîtier ${compact ? 'compact' : 'tour'}`}>
      <path d={`M42 ${top + 6}L64 ${top}h64l-22 6z`} fill={METAL} />
      <path d={`M106 ${top + 6}L128 ${top}v78l-22 6z`} fill={METAL} />
      <path d={`M42 ${top + 6}h64v78H42z`} fill={BOARD} />
      <path d={`M52 ${top + 18}h44v52H52z`} fill={DEEP} />
      <Repeat count={4} step={7} render={row => (
        <Repeat count={5} step={7} render={column => (
          <circle cx={56 + column} cy={top + 24 + row} r="1.2" fill={LINE} stroke="none" />
        )} />
      )} />
      <path d={`M52 ${top + 76}h20`} stroke={LINE} strokeWidth="1" />
      <circle cx="96" cy={top + 12} r="2" fill={LIVE} stroke="none" />
      <path d="M46 90v6M100 90v6M112 88v6" stroke={LINE} />
    </Art>
  )
}

function StorageArt({ nvme }: { nvme: boolean }) {
  if (!nvme) {
    return (
      <Art title="Schéma d’un disque 2,5 pouces">
        <path d="M22 22h116v56H22z" fill={BOARD} />
        <path d="M30 30h100v40H30z" fill={METAL} />
        <path d="M138 40h8v8h-8zM138 54h8v10h-8z" fill={DEEP} />
        <circle cx="28" cy="28" r="1.6" fill={LINE} stroke="none" />
        <circle cx="132" cy="28" r="1.6" fill={LINE} stroke="none" />
        <circle cx="28" cy="72" r="1.6" fill={LINE} stroke="none" />
        <circle cx="132" cy="72" r="1.6" fill={LINE} stroke="none" />
        <path d="M46 44h44v12H46z" stroke={LINE} strokeWidth="1" />
      </Art>
    )
  }
  return (
    <Art title="Schéma d’un SSD M.2 2280">
      <path d="M18 38h126v24H18z" fill={BOARD} />
      <path d="M18 38h10v24H18z" fill={METAL} />
      <Repeat count={6} step={5} render={offset => <path d={`M${20 + offset} 56v6`} stroke={LIVE} strokeWidth="1.6" />} />
      <path d="M34 50v12" stroke={LINE} strokeWidth="2" />
      <path d="M44 42h22v16H44z" fill={METAL} />
      <path d="M74 42h26v16H74zM106 42h26v16h-26z" fill={DEEP} />
      <circle cx="140" cy="50" r="3.5" fill="none" stroke={LINE} />
      <path d="M78 46h18M78 50h14M110 46h18M110 50h14" stroke={LINE} strokeWidth="1" />
    </Art>
  )
}

function CoolingArt({ liquid }: { liquid: boolean }) {
  if (liquid) {
    return (
      <Art title="Schéma d’un watercooling tout-en-un">
        <path d="M8 20h74v60H8z" fill={BOARD} />
        <Repeat count={9} step={7} render={offset => <path d={`M${13 + offset} 24v52`} stroke={LINE} strokeWidth="1" />} />
        <path d="M82 32c22 0 14 14 26 14M82 68c22 0 14-14 26-14" stroke={LINE} strokeWidth="3" />
        <path d="M108 30h40v40h-40z" fill={METAL} />
        <circle cx="128" cy="50" r="13" fill={DEEP} stroke={LIVE} />
        <circle cx="128" cy="50" r="5" fill={METAL} />
      </Art>
    )
  }
  return (
    <Art title="Schéma d’un ventirad">
      <path d="M74 8h64v62H74z" fill={BOARD} />
      <Repeat count={11} step={5.4} render={offset => <path d={`M78 ${13 + offset}h56`} stroke={LINE} strokeWidth="1" />} />
      <Repeat count={4} step={16} render={offset => <circle cx={86 + offset} cy="74" r="4" fill={METAL} />} />
      <path d="M74 78h64v8H74z" fill={METAL} />
      <path d="M16 14h52v62H16z" fill={METAL} />
      <circle cx="42" cy="45" r="25" fill={DEEP} />
      <circle cx="42" cy="45" r="6" fill={METAL} />
      <Repeat count={7} step={51} render={angle => (
        <path d={`M42 45 Q ${42 + 14 * Math.cos((angle - 25) * Math.PI / 180)} ${45 + 14 * Math.sin((angle - 25) * Math.PI / 180)} ${42 + 22 * Math.cos(angle * Math.PI / 180)} ${45 + 22 * Math.sin(angle * Math.PI / 180)}`} stroke={LINE} strokeWidth="1" />
      )} />
    </Art>
  )
}

function ExpansionArt() {
  return (
    <Art title="Schéma d’une carte d’extension">
      <path d="M32 28h114v44H32z" fill={BOARD} />
      <path d="M20 16h12v72H20z" fill={METAL} />
      <path d="M23 30h6v10h-6zM23 46h6v10h-6z" fill={DEEP} />
      <path d="M56 40h34v22H56z" fill={METAL} />
      <path d="M62 46h22v10H62z" stroke={LINE} strokeWidth="1" />
      <path d="M100 38h34v14h-34z" fill={DEEP} />
      <path d="M60 72h50v7H60z" fill={METAL} />
      <Repeat count={9} step={5} render={offset => <path d={`M${63 + offset} 79v4`} stroke={LIVE} strokeWidth="1.4" />} />
      <path d="M126 20v8h-4" stroke={LINE} />
    </Art>
  )
}

const spec = (product: Product | undefined, key: string) => product?.specs[key]
const text = (value: unknown) => String(value ?? '').toLowerCase()

/** Illustration d'une catégorie, affinée par la fiche du composant quand elle est fournie. */
export function PartArt({ category, product }: { category: Category; product?: Product }) {
  switch (category) {
    case 'cpu':
      return <CpuArt />
    case 'gpu': {
      const length = spec(product, 'Longueur (mm)')
      return <GpuArt fans={typeof length === 'number' && length >= 265 ? 3 : 2} />
    }
    case 'motherboard':
      return <MotherboardArt />
    case 'ram': {
      const modules = spec(product, 'Barrettes')
      return <RamArt modules={typeof modules === 'number' ? modules : 2} />
    }
    case 'psu':
      return <PsuArt />
    case 'case':
      return <CaseArt compact={text(spec(product, 'Format')).includes('mini')} />
    case 'storage':
      return <StorageArt nvme={!text(spec(product, 'Type')).includes('sata')} />
    case 'cooling':
      return <CoolingArt liquid={text(spec(product, 'Type')).includes('watercooling') || text(spec(product, 'Type')).includes('aio')} />
    default:
      return <ExpansionArt />
  }
}

/** Illustration encadrée, prête à poser dans une liste ou une fiche. */
export function PartThumb({ category, product, size = 'sm' }: { category: Category; product?: Product; size?: 'sm' | 'md' | 'lg' }) {
  return (
    <div className={`art-frame ${size}`}>
      <PartArt category={category} product={product} />
    </div>
  )
}
