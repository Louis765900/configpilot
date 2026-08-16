/* Tarifs publics conseillés au lancement, en euros TTC, arrondis.
 *
 * Ces valeurs servent de point de départ à la courbe de décote et au verdict d'achat.
 * Elles sont indicatives : un tarif de lancement varie selon le pays, la date exacte de
 * mise en vente et les remises constructeur. L'interface les présente toujours comme un
 * repère à confirmer, jamais comme un relevé marchand.
 *
 * Une référence absente de cette table reste affichée « À vérifier » : aucune valeur
 * n'est déduite ni inventée pour combler un trou.
 */

export const launchPrices: Record<string, number> = {
  'cpu-8600k': 279,
  'cpu-9700k': 429,
  'cpu-9900kf': 499,
  'cpu-12400f': 219,
  'cpu-13600k': 359,
  'cpu-5600': 199,
  'cpu-5700x3d': 269,
  'cpu-7600': 259,
  'cpu-7800x3d': 499,
  'gpu-1660s': 249,
  'gpu-3060': 349,
  'gpu-4060': 329,
  'gpu-4070s': 659,
  'gpu-6600': 339,
  'gpu-7800xt': 549,
  'gpu-a750': 289,
  'mb-z390-a-pro': 135,
  'mb-b550': 130,
  'mb-b650': 180,
  'mb-b760': 190,
  'ram-16-ddr4': 75,
  'ram-32-ddr4': 130,
  'ram-32-ddr5': 165,
  'psu-evga-w1': 55,
  'psu-cx650': 80,
  'psu-rm750e': 125,
  'psu-focus850': 155,
  'case-pop-air': 95,
  'case-nr200': 105,
  'ssd-mx500': 130,
  'ssd-sn770': 125,
  'ssd-p3plus': 195,
  'cool-pa120': 45,
  'cool-hyper212': 45,
  'cool-lf3-240': 90,
  'ext-wifi6': 55,
  'ext-capture': 250,
}
