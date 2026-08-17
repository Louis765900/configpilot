/* Moteur de compatibilité.
 *
 * Trois principes, appliqués sans exception :
 *   1. une règle ne se prononce que sur des champs réellement présents dans les fiches ;
 *   2. une donnée manquante produit « information manquante », jamais un verdict favorable ;
 *   3. chaque verdict expose la liste des champs qu'il a lus (`basis`), pour être contestable.
 */

import { getProduct } from './engine'
import type { Build, CheckStatus, CompatibilityCheck, Product } from './types'

/* ---------- Accès typé aux caractéristiques ---------- */

const num = (product: Product | undefined, key: string) =>
  typeof product?.specs[key] === 'number' ? (product.specs[key] as number) : null
const str = (product: Product | undefined, key: string) =>
  typeof product?.specs[key] === 'string' ? (product.specs[key] as string) : null
const list = (product: Product | undefined, key: string) =>
  Array.isArray(product?.specs[key]) ? (product.specs[key] as string[]) : null
const flat = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
/** Somme des quantités notées « 2× 8 broches », « 1× 8 + 1× 6 broches »… */
const connectorCount = (value: string | null) =>
  value ? [...value.matchAll(/(\d+)\s*[x×]/gi)].reduce((total, match) => total + Number(match[1]), 0) : null
const numbersIn = (value: string | null) => value ? [...value.matchAll(/\d+/g)].map(match => Number(match[0])) : []
const pcieGeneration = (value: string | null) => {
  const found = value ? [...value.matchAll(/([3-6])\.0/g)].map(match => Number(match[1])) : []
  return found.length ? Math.max(...found) : null
}

/* ---------- Tables plateforme ---------- */

/** Famille de processeur déduite de l'architecture publiée sur la fiche. */
const CPU_FAMILIES: Record<string, string> = {
  'coffee lake': 'Intel 8e',
  'coffee lake refresh': 'Intel 9e',
  'comet lake': 'Intel 10e',
  'rocket lake': 'Intel 11e',
  'alder lake': 'Intel 12e',
  'raptor lake': 'Intel 13e',
  'raptor lake refresh': 'Intel 14e',
  'zen 2': 'Ryzen 3000',
  'zen 3': 'Ryzen 5000',
  'zen 4': 'Ryzen 7000',
  'zen 5': 'Ryzen 9000',
}

/** Familles prises en charge par chipset : nativement, ou après mise à jour du BIOS. */
const CHIPSET_SUPPORT: Record<string, { native: string[]; afterBios: string[] }> = {
  Z370: { native: ['Intel 8e'], afterBios: ['Intel 9e'] },
  B360: { native: ['Intel 8e'], afterBios: ['Intel 9e'] },
  H370: { native: ['Intel 8e'], afterBios: ['Intel 9e'] },
  Z390: { native: ['Intel 8e', 'Intel 9e'], afterBios: [] },
  B365: { native: ['Intel 8e', 'Intel 9e'], afterBios: [] },
  Z490: { native: ['Intel 10e'], afterBios: ['Intel 11e'] },
  Z590: { native: ['Intel 10e', 'Intel 11e'], afterBios: [] },
  B660: { native: ['Intel 12e'], afterBios: ['Intel 13e', 'Intel 14e'] },
  Z690: { native: ['Intel 12e'], afterBios: ['Intel 13e', 'Intel 14e'] },
  B760: { native: ['Intel 12e', 'Intel 13e'], afterBios: ['Intel 14e'] },
  Z790: { native: ['Intel 12e', 'Intel 13e'], afterBios: ['Intel 14e'] },
  B450: { native: ['Ryzen 3000'], afterBios: ['Ryzen 5000'] },
  X470: { native: ['Ryzen 3000'], afterBios: ['Ryzen 5000'] },
  B550: { native: ['Ryzen 3000'], afterBios: ['Ryzen 5000'] },
  X570: { native: ['Ryzen 3000'], afterBios: ['Ryzen 5000'] },
  A620: { native: ['Ryzen 7000'], afterBios: ['Ryzen 9000'] },
  B650: { native: ['Ryzen 7000'], afterBios: ['Ryzen 9000'] },
  X670: { native: ['Ryzen 7000'], afterBios: ['Ryzen 9000'] },
  B850: { native: ['Ryzen 7000', 'Ryzen 9000'], afterBios: [] },
  X870: { native: ['Ryzen 7000', 'Ryzen 9000'], afterBios: [] },
}

