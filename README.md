# Cap CAVVA

Application **desktop** (Electron / Windows, connectée à MSFS 2024 via **SimConnect**)
pour le vol de club : carte des **espaces aériens français en
vectoriel**, **zones actives de la séance** annoncées par le site CAVVA, plan de vol et
suivi de l'avion en direct.

> Projet **séparé**, sans lien de dépôt avec `backcountry-desktop` : le code de la
> carte, du plan de vol et de la connexion SimConnect en est repris, puis découpé en
> fichiers par fonctionnalité.

## Ce que fait l'application

- Carte Leaflet : OpenStreetMap, OpenTopoMap, Dark Matter, Positron.
- Import des **aéroports et navaids depuis MSFS 2024** (le simulateur est la source).
- **Espaces aériens français** tracés en vectoriel, interrogeables, depuis l'export
  XML du SIA converti localement.
- **Brief de la séance** téléchargé depuis CAVVA et vérifié par signature : type de
  vol, aéroport d'arrivée, rayon de départ, zones actives.
- Plan de vol tracé à la souris : points tournants nommables, étiquette de **cap
  magnétique** (déclinaison WMM locale) et distance sur chaque branche, tableau des
  legs, copie des points au presse-papier, profil vertical du relief.
- Position de l'avion en temps réel, mode suivi, indicateur de vent.

## Démarrage

```bash
npm install
```

Si le lancement échoue sur « Electron failed to install correctly » (extraction
silencieusement ratée sous Windows) :

```bash
npm run force-electron
```

Puis, en copiant `config.example.json` vers `config.json` et en y mettant la clé CAVVA :

```bash
npm start
```

`config.json` est **gitignoré** (il contient la clé). La clé peut aussi être saisie
dans l'application, auquel cas elle est écrite dans
`Documents/Cap CAVVA/settings.json`.

## Les données d'espaces aériens

Rien n'est livré avec l'application. Le fichier vient du SIA, gratuitement :

1. Compte sur [sia.aviation-civile.gouv.fr](https://www.sia.aviation-civile.gouv.fr/),
   produit « Données aéronautiques XML » du cycle AIRAC en cours, 0,00 €.
2. Déposer le `XML_SIA_aaaa-mm-jj.xml` du zip dans `Documents/Cap CAVVA/sia/`.
3. L'application détecte le fichier et propose la conversion.

Licence Ouverte 2.0 — réutilisable avec mention de la source. Le cycle dure 28 jours ;
l'application signale un fichier périmé.

**Ce que l'export contient** : les géométries sont déjà densifiées (cercles, arcs et
suivis de frontière résolus en listes de points — rien à recalculer), les limites
verticales sont complètes et référencées explicitement en `SFC` / `ft ASFC` /
`ft AMSL` / `FL`, ce qui correspond exactement aux trois altitudes que SimConnect
fournit :

| Référence SIA | SimVar lu |
|---|---|
| `SFC`, `ft ASFC` | `PLANE ALT ABOVE GROUND` |
| `ft AMSL` | `PLANE ALTITUDE` |
| `FL` | `PRESSURE ALTITUDE` |

Aucune conversion, aucun QNH à appliquer.

**Ce qu'il ne contient pas** : près de la moitié des « parties » de l'export sont des
points isolés sans rayon (terrains privés, voltige, parachutage, survol de sites,
parcs). Elles sont comptées puis écartées à la conversion — pas devinées.

## Arborescence

Un fichier par fonctionnalité, des deux côtés.

| `src/main/` | Rôle |
|---|---|
| `main.js` | Fenêtres, IPC, relais SimConnect — rien d'autre |
| `config.js` | Réglages et dossiers de travail |
| `simconnect.js` | Connexion au simulateur, lecture des SimVars |
| `msfs-import.js` | Import des aéroports et navaids |
| `airports-data.js` | Bases extraites, requêtes par bbox |
| `elevation.js` | Relief GLOBE et profil vertical |
| `declinaison.js` | Déclinaison magnétique (WMM) |
| `plan-io.js` | Sauvegarde et ouverture d'un plan (`.ccfp`) |
| `updater.js` | Mise à jour automatique |

`src/renderer/js/features/` porte une vingtaine de fichiers sur le même principe
(`carte.js`, `route.js`, `etiquettes-legs.js`, `avion.js`…). L'ordre des `<script>`
dans `index.html` fait la dépendance : pas de modules ES, portée globale partagée —
convention reprise de NavXpressVFR.

## Crédits

L'extraction des navaids depuis MSFS 2024 s'inspire de la méthode du projet
**atools / Little Navmap** d'Alexander Barthel.

## Licence

GPL-3.0-or-later — © 2026 Cyril MILANI.
