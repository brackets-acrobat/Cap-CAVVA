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
- **Points de report VFR** : les 1 098 repères de métropole, avec le repère au sol
  qui permet de les trouver à vue — « Cavaillon (Pont TGV sur la Durance) ».
  Aimantables comme points tournants.
- **Obstacles et feux aéronautiques** : 13 452 obstacles et 50 feux, symboles et
  bleu repris de la carte OACI au 1/500 000, filtre de hauteur réglable.
- **Parcs et réserves à hauteur de survol imposée** : le SIA n'en donne le contour
  que pour 7 des 94 zones ; les autres le reçoivent d'une bibliothèque livrée avec
  l'application (voir plus bas).
- **Briefs des séances** téléchargés depuis CAVVA et vérifiés par signature : le
  calendrier complet, avec type de vol, aérodrome d'arrivée, rayon de départ et
  zones actives.
- **Plan de vol** tracé à la souris : points tournants nommables, étiquette de cap
  magnétique et distance sur chaque branche, **log de navigation** (vent, vitesse
  propre, cap à suivre, vitesse sol, durée), copie des points au presse-papier,
  profil vertical du relief.
- **Export vers le GTN750 de PMS50** : la route déposée en `.pln` dans le paquet
  du simulateur, prête à être importée depuis l'instrument.
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
parcs). Elles sont comptées puis écartées à la conversion — pas devinées. Les
**parcs et réserves** font seule exception, et par apport extérieur, pas par
déduction : voir ci-dessous.

## Les contours des parcs et réserves

L'export du SIA décrit 94 zones `PRN` en métropole — parcs nationaux et réserves
naturelles à hauteur minimale de survol imposée — mais n'en donne le contour que
pour 7. Cocher « Parcs et survol » n'allumait donc presque rien.

Le contour manquant vient d'une bibliothèque **livrée avec l'application**
(`src/main/bundled-data/contours-proteges.json.gz`), extraite de la **BD TOPO de
l'IGN** via la Géoplateforme et régénérable par `npm run contours:maj`. C'est le
seul cas où Cap CAVVA embarque de la donnée plutôt qu'une clé d'accès : les
navaids viennent de MSFS, les fiches ULM de la FFPLUM, et les fichiers embarqués
correspondants ne sont que ce qu'il faut pour aller les chercher.

**Le SIA reste seul à dire la règle.** La bibliothèque ne contient que des
géométries. Quelles zones existent, à quelle hauteur le survol est interdit, à
qui l'interdiction ne s'applique pas : tout cela vient du SIA, cycle par cycle.
Le rapprochement se fait donc à la conversion, et non une fois pour toutes dans
la bibliothèque — un cycle AIRAC qui ajoute une réserve la verra rapprochée sans
qu'on retouche à rien. Ce qui ne se rapproche pas reste un point, sans contour
inventé.

Les **parcs naturels régionaux** en sont volontairement absents : ils ne portent
aucune interdiction de survol. Les zones `SUR` non plus — ce sont pour la plupart
des sites industriels, centrales et centres pénitentiaires, sans contour public
correspondant ; elles restent des repères.

Données © IGN — BD TOPO®, Licence Ouverte 2.0, la même que l'export du SIA.

## Le plan de vol

Le panneau « Plan de vol » tient le **log de navigation**, une ligne par branche :

| N° | Départ | Arrivée | Alt (ft) | Dist (nm) | Route (°) | Cap (°) | GS (kt) | Durée |
|---|---|---|---|---|---|---|---|---|

Une **vitesse propre** et un **vent** en tête de panneau donnent, branche par
branche, le triangle des vitesses : dérive, cap à suivre, vitesse sol, donc la
durée. Double-clic pour renommer un point ou changer une altitude ; cliquer
ailleurs valide, seule Échap annule.

**Deux référentiels, et un seul passage de l'un à l'autre.** Le vent se saisit en
**vrai** : c'est ce que donne MSFS (`AMBIENT WIND DIRECTION`) et ce qu'écrit un
METAR, donc rien à convertir en entrée. La colonne « Route » est la route vraie,
la carte étant nord-vrai. Le passage en magnétique n'a lieu qu'au bout de la
chaîne, dans la colonne « Cap » :

```
Cap = route vraie + dérive − déclinaison locale de la branche
```

La déclinaison est celle du **milieu de chaque branche** (WMM), pas une moyenne
du plan. L'indicateur de vent de la carte, lui, reste affiché en magnétique —
c'est ce que l'ATIS annonce.

**MSFS connecté**, les deux cases de vent passent en lecture seule, prennent le
vent du simulateur et se rafraîchissent toutes les 30 secondes ; un badge `MSFS`
le signale. À la déconnexion elles redeviennent saisissables en gardant la
dernière valeur. La vitesse propre, elle, reste toujours au pilote.

Un plan `.ccfp` conserve la vitesse propre et le vent avec la route. Un plan
chargé n'écrase pas le vent du simulateur pendant qu'on vole.

### Vers le GTN750 de PMS50

Le bouton **GPS** de la barre dépose la route dans l'instrument. Celui-ci
n'accepte qu'un format — le PLN de MSFS — sous un nom qu'il est seul à lire :

