/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// outils/maj-contours.js — régénère la bibliothèque de contours des espaces
// protégés (parcs nationaux, réserves naturelles).
// ============================================================
//
//   npm run contours:maj
//
// Écrit src/main/bundled-data/contours-proteges.json.gz.
//
// ── Pourquoi cette bibliothèque existe ──────────────────────────────────────
// L'export du SIA connaît 94 zones PRN en métropole (parcs et réserves à
// hauteur minimale de survol imposée), mais n'en donne le contour que pour 7 :
// les autres n'ont qu'UN point dans <Geometrie>, sans rayon. sia-convert.js les
// écartait donc, et cocher « Parcs et survol » sur la carte n'allumait presque
// rien.
//
// Ce fichier apporte les contours qui manquent. Il n'apporte QUE des contours :
// aucune hauteur, aucune obligation, aucune classe. La règle aéronautique reste
// celle du SIA, cycle par cycle ; on ne fait que lui donner une surface.
//
// ── Pourquoi l'IGN et non l'INPN ────────────────────────────────────────────
// L'INPN (inpn.mnhn.fr/docs/Shape/*.zip) est la source d'origine de ces
// périmètres, mais son pare-feu applicatif renvoie une page 403 à toute requête
// non-navigateur : impossible d'en faire un outil qu'on puisse relancer et
// tester. La BD TOPO de l'IGN publie les mêmes périmètres sur la Géoplateforme,
// en WFS, déjà en WGS84 — et son champ nature_detaillee distingue la ZONE CŒUR
// d'un parc national de son AIRE D'ADHÉSION, ce qui est exactement la
// distinction qui compte : l'interdiction de survol porte sur le cœur.
//
// Données © IGN — BD TOPO®, Licence Ouverte 2.0 (la même que l'export du SIA).
//
// ── Ce qu'on retient, et pourquoi si peu ────────────────────────────────────
// La couche parc_ou_reserve contient 6 945 objets, dont des PNR, des sites
// Natura 2000, des terrains de conservatoire et des réserves de biosphère.
// AUCUN de ceux-là ne porte de hauteur minimale de survol, et ils sont bien
// plus étendus que les zones qui en portent une : retenir un PNR pour un
// « parc » du SIA dessinerait une interdiction dix fois trop grande. On ne
// garde donc que les natures qui peuvent en porter une.
// ============================================================

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const WFS = 'https://data.geopf.fr/wfs/ows';
const COUCHE = 'BDTOPO_V3:parc_ou_reserve';
const PAGE = 1000;
const SORTIE = path.join(__dirname, '..', 'src', 'main', 'bundled-data', 'contours-proteges.json.gz');

// nature → natures détaillées retenues.
const RETENUES = {
  'Parc national': new Set(['Zone cœur', 'Réserve intégrale']),
  'Réserve naturelle': new Set([
    'Réserve naturelle nationale',
    'Réserve naturelle régionale',
    'Réserve naturelle de Corse',
  ]),
};

// Tolérance de simplification. 40 m est très en dessous de ce qu'on peut lire
// sur une carte de navigation, et divise le poids du fichier par cinq.
const TOLERANCE_M = 40;
const DECIMALES = 5;   // ≈ 1 m

async function page(startIndex) {
  const url = `${WFS}?SERVICE=WFS&VERSION=2.0.0&REQUEST=GetFeature`
    + `&TYPENAMES=${encodeURIComponent(COUCHE)}`
    + `&COUNT=${PAGE}&STARTINDEX=${startIndex}`
    + '&OUTPUTFORMAT=application/json&SRSNAME=EPSG:4326';
  const r = await fetch(url);
  if (!r.ok) throw new Error(`WFS : HTTP ${r.status} (startIndex ${startIndex})`);
  const j = await r.json();
  if (!j || !Array.isArray(j.features)) throw new Error('réponse WFS sans features');
  return j;
}

// ------------------------------------------------------------
// Simplification
// ------------------------------------------------------------

