/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// contours-proteges.js — rendre leur surface aux parcs et réserves du SIA.
//
// L'export du SIA décrit 94 zones PRN en métropole — parcs nationaux et
// réserves naturelles à hauteur minimale de survol imposée — mais ne donne le
// contour que de 7 d'entre elles. Les autres n'ont qu'un point et aucun rayon.
//
// Ce module va chercher le contour manquant dans la bibliothèque livrée avec
// l'application (bundled-data/contours-proteges.json.gz, régénérée par
// `npm run contours:maj` depuis la BD TOPO de l'IGN).
//
// ── Ce que le SIA reste seul à dire ─────────────────────────────────────────
// La bibliothèque ne contient que des CONTOURS. Quelles zones existent, à
// quelle hauteur le survol est interdit, à qui l'interdiction ne s'applique
// pas : tout cela vient du SIA et de lui seul, cycle par cycle. On ne fait
// qu'apporter une surface à une règle qui, elle, ne change pas de source.
//
// C'est pourquoi le rapprochement se fait ICI, à la conversion, et non une fois
// pour toutes dans la bibliothèque : un cycle AIRAC qui ajoute une réserve la
// verra rapprochée sans qu'on retouche à rien.
//
// ── Comment un contour est reconnu ──────────────────────────────────────────
// Deux conditions, et les deux sont nécessaires :
//
//   1. le NOM concorde — après avoir retiré les mots de type (« réserve
//      naturelle nationale de la ») et les mots de relief (« marais », « haute
//      vallée »), qui décrivent le lieu sans le nommer ;
//   2. le REPÈRE du SIA est à moins de 8 km du contour.
//
// Le nom seul ne suffit pas : « CAMARGUE » concorde aussi avec la Petite
// Camargue Alsacienne, à 700 km. La position seule ne suffit pas non plus :
// dans les Écrins, cinq réserves intégrales se touchent. Le mot qui a fait la
// différence à l'essai est « Vénéon » — sans le test de distance, la Haute
// Vallée de Saint-Pierre héritait du contour de la Haute Vallée du Vénéon, à
// 11 km de là.
//
// Ce qui ne passe pas ces deux conditions n'est PAS rapproché : la zone reste
// un point sur la carte. Dessiner un contour incertain autour d'une zone
// d'interdiction serait pire que ne rien dessiner.
// ============================================================

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const FICHIER = path.join(__dirname, 'bundled-data', 'contours-proteges.json.gz');

const SEUIL = 0.66;      // concordance de nom, 1 = tous les mots des deux côtés
const RAYON_M = 8000;    // le repère du SIA est arrondi, parfois à la minute

// ------------------------------------------------------------
// Normalisation des noms
// ------------------------------------------------------------

// Articles et mots de type d'espace : jamais porteurs d'identité, toujours
// retirés. « Réserve naturelle nationale de la Camargue » et « Camargue »
// désignent la même chose.
const TYPES = new Set((
  'DE DU DES D LA LE LES L ET AU AUX EN SUR SOUS A SA SON '
  + 'RESERVE NATURELLE NATIONALE REGIONALE INTEGRALE BIOLOGIQUE DIRIGEE CORSE '
  + 'PARC NATIONAL ZONE COEUR AIRE ADHESION PERIMETRE PROTECTION ARRETE'
).split(' '));

// Mots de relief : ils décrivent le lieu sans le nommer, et les deux sources ne
// les emploient pas pareil — « MARAIS DE MOEZE » au SIA, « Moëze-Oléron » à
// l'IGN. On ne les retire QUE s'il reste autre chose : le parc national de
// Forêts s'appelle vraiment « Forêts », et lui ôter ce mot ne laisserait rien.
const RELIEF = new Set((
  'MARAIS ETANG ETANGS LAC LACS BAIE BAIES VALLEE VALLEES VALLON FORET FORETS '
  + 'MASSIF GORGES DUNE DUNES TOURBIERE TOURBIERES PLAINE PLAINES COTEAU COTEAUX '
  + 'CIRQUE DELTA ESTUAIRE ILE ILES ILOT ILOTS HAUT HAUTE HAUTS HAUTES BAS BASSE '
  + 'PLATEAU PLATEAUX SITE SITES SAGNES CHAUMES CASSE PLATIER ROCHER ROCHERS '
  + 'GROTTE GROTTES PELOUSE PELOUSES MONT MONTS PIC PICS COMMUNAL DOMAINE '
  + 'VERSANT NORD SUD EST OUEST FORESTIER'
).split(' '));

function mots(s) {
  const bruts = String(s || '')
    .toUpperCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter((m) => m && !TYPES.has(m));

  const propres = bruts.filter((m) => !RELIEF.has(m));
  return propres.length ? propres : bruts;
}

// Deux mots concordent s'ils partagent leur racine sur toute la longueur du
// plus court, et qu'elle fait au moins quatre lettres : « HAUT-BERANGER » doit
// retrouver « Béranger », mais « PY » ne doit pas retrouver « Pyrénées ».
function memeMot(a, b) {
  if (a === b) return true;
  const n = Math.min(a.length, b.length);
  return n >= 4 && a.slice(0, n) === b.slice(0, n);
}