```
<Community>/pms50-instrument-gtn750/fpl/gtn750/fpl.pln
```

Le dossier `Community` de MSFS 2024 est retrouvé par `InstalledPackagesPath`
dans `UserCfg.opt`, aux deux emplacements possibles (Steam, Microsoft Store).
Le fichier précédent est remplacé : l'instrument ne connaît que ce nom-là.
Côté simulateur, il reste à presser **Import** dans le menu de la page Flight
Plan. C'est une fonction Premium du GTN750, indisponible sur Xbox et sur les
paquets installés depuis le Marketplace.

**Les points tournants partent en points utilisateur, sans exception.** La
documentation de PMS50 avertit qu'un point associé à un aérodrome, mal écrit par
une application tierce, fait planter le simulateur. Or c'est exactement ce
qu'est un point de report VFR français : `NE`, `SIERRA`, `MM-CV` n'existent
qu'attachés à leur terrain. Un point tournant part donc avec ses seules
coordonnées et aucun bloc ICAO — la route du GTN est celle de la carte au mètre
près, et le risque est écarté. Seuls le départ et l'arrivée gardent leur
identité d'aérodrome.

Les identifiants sont ramenés à cinq caractères, sans accent ni espace, comme le
GTN750 les porte ; les homonymes sont numérotés. Chaque point reçoit l'altitude
de la branche qui y **arrive** — celle à laquelle on le franchit — et
`CruisingAlt` reprend la plus haute des branches.

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
| `contours-proteges.js` | Rend leur surface aux parcs et réserves du SIA |
| `plan-io.js` | Sauvegarde et ouverture d'un plan (`.ccfp`) |
| `export-gtn750.js` | Dépôt du plan de vol (`.pln`) pour le GTN750 de PMS50 |
| `brief-source.js` | Briefs de séance : téléchargement, clé, signature |
| `brief-crypto.js` | Signature HMAC des briefs |
| `updater.js` | Mise à jour automatique |

`src/renderer/js/features/` porte une trentaine de fichiers sur le même principe
(`carte.js`, `route.js`, `panneau-plan.js`, `vent-plan.js`, `obstacles.js`,
`points-vfr.js`, `avion.js`…). L'ordre des `<script>` dans `index.html` fait la
dépendance : pas de modules ES, portée globale partagée — convention reprise de
NavXpressVFR.

Deux fichiers portent le vent, et ne se confondent pas : `vent.js` n'affiche que
l'indicateur temps réel de la carte, `vent-plan.js` tient les paramètres de
navigation du plan et le triangle des vitesses.

## Les briefs de séance

Le site CAVVA publie `cap-cavva/briefs.json` : **le calendrier complet** des vols
d'aéroclub, pas seulement le prochain. L'application le télécharge avec la clé du
compte, **vérifie la signature avant d'interpréter quoi que ce soit**, et n'en
garde aucune copie — le calendrier bouge, une séance s'annule, une zone change.

Le panneau liste les séances et en laisse choisir une (la prochaine à venir, par
défaut). La séance choisie trace son **rayon de départ autour de l'aérodrome
d'arrivée** et met ses **zones actives en évidence** sur la carte comme dans le
profil vertical — même si les filtres d'affichage les excluent.

Les zones sont saisies en texte libre sur le site (`R45 S2 LANGRES`,
`R46A R46B R46C`, `NON`). L'application les rapproche elle-même de l'export du
SIA, par normalisation : **rien à changer côté site**. Vérifié sur les 42 vols
publiés — 18 saisies, 18 rapprochées.

Le format, les codes d'erreur et le contrôleur PHP à écrire sont dans
**[FORMAT-BRIEF.md](FORMAT-BRIEF.md)**.

Le secret dont dérive la signature **n'est pas dans le dépôt** — celui-ci est
public. Au premier clonage :

```bash
npm run brief:secret
```

Il écrit `src/main/brief-secret.js`, gitignoré, embarqué à l'empaquetage par
`npm run dist`. `npm run brief:cle` en donne la clé dérivée, à poser dans le
`config.local.php` du site. **À sauvegarder hors du dépôt** : le perdre oblige à
en refaire un et à remettre la clé côté serveur.

Éprouver le client sans serveur CAVVA :

```bash
npm run brief:essai -- --cas=ok
```

puis, dans un autre terminal, `CAVVA_BASE_URL=http://127.0.0.1:8787 npm start`.
`--cas=` joue aussi `entete`, `falsifie`, `absent`, `refuse`, `malforme` et
`futur` — c'est là que se vérifie ce que l'application **refuse**.

## Crédits

L'extraction des navaids depuis MSFS 2024 s'inspire de la méthode du projet
**atools / Little Navmap** d'Alexander Barthel, dont le séquencement du leg actif
est également un portage fidèle.

Le log de navigation reprend la disposition et le calcul de **NavXpressVFR**, du
même auteur.

Sources de données, toutes en Licence Ouverte 2.0 : **SIA** (espaces, points de
report, obstacles, feux), **IGN — BD TOPO®** (contours des parcs et réserves),
**FFPLUM / BASULM** (fiches ULM).

## Licence

GPL-3.0-or-later — © 2026 Cyril MILANI.