/** Enveloppe thermique indicative associée à la classe de refroidissement annoncée. */
const COOLER_CAPACITY: Record<string, number> = { moyenne: 130, elevee: 200, 'tres elevee': 280 }

const cpuFamily = (cpu: Product | undefined) => {
  const architecture = str(cpu, 'Architecture')
  return architecture ? CPU_FAMILIES[flat(architecture)] ?? null : null
}

/** Puissance de crête estimée d'un processeur, au-delà de son TDP nominal. */
export const cpuPeakDraw = (tdp: number) => Math.round(tdp * 1.35)

/** Consommation système estimée : processeur en crête, carte graphique, et 85 W pour le reste. */
export function estimateSystemDraw(build: Build) {
  const cpuTdp = num(getProduct(build.cpu), 'TDP') ?? 0
  const gpuDraw = num(getProduct(build.gpu), 'Consommation (W)') ?? 0
  return Math.round(cpuPeakDraw(cpuTdp) + gpuDraw + 85)
}

/* ---------- Règles ---------- */

type Rule = Omit<CompatibilityCheck, 'group'>

export function checkCompatibility(build: Build): CompatibilityCheck[] {
  const cpu = getProduct(build.cpu), gpu = getProduct(build.gpu), mb = getProduct(build.motherboard)
  const ram = getProduct(build.ram), psu = getProduct(build.psu), box = getProduct(build.case)
  const cooling = getProduct(build.cooling), storage = getProduct(build.storage), expansion = getProduct(build.expansion)
  const checks: CompatibilityCheck[] = []
  const add = (group: CompatibilityCheck['group'], rule: Rule) => checks.push({ ...rule, group })
  const verdict = (ready: boolean, status: CheckStatus): CheckStatus => (ready ? status : 'unknown')

  /* --- Plateforme --- */

  if (cpu && mb) {
    const cpuSocket = str(cpu, 'Socket'), boardSocket = str(mb, 'Socket')
    const known = Boolean(cpuSocket && boardSocket)
    add('Plateforme', {
      id: 'socket',
      label: 'Socket processeur',
      status: verdict(known, cpuSocket === boardSocket ? 'ok' : 'error'),
      detail: !known
        ? 'Le socket n’est pas renseigné sur l’une des deux fiches : impossible de conclure.'
        : cpuSocket === boardSocket
          ? `Socket ${cpuSocket} identique des deux côtés.`
          : `Le processeur est en ${cpuSocket}, la carte mère en ${boardSocket}. Le montage est physiquement impossible.`,
      basis: 'Processeur.Socket · Carte mère.Socket',
    })

    const family = cpuFamily(cpu), chipset = str(mb, 'Chipset')
    const support = chipset ? CHIPSET_SUPPORT[chipset.toUpperCase()] : undefined
    const flashback = str(mb, 'BIOS Flashback') === 'Oui'
    add('Plateforme', {
      id: 'chipset',
      label: 'Chipset et version du BIOS',
      status: !family || !support ? 'unknown'
        : support.native.includes(family) ? 'ok'
          : support.afterBios.includes(family) ? 'warning' : 'error',
      detail: !family || !support
        ? `Génération du processeur ou chipset non répertorié${chipset ? ` (${chipset})` : ''} : à confirmer sur la liste de compatibilité du constructeur.`
        : support.native.includes(family)
          ? `${chipset} prend en charge la génération ${family} d’origine.`
          : support.afterBios.includes(family)
            ? `${chipset} accepte la génération ${family} après mise à jour du BIOS. ${flashback
              ? 'Cette carte dispose du flash BIOS sans processeur, la mise à jour est possible avant montage.'
              : 'Sans flash BIOS sans processeur, il faut un processeur compatible pour effectuer la mise à jour.'}`
            : `${chipset} ne prend pas en charge la génération ${family}.`,
      basis: 'Processeur.Architecture · Carte mère.Chipset · Carte mère.BIOS Flashback',
    })
  }

  if (cpu && !gpu) {
    const igpu = str(cpu, 'iGPU')
    add('Plateforme', {
      id: 'display-output',
      label: 'Sortie vidéo',
      status: !igpu ? 'unknown' : flat(igpu) === 'absent' ? 'error' : 'ok',
      detail: !igpu
        ? 'Partie graphique intégrée non renseignée.'
        : flat(igpu) === 'absent'
          ? 'Ce processeur n’a pas de partie graphique intégrée et aucune carte graphique n’est sélectionnée : la configuration n’affichera rien.'
          : `Partie graphique intégrée (${igpu}) : un affichage est possible sans carte graphique dédiée.`,
      basis: 'Processeur.iGPU',
    })
  }

  /* --- Mémoire --- */

  if (ram && mb) {
    const type = str(ram, 'Type'), accepted = str(mb, 'RAM')
    const known = Boolean(type && accepted)
    add('Mémoire', {
      id: 'ram-type',
      label: 'Type de mémoire',
      status: verdict(known, accepted!.includes(type!) ? 'ok' : 'error'),
      detail: !known
        ? 'Type de mémoire non renseigné.'
        : accepted!.includes(type!)
          ? `${type} accepté par la carte mère.`
          : `Barrettes en ${type}, carte mère en ${accepted}. Les connecteurs sont détrompés : le montage est impossible.`,
      basis: 'Mémoire.Type · Carte mère.RAM',
    })

    const sticks = num(ram, 'Barrettes'), slots = num(mb, 'Slots RAM')
    add('Mémoire', {
      id: 'ram-slots',
      label: 'Emplacements mémoire',
      status: verdict(sticks != null && slots != null, sticks! <= slots! ? 'ok' : 'error'),
      detail: sticks == null || slots == null
        ? 'Nombre de barrettes ou d’emplacements non renseigné.'
        : sticks <= slots
          ? `${sticks} barrette${sticks > 1 ? 's' : ''} pour ${slots} emplacements.`
          : `${sticks} barrettes pour seulement ${slots} emplacements.`,
      basis: 'Mémoire.Barrettes · Carte mère.Slots RAM',
    })

    const capacity = num(ram, 'Capacité'), maximum = num(mb, 'RAM max (Go)')
    add('Mémoire', {
      id: 'ram-capacity',
      label: 'Capacité mémoire',
      status: verdict(capacity != null && maximum != null, capacity! <= maximum! ? 'ok' : 'error'),
      detail: capacity == null || maximum == null
        ? 'Capacité installée ou maximale non renseignée.'
        : `${capacity} Go installés pour ${maximum} Go acceptés.`,
      basis: 'Mémoire.Capacité · Carte mère.RAM max (Go)',
    })

    const speed = num(ram, 'Fréquence'), boardMax = num(mb, 'RAM max (MHz)')
    add('Mémoire', {
      id: 'ram-speed',
      label: 'Fréquence mémoire',
      status: verdict(speed != null && boardMax != null, speed! <= boardMax! ? 'ok' : 'warning'),
      detail: speed == null || boardMax == null
        ? 'Fréquence du kit ou fréquence maximale validée non renseignée.'
        : speed <= boardMax
          ? `${speed} MHz dans la plage validée par la carte mère (jusqu’à ${boardMax} MHz).`
          : `${speed} MHz au-delà des ${boardMax} MHz validés par le constructeur. Le kit fonctionnera, mais peut-être à fréquence réduite.`,
      basis: 'Mémoire.Fréquence · Carte mère.RAM max (MHz)',
    })
  }

  if (ram && cpu) {
    const speed = num(ram, 'Fréquence'), official = numbersIn(str(cpu, 'Mémoire'))
    const ceiling = official.length ? Math.max(...official) : null
    if (speed != null && ceiling != null && ceiling > 1000) {
      add('Mémoire', {
        id: 'ram-controller',
        label: 'Contrôleur mémoire du processeur',
        status: speed <= ceiling ? 'ok' : 'info',
        detail: speed <= ceiling
          ? `${speed} MHz dans la spécification officielle du processeur (${ceiling} MHz).`
          : `Le processeur est officiellement spécifié à ${ceiling} MHz. Les ${speed} MHz du kit s’obtiennent par profil XMP/EXPO, hors garantie de fréquence du fabricant.`,
        basis: 'Mémoire.Fréquence · Processeur.Mémoire',
      })
    }
    const profile = str(ram, 'Profil')
    if (profile && (flat(profile).includes('xmp') || flat(profile).includes('expo'))) {
      const expoOnly = flat(profile).includes('expo') && !flat(profile).includes('xmp')
      const xmpOnly = flat(profile).includes('xmp') && !flat(profile).includes('expo')
      const mismatch = (expoOnly && cpu.brand === 'Intel') || (xmpOnly && cpu.brand === 'AMD')
      add('Mémoire', {
        id: 'ram-profile',
        label: 'Profil de performance mémoire',
        status: mismatch ? 'warning' : 'ok',
        detail: mismatch
          ? `Le kit expose un profil ${expoOnly ? 'EXPO, propre à AMD' : 'XMP, propre à Intel'} alors que le processeur est ${cpu.brand}. La barrette fonctionnera à sa fréquence de base ; vérifier que le kit publie aussi l’autre profil.`
          : `Profil ${profile} exploitable sur cette plateforme ${cpu.brand}.`,
        basis: 'Mémoire.Profil · Processeur.brand',
      })
    }
  }

  /* --- Intégration physique --- */

  if (mb && box) {
    const format = str(mb, 'Format'), accepted = list(box, 'Cartes mères')
    add('Intégration', {
      id: 'case-format',
      label: 'Format de carte mère',
      status: verdict(Boolean(format && accepted), accepted!.includes(format!) ? 'ok' : 'error'),
      detail: !format || !accepted
        ? 'Format de carte mère ou formats acceptés non renseignés.'
        : accepted.includes(format)
          ? `Format ${format} accepté (${accepted.join(', ')}).`
          : `Le boîtier accepte ${accepted.join(', ')} mais pas le format ${format}.`,
      basis: 'Carte mère.Format · Boîtier.Cartes mères',
    })
  }

  if (gpu && box) {
    const length = num(gpu, 'Longueur (mm)'), clearance = num(box, 'GPU max (mm)')
    const margin = length != null && clearance != null ? clearance - length : null
    add('Intégration', {
      id: 'gpu-length',
      label: 'Longueur de carte graphique',
      status: verdict(margin != null, margin! < 0 ? 'error' : margin! < 15 ? 'warning' : 'ok'),
      detail: margin == null
        ? 'Longueur de la carte ou dégagement du boîtier non renseignés.'
        : margin < 0
          ? `La carte mesure ${length} mm pour ${clearance} mm disponibles : il manque ${Math.abs(margin)} mm.`
          : margin < 15
            ? `${length} mm pour ${clearance} mm disponibles : ${margin} mm de marge seulement, à confirmer avec le câblage d’alimentation.`
            : `${length} mm pour ${clearance} mm disponibles, soit ${margin} mm de marge.`,
      basis: 'Carte graphique.Longueur (mm) · Boîtier.GPU max (mm)',
    })
  }

  if (cooling && box) {
    const height = num(cooling, 'Hauteur (mm)'), clearance = num(box, 'Ventirad max (mm)')
    const radiator = num(cooling, 'Radiateur (mm)')
    if (height != null || clearance != null) {
      const margin = height != null && clearance != null ? clearance - height : null
      add('Intégration', {
        id: 'cooler-height',
        label: 'Hauteur du ventirad',
        status: verdict(margin != null, margin! < 0 ? 'error' : margin! < 5 ? 'warning' : 'ok'),
        detail: margin == null
          ? 'Hauteur du refroidisseur ou dégagement du boîtier non renseignés.'
          : margin < 0
            ? `Ventirad de ${height} mm pour ${clearance} mm disponibles : il manque ${Math.abs(margin)} mm.`
            : `${height} mm pour ${clearance} mm disponibles, soit ${margin} mm de marge.`,
        basis: 'Refroidissement.Hauteur (mm) · Boîtier.Ventirad max (mm)',
      })
    }
    if (radiator != null) {
      const mounts = numbersIn(str(box, 'Radiateurs'))
      add('Intégration', {
        id: 'radiator-mount',
        label: 'Emplacement du radiateur',
        status: mounts.length === 0 ? 'unknown' : mounts.includes(radiator) ? 'ok' : 'error',
        detail: mounts.length === 0
          ? `Radiateur de ${radiator} mm : le boîtier ne publie aucun emplacement de radiateur exploitable.`
          : mounts.includes(radiator)
            ? `Radiateur de ${radiator} mm listé parmi les emplacements du boîtier (${str(box, 'Radiateurs')}). Contrôler l’épaisseur totale radiateur + ventilateurs.`
            : `Le boîtier liste ${str(box, 'Radiateurs')} : aucun emplacement de ${radiator} mm.`,
        basis: 'Refroidissement.Radiateur (mm) · Boîtier.Radiateurs',
      })
    }
  }

  if (psu && box) {
    const format = str(psu, 'Format'), accepted = list(box, 'Formats alimentation')
    add('Intégration', {
      id: 'psu-format',
      label: 'Format d’alimentation',
      status: verdict(Boolean(format && accepted), accepted!.includes(format!) ? 'ok' : 'error'),
      detail: !format || !accepted
        ? 'Format de l’alimentation ou formats acceptés par le boîtier non renseignés.'
        : accepted.includes(format)
          ? `Alimentation ${format} acceptée par le boîtier.`
          : `Le boîtier n’accepte que le format ${accepted.join(' ou ')} et l’alimentation est en ${format}.`,
      basis: 'Alimentation.Format · Boîtier.Formats alimentation',
    })
  }

  /* --- Refroidissement --- */

  if (cooling && cpu) {
    const sockets = list(cooling, 'Sockets compatibles'), socket = str(cpu, 'Socket')
    add('Refroidissement', {
      id: 'cooler-socket',
      label: 'Fixation sur le socket',
      status: verdict(Boolean(sockets && socket), sockets!.includes(socket!) ? 'ok' : 'error'),
      detail: !sockets || !socket
        ? 'Sockets pris en charge par le kit de fixation non renseignés.'
        : sockets.includes(socket)
          ? `Le kit de fixation couvre le socket ${socket}.`
          : `Le kit couvre ${sockets.join(', ')} : le socket ${socket} n’y figure pas.`,
      basis: 'Refroidissement.Sockets compatibles · Processeur.Socket',
    })

    const tdp = num(cpu, 'TDP'), capacityLabel = str(cooling, 'Capacité thermique')
    const capacity = capacityLabel ? COOLER_CAPACITY[flat(capacityLabel)] ?? null : null
    const peak = tdp != null ? cpuPeakDraw(tdp) : null
    add('Refroidissement', {
      id: 'cooler-capacity',
      label: 'Capacité de dissipation',
      status: verdict(capacity != null && peak != null, capacity! >= peak! * 1.15 ? 'ok' : 'warning'),
      detail: capacity == null || peak == null
        ? 'Classe de refroidissement ou TDP du processeur non renseignés.'
        : capacity >= peak * 1.15
          ? `Classe « ${capacityLabel} » face à une crête estimée à ${peak} W : la marge est confortable.`
          : `Classe « ${capacityLabel} » face à une crête estimée à ${peak} W : peu ou pas de marge. Attendre des températures élevées ou une limitation de fréquence en charge prolongée.`,
      basis: 'Refroidissement.Capacité thermique · Processeur.TDP · règle indicative ConfigPilot (crête ≈ TDP × 1,35, marge visée 15 %)',
    })
  } else if (cpu) {
    add('Refroidissement', {
      id: 'cooler-missing',
      label: 'Refroidissement processeur',
      status: 'unknown',
      detail: 'Aucun refroidissement sélectionné. La compatibilité de fixation et la capacité thermique ne peuvent pas être évaluées.',
      basis: 'Configuration.refroidissement',
    })
  }

  /* --- Alimentation --- */

  if (psu) {
    const watts = num(psu, 'Puissance')
    const draw = estimateSystemDraw(build)
    const manufacturer = num(gpu, 'PSU recommandé (W)')
    const shortOfManufacturer = watts != null && manufacturer != null && watts < manufacturer
    const thinMargin = watts != null && watts < draw * 1.25
    add('Alimentation', {
      id: 'psu-power',
      label: 'Puissance disponible',
      status: verdict(watts != null, shortOfManufacturer ? 'error' : thinMargin ? 'warning' : 'ok'),
      detail: watts == null
        ? 'Puissance de l’alimentation non renseignée.'
        : shortOfManufacturer
          ? `${watts} W disponibles alors que le fabricant de la carte graphique recommande ${manufacturer} W.`
          : thinMargin
            ? `${watts} W pour une consommation estimée à ${draw} W : la marge est inférieure aux 25 % conseillés pour absorber les pics.`
            : `${watts} W pour une consommation estimée à ${draw} W${manufacturer ? `, au-dessus des ${manufacturer} W recommandés par le fabricant du GPU` : ''}.`,
      basis: 'Alimentation.Puissance · Carte graphique.Consommation (W) · Carte graphique.PSU recommandé (W) · Processeur.TDP',
    })

    if (gpu) {
      const needed = str(gpu, 'Connecteurs')
      const modern = flat(needed ?? '').includes('12vhpwr') || flat(needed ?? '').includes('12v-2x6')
      const psuModern = str(psu, '12V-2x6')
      const available = connectorCount(str(psu, 'PCIe'))
      const required = connectorCount(needed)
      add('Alimentation', {
        id: 'psu-connectors',
        label: 'Connecteurs de la carte graphique',
        status: !needed ? 'unknown'
          : modern
            ? (psuModern && psuModern !== 'Non' ? 'ok' : 'warning')
            : verdict(available != null && required != null, available! >= required! ? 'ok' : 'error'),
        detail: !needed
          ? 'Connecteurs requis par la carte graphique non renseignés.'
          : modern
            ? (psuModern && psuModern !== 'Non'
              ? `L’alimentation fournit un connecteur ${psuModern} correspondant à l’exigence ${needed}.`
              : `La carte demande ${needed} et l’alimentation n’expose pas ce connecteur. L’adaptateur fourni avec la carte reste nécessaire ; une alimentation ATX 3.x est préférable.`)
            : available == null || required == null
              ? 'Connecteurs PCIe disponibles sur l’alimentation non renseignés.'
              : available >= required
                ? `${required} connecteur${required > 1 ? 's' : ''} requis, ${available} disponible${available > 1 ? 's' : ''}.`
                : `La carte demande ${required} connecteurs (${needed}) et l’alimentation n’en fournit que ${available}.`,
        basis: 'Carte graphique.Connecteurs · Alimentation.PCIe · Alimentation.12V-2x6',
      })

      const atx3 = str(psu, 'ATX 3.x')
      if (modern && atx3) {
        add('Alimentation', {
          id: 'psu-atx3',
          label: 'Norme ATX 3.x',
          status: atx3 === 'Oui' ? 'ok' : 'warning',
          detail: atx3 === 'Oui'
            ? 'Alimentation conforme ATX 3.x : les pics de consommation transitoires des cartes récentes sont pris en compte.'
            : 'Alimentation antérieure à ATX 3.x associée à une carte à connecteur 12VHPWR. Prévoir une marge de puissance supplémentaire pour les pics transitoires.',
          basis: 'Alimentation.ATX 3.x · Carte graphique.Connecteurs',
        })
      }
    }
  }

  /* --- Stockage --- */

  if (storage && mb) {
    const type = str(storage, 'Type')
    if (type && flat(type).includes('nvme')) {
      const ports = num(mb, 'Ports M.2')
      add('Stockage', {
        id: 'm2-port',
        label: 'Port M.2',
        status: verdict(ports != null, ports! >= 1 ? 'ok' : 'error'),
        detail: ports == null
          ? 'Nombre de ports M.2 non renseigné.'
          : ports >= 1 ? `${ports} port${ports > 1 ? 's' : ''} M.2 disponible${ports > 1 ? 's' : ''}.`
            : 'Cette carte mère n’expose aucun port M.2.',
        basis: 'Stockage.Type · Carte mère.Ports M.2',
      })
      const driveGeneration = pcieGeneration(str(storage, 'Interface'))
      const boardGeneration = pcieGeneration(str(mb, 'PCIe'))
      if (driveGeneration && boardGeneration) {
        add('Stockage', {
          id: 'm2-generation',
          label: 'Génération PCIe du SSD',
          status: driveGeneration <= boardGeneration ? 'ok' : 'info',
          detail: driveGeneration <= boardGeneration
            ? `SSD en PCIe ${driveGeneration}.0 sur une carte mère en PCIe ${boardGeneration}.0 : pleine vitesse.`
            : `SSD en PCIe ${driveGeneration}.0 sur une carte mère en PCIe ${boardGeneration}.0. Le disque fonctionnera, à la vitesse de la génération inférieure.`,
          basis: 'Stockage.Interface · Carte mère.PCIe',
        })
      }
    }
    if (type && flat(type).includes('sata')) {
      const ports = num(mb, 'Ports SATA')
      add('Stockage', {
        id: 'sata-port',
        label: 'Port SATA',
        status: verdict(ports != null, ports! >= 1 ? 'ok' : 'error'),
        detail: ports == null ? 'Nombre de ports SATA non renseigné.'
          : ports >= 1 ? `${ports} ports SATA disponibles.` : 'Cette carte mère n’expose aucun port SATA.',
        basis: 'Stockage.Type · Carte mère.Ports SATA',
      })
    }
  }

  /* --- Connectivité --- */

  if (mb) {
    const wifi = str(mb, 'WiFi')
    const cardProvidesWifi = flat(str(expansion, 'Fonctions') ?? '').includes('wi-fi')
    if (wifi === 'Non' && !cardProvidesWifi) {
      add('Plateforme', {
        id: 'wifi',
        label: 'Connectivité sans fil',
        status: 'info',
        detail: 'Cette carte mère n’intègre pas le Wi-Fi. Prévoir une liaison filaire ou une carte d’extension si le sans-fil est nécessaire.',
        basis: 'Carte mère.WiFi · Carte d’extension.Fonctions',
      })
    }
  }

  if (expansion && mb) {
    const boardSlots = str(mb, 'PCIe')
    add('Plateforme', {
      id: 'expansion-slot',
      label: 'Emplacement de la carte d’extension',
      status: boardSlots ? 'info' : 'unknown',
      detail: boardSlots
        ? `Carte en ${str(expansion, 'Interface') ?? 'interface non renseignée'}. Les emplacements PCIe sont rétrocompatibles, mais vérifier qu’un emplacement reste libre une fois la carte graphique installée.`
        : 'Emplacements PCIe de la carte mère non renseignés.',
      basis: 'Carte d’extension.Interface · Carte mère.PCIe',
    })
  }

  if (!checks.length) {
    add('Plateforme', {
      id: 'empty',
      label: 'Configuration vide',
      status: 'unknown',
      detail: 'Sélectionne au moins deux composants pour lancer les contrôles croisés.',
      basis: 'Configuration',
    })
  }
  return checks
}