// Concordance symétrique (Dice). L'asymétrie serait piégeuse : tous les mots de
// « CAMARGUE » se retrouvent dans « Petite Camargue Alsacienne », qui est une
// autre réserve.
function concordance(a, b) {
  const A = mots(a), B = mots(b);
  if (!A.length || !B.length) return 0;
  let n = 0; for (const x of A) if (B.some((y) => memeMot(x, y))) n += 1;
  let m = 0; for (const y of B) if (A.some((x) => memeMot(x, y))) m += 1;
  return (2 * Math.min(n, m)) / (A.length + B.length);
}

// ------------------------------------------------------------
// Géométrie
// ------------------------------------------------------------

function dansAnneau(lon, lat, anneau) {
  let dedans = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const xi = anneau[i][0], yi = anneau[i][1];
    const xj = anneau[j][0], yj = anneau[j][1];
    if (((yi > lat) !== (yj > lat))
      && (lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi)) dedans = !dedans;
  }
  return dedans;
}

// Distance du point au site, en mètres, 0 s'il est dedans. Repère plan local :
// sur quelques kilomètres l'écart à la sphère ne pèse rien face aux 8 km de
// tolérance.
function distanceAuSite(site, lat, lon) {
  const k = Math.cos((lat * Math.PI) / 180);
  let min = Infinity;

  for (const poly of site.poly) {
    if (poly.length && dansAnneau(lon, lat, poly[0])) {
      let dansUnTrou = false;
      for (let t = 1; t < poly.length; t++) if (dansAnneau(lon, lat, poly[t])) { dansUnTrou = true; break; }
      if (!dansUnTrou) return 0;
    }
    for (const anneau of poly) {
      for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
        const d = distanceAuSegment(lon, lat, k, anneau[j], anneau[i]);
        if (d < min) min = d;
      }
    }
  }
  return min;
}

function distanceAuSegment(lon, lat, k, p, q) {
  const ax = (p[0] - lon) * k, ay = p[1] - lat;
  const bx = (q[0] - lon) * k, by = q[1] - lat;
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 ? (-ax * dx - ay * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  const cx = ax + t * dx, cy = ay + t * dy;
  // 1° de latitude ≈ 110 540 m ; la longitude a déjà été ramenée à cette échelle.
  return Math.hypot(cx, cy) * 110540;
}

function cadre(site) {
  if (site.__cadre) return site.__cadre;
  let o = Infinity, e = -Infinity, s = Infinity, n = -Infinity;
  for (const poly of site.poly) for (const anneau of poly) for (const c of anneau) {
    if (c[0] < o) o = c[0]; if (c[0] > e) e = c[0];
    if (c[1] < s) s = c[1]; if (c[1] > n) n = c[1];
  }
  site.__cadre = { o, e, s, n };
  return site.__cadre;
}

// ------------------------------------------------------------
// Bibliothèque
// ------------------------------------------------------------

let _cache;   // undefined = pas encore tenté, null = absente

function charger() {
  if (_cache !== undefined) return _cache;
  try {
    const brut = zlib.gunzipSync(fs.readFileSync(FICHIER));
    const doc = JSON.parse(brut.toString('utf8'));
    _cache = Array.isArray(doc.sites) && doc.sites.length ? doc : null;
  } catch (_) {
    // Absente ou illisible : on continue sans contours plutôt que d'échouer la
    // conversion. Les zones concernées resteront des points.
    _cache = null;
  }
  return _cache;
}

function etat() {
  const doc = charger();
  return doc ? { present: true, meta: doc.meta || null } : { present: false };
}

// Le contour d'un site nommé `nom`, dont le SIA situe le repère en (lat, lon).
// Renvoie { poly, nomSource, genre, distanceM, concordance } ou null.
function chercher(nom, lat, lon) {
  const doc = charger();
  if (!doc || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  // Un degré de latitude ≈ 111 km : 8 km tiennent dans 0,08°, arrondi à 0,2°
  // pour le pré-tri (le cadre englobe, il ne mesure pas).
  const marge = 0.2;
  let meilleur = null;

  for (const site of doc.sites) {
    const s = concordance(nom, site.nom);
    if (s < SEUIL) continue;
    const c = cadre(site);
    if (lon < c.o - marge || lon > c.e + marge || lat < c.s - marge || lat > c.n + marge) continue;
    const d = distanceAuSite(site, lat, lon);
    if (d > RAYON_M) continue;
    if (!meilleur || s > meilleur.concordance || (s === meilleur.concordance && d < meilleur.distanceM)) {
      meilleur = { poly: site.poly, nomSource: site.nom, genre: site.genre, distanceM: d, concordance: s };
    }
  }
  return meilleur;
}

module.exports = { chercher, etat, SEUIL, RAYON_M };
