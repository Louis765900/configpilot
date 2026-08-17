# Audit reproductible BuildCores OpenDB

Contrôle réalisé le 17 août 2026 sur la révision `b8825028d5dace899257ae04692144f9b516fc54`.

Commande :

```bash
npm run components:import:buildcores -- --dry-run --source-dir /chemin/buildcores-open-db
```

Résultat constaté :

| Mesure | Valeur |
|---|---:|
| Fichiers présents dans l'ensemble du dépôt | 47 554 |
| Fichiers appartenant à la whitelist ConfigPilot | 33 827 |
| Références validées et normalisables | 33 774 |
| Références rejetées | 53 |

Les rejets constatés concernent des fiches incomplètes, principalement sans fabricant. Elles ne sont ni complétées par supposition, ni silencieusement importées. Les nombres évolueront avec le dépôt source ; il faut relancer l'audit pour obtenir la valeur courante.

Catégories activées : CPU, GPU, cartes mères, RAM, stockage, alimentations, boîtiers, refroidissement CPU, ventilateurs, cartes réseau, cartes son, cartes de capture, écrans et pâte thermique.
