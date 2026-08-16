const ENTRIES: [string, string][] = [
  ['Socket', 'Le support physique et électrique qui relie le processeur à la carte mère. Les noms doivent correspondre exactement : un LGA1700 n’entre pas dans un LGA1851.'],
  ['Chipset', 'Le contrôleur de la carte mère. Il détermine les générations de processeurs acceptées, le nombre de lignes PCIe et une partie de la connectique.'],
  ['BIOS', 'Le micrologiciel de la carte mère. Une carte peut avoir besoin d’une mise à jour du BIOS pour reconnaître un processeur sorti après elle. Le flash sans processeur permet de le faire avant montage.'],
  ['TDP', 'Une enveloppe thermique de référence, utile pour dimensionner le refroidissement. Ce n’est pas la consommation maximale réelle, qui la dépasse souvent en charge.'],
  ['VRM', 'L’étage d’alimentation du processeur sur la carte mère. Sa qualité influence les températures et la stabilité avec un processeur exigeant.'],
  ['XMP / EXPO', 'Des profils mémoire préconfigurés qui font fonctionner les barrettes au-delà de leur fréquence de base. XMP est la norme Intel, EXPO la norme AMD.'],
  ['PCIe', 'L’interface des cartes graphiques, des SSD NVMe et des cartes d’extension. Les générations sont rétrocompatibles : un périphérique récent fonctionne sur un port plus ancien, à vitesse réduite.'],
  ['M.2', 'Le format des SSD compacts qui se vissent directement sur la carte mère. Un port M.2 peut être en PCIe ou en SATA, et tous ne sont pas à la même génération.'],
  ['12VHPWR / 12V-2x6', 'Le connecteur d’alimentation des cartes graphiques récentes. Le 12V-2x6 en est la révision, pensée pour un contact plus sûr.'],
  ['ATX 3.x', 'La révision de la norme d’alimentation qui prend en compte les pics de consommation très brefs des cartes graphiques modernes.'],
  ['Décote', 'La perte de valeur d’un composant depuis son lancement. ConfigPilot la modélise à partir du tarif de sortie et de ses repères internes, sans relever de prix marchand.'],
  ['Quarantaine', 'L’état d’un résultat trouvé par un robot mais pas encore relu par un humain. Rien en quarantaine n’alimente le catalogue fiable.'],
]

export default function Glossary() {
  return (
    <div className="view">
      <div className="page-head">
        <div>
          <span className="eyebrow">Glossaire</span>
          <h1>Le matériel PC, en langage clair.</h1>
          <p>Les termes qui reviennent dans les fiches et dans le diagnostic du configurateur.</p>
        </div>
      </div>
      <div className="glossary-grid">
        {ENTRIES.map(([term, definition]) => (
          <article key={term}>
            <h3>{term}</h3>
            <p>{definition}</p>
          </article>
        ))}
      </div>
    </div>
  )
}