/* ---------- Synthèse ---------- */

export type BuildVerdict = {
  status: CheckStatus
  title: string
  detail: string
  counts: Record<CheckStatus, number>
}

export function buildVerdict(checks: CompatibilityCheck[]): BuildVerdict {
  const counts = { ok: 0, warning: 0, error: 0, unknown: 0, info: 0 } as Record<CheckStatus, number>
  checks.forEach(check => { counts[check.status] += 1 })
  if (checks.length === 1 && checks[0].id === 'empty') {
    return { status: 'unknown', counts, title: 'Configuration vide', detail: 'Ajoute des composants pour lancer les contrôles croisés.' }
  }
  if (counts.error > 0) {
    return {
      status: 'error', counts,
      title: `${counts.error} conflit${counts.error > 1 ? 's' : ''} bloquant${counts.error > 1 ? 's' : ''}`,
      detail: 'Au moins un composant ne peut pas fonctionner avec les autres. Le détail précise le champ en cause.',
    }
  }
  if (counts.warning > 0) {
    return {
      status: 'warning', counts,
      title: `${counts.warning} point${counts.warning > 1 ? 's' : ''} à confirmer`,
      detail: 'Aucun conflit bloquant, mais certains points demandent une vérification avant achat.',
    }
  }
  if (counts.unknown > 0) {
    return {
      status: 'unknown', counts,
      title: `${counts.unknown} information${counts.unknown > 1 ? 's' : ''} manquante${counts.unknown > 1 ? 's' : ''}`,
      detail: 'Les contrôles réalisés passent. D’autres ne peuvent pas être rendus faute de données publiées.',
    }
  }
  if (counts.ok === 0) {
    return { status: 'unknown', counts, title: 'Configuration vide', detail: 'Ajoute des composants pour lancer les contrôles.' }
  }
  return {
    status: 'ok', counts,
    title: `${counts.ok} contrôles validés`,
    detail: 'Tous les contrôles réalisables sur les données disponibles sont favorables.',
  }
}