// Douglas-Peucker sur un anneau. Les longitudes sont mises à l'échelle des
// latitudes avant mesure, sinon la tolérance vaudrait 40 m en nord-sud et 27 m
// en est-ouest à 47° — la simplification serait anisotrope.
function simplifier(anneau, toleranceDeg, k) {
  if (anneau.length <= 4) return anneau;

  const garde = new Uint8Array(anneau.length);
  garde[0] = garde[anneau.length - 1] = 1;
  const pile = [[0, anneau.length - 1]];

  while (pile.length) {
    const [i0, i1] = pile.pop();
    if (i1 <= i0 + 1) continue;
    const [x0, y0] = anneau[i0], [x1, y1] = anneau[i1];
    const dx = (x1 - x0) * k, dy = y1 - y0;
    const l2 = dx * dx + dy * dy;

    let pire = -1, pireD = 0;
    for (let i = i0 + 1; i < i1; i++) {
      const ax = (anneau[i][0] - x0) * k, ay = anneau[i][1] - y0;
      let d;
      if (l2 === 0) {
        d = Math.hypot(ax, ay);
      } else {
        let t = (ax * dx + ay * dy) / l2;
        t = Math.max(0, Math.min(1, t));
        d = Math.hypot(ax - t * dx, ay - t * dy);
      }
      if (d > pireD) { pireD = d; pire = i; }
    }
    if (pireD > toleranceDeg) {
      garde[pire] = 1;
      pile.push([i0, pire], [pire, i1]);
    }
  }

  const out = [];
  for (let i = 0; i < anneau.length; i++) if (garde[i]) out.push(anneau[i]);
  // Un anneau simplifié à moins de quatre sommets n'enferme plus rien.
  return out.length >= 4 ? out : anneau;
}

function arrondir(anneau) {
  return anneau.map(([lon, lat]) => [
    +lon.toFixed(DECIMALES),
    +lat.toFixed(DECIMALES),
  ]);
}

// Renvoie [[anneau, trou…], …] simplifié, ou null si plus rien de traçable.
function polygones(geom) {
  const bruts = geom.type === 'MultiPolygon' ? geom.coordinates
    : geom.type === 'Polygon' ? [geom.coordinates] : [];
  const out = [];
  for (const poly of bruts) {
    const anneaux = [];
    for (const anneau of poly) {
      if (!Array.isArray(anneau) || anneau.length < 4) continue;
      const lat = anneau[0][1];
      const k = Math.cos((lat * Math.PI) / 180);
      const tol = TOLERANCE_M / 110540;   // degrés de latitude
      anneaux.push(arrondir(simplifier(anneau, tol, k)));
    }
    if (anneaux.length) out.push(anneaux);
  }
  return out.length ? out : null;
}

// ------------------------------------------------------------

(async () => {
  console.log(`Téléchargement de ${COUCHE} depuis la Géoplateforme…`);

  const sites = [];
  let lus = 0, total = null, sansNom = 0, sansGeom = 0;

  for (let i = 0; ; i += PAGE) {
    const j = await page(i);
    if (total == null) total = j.totalFeatures != null ? j.totalFeatures : j.numberMatched;
    lus += j.features.length;
    process.stdout.write(`\r  ${lus}${total ? ' / ' + total : ''} objets lus`);

    for (const ft of j.features) {
      const p = ft.properties || {};
      const ok = RETENUES[p.nature];
      if (!ok || !ok.has(p.nature_detaillee)) continue;
      if (!p.toponyme) { sansNom += 1; continue; }
      const g = polygones(ft.geometry);
      if (!g) { sansGeom += 1; continue; }
      sites.push({ nom: p.toponyme.trim(), genre: p.nature_detaillee, poly: g });
    }

    if (j.features.length < PAGE) break;
  }
  process.stdout.write('\n');

  if (!sites.length) throw new Error('aucun site retenu : la couche ou ses natures ont changé');
  sites.sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));

  const parGenre = {};
  for (const s of sites) parGenre[s.genre] = (parGenre[s.genre] || 0) + 1;

  const doc = {
    meta: {
      source: 'IGN — BD TOPO®, couche parc_ou_reserve, Licence Ouverte 2.0',
      service: WFS,
      couche: COUCHE,
      recolte: new Date().toISOString(),
      sites: sites.length,
      parGenre,
      toleranceM: TOLERANCE_M,
    },
    sites,
  };

  fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
  fs.writeFileSync(SORTIE, zlib.gzipSync(Buffer.from(JSON.stringify(doc), 'utf8'), { level: 9 }));

  console.log(`${sites.length} sites retenus sur ${lus} objets`);
  for (const [g, n] of Object.entries(parGenre).sort()) console.log(`  ${n.toString().padStart(4)}  ${g}`);
  if (sansNom) console.log(`  (${sansNom} écartés : sans toponyme)`);
  if (sansGeom) console.log(`  (${sansGeom} écartés : sans géométrie exploitable)`);
  console.log(`${SORTIE} — ${(fs.statSync(SORTIE).size / 1024).toFixed(0)} Ko compressés`);
})().catch((e) => {
  console.error(`Échec : ${e.message}`);
  process.exit(1);
});
