/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// sia-data.js — lecture du GeoJSON des espaces aériens converti.
//
// Contrairement aux bases MSFS (des dizaines de milliers d'aéroports, servies
// par bounding box), les espaces français tiennent en ~2 200 zones et 3,5 Mo :
// on les envoie EN UNE FOIS au renderer, qui les garde.
//
// Ce n'est pas de la paresse, c'est la condition du reste : savoir dans quelles
// zones se trouve un point — et surtout où l'avion sera dans 90 secondes —
// suppose d'interroger toute la géométrie à chaque image. Un aller-retour IPC
// par interrogation rendrait l'anticipation impossible.
//
// Chargement paresseux, cache invalidé par reload() après une conversion.
// ============================================================

const fs = require('fs');

const { cheminSortie, cheminPointsVfr, cheminObstacles } = require('./sia-convert');

let _cache = null;   // { meta, features } | null si absent
let _cacheVfr = null;
let _cacheObstacles = null;

function charger() {
  if (_cache) return _cache;
  try {
    _cache = JSON.parse(fs.readFileSync(cheminSortie(), 'utf-8'));
  } catch (_) {
    _cache = null;   // pas encore converti : état légitime au premier lancement
  }
  return _cache;
}

// Les points de report VFR, dans leur propre fichier. Un export converti avant
// que cette fonctionnalité existe n'en a pas : absence légitime, pas une erreur.
function chargerPointsVfr() {
  if (_cacheVfr) return _cacheVfr;
  try {
    _cacheVfr = JSON.parse(fs.readFileSync(cheminPointsVfr(), 'utf-8'));
  } catch (_) {
    _cacheVfr = null;
  }
  return _cacheVfr;
}

// Obstacles et feux aéronautiques. Même absence légitime qu'au-dessus pour un
// export converti avant que la fonctionnalité existe.
function chargerObstacles() {
  if (_cacheObstacles) return _cacheObstacles;
  try {
    _cacheObstacles = JSON.parse(fs.readFileSync(cheminObstacles(), 'utf-8'));
  } catch (_) {
    _cacheObstacles = null;
  }
  return _cacheObstacles;
}

function reload() {
  _cache = null; _cacheVfr = null; _cacheObstacles = null;
  return charger();
}

// Y a-t-il des espaces disponibles, et de quel cycle ?
function etat() {
  const g = charger();
  if (!g || !Array.isArray(g.features)) return { present: false };
  return { present: true, meta: g.meta || null };
}

// La collection entière, ou null si rien n'a encore été converti.
function espaces() {
  const g = charger();
  return g && Array.isArray(g.features) ? g : null;
}

// Les points de report VFR (~1 100 repères, 200 Ko) : envoyés en une fois comme
// les espaces. Le filtrage par cadre se fait côté carte, à chaque déplacement —
// un aller-retour IPC par mouvement de souris coûterait plus que la collection.
function pointsVfr() {
  const g = chargerPointsVfr();
  return g && Array.isArray(g.features) ? g : null;
}

// Les obstacles et les feux aéronautiques (13 500 repères, 3,4 Mo). Envoyés en
// une fois eux aussi : le profil vertical doit pouvoir les interroger le long
// de la route à chaque redessin, et un aller-retour IPC par point l'en
// empêcherait — même raison que pour les espaces.
function obstacles() {
  const g = chargerObstacles();
  return g && Array.isArray(g.features) ? g : null;
}

// ------------------------------------------------------------
// Aimantation
// ------------------------------------------------------------

// Distance grand cercle en milles nautiques. Recopiée ici plutôt qu'importée
// d'airports-data.js : ce module lit le SIA, l'autre lit les bases MSFS, et les
// faire dépendre l'un de l'autre pour six lignes de trigonométrie coûterait
// plus que la répétition.
function distNmEntre(lat1, lon1, lat2, lon2) {
  const R = 3440.065;
  const f1 = (lat1 * Math.PI) / 180, f2 = (lat2 * Math.PI) / 180;
  const df = ((lat2 - lat1) * Math.PI) / 180, dl = ((lon2 - lon1) * Math.PI) / 180;
  const h = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Le point de report VFR le plus proche, dans un rayon donné (NM). Même forme
// de retour que featureProche() côté MSFS : c'est main.js qui départage.
//
// Le NOM porte l'identifiant ET le repère au sol — « MM-CV — Cavaillon (Pont
// TGV sur la Durance) ». C'est ce que la modale d'aimantation montre, et un
// pilote reconnaît le pont bien avant le code.
function pointVfrProche(lat, lon, rayonNm) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const g = chargerPointsVfr();
  if (!g || !Array.isArray(g.features)) return null;
  const r = Number.isFinite(rayonNm) ? rayonNm : 0.2;

  let best = null;
  for (const f of g.features) {
    const [flon, flat] = f.geometry.coordinates;
    if (Math.abs(flat - lat) > 0.05) continue;   // ~3 NM : pré-filtre grossier
    const d = distNmEntre(lat, lon, flat, flon);
    if (d > r || (best && d >= best.distNm)) continue;
    const p = f.properties;
    best = {
      kind: 'vfr',
      code: p.ident,
      name: p.description ? `${p.ident} — ${p.description}` : p.ident,
      lat: flat,
      lon: flon,
      type: 'VFR',
      distNm: d,
    };
  }
  return best;
}

module.exports = { espaces, pointsVfr, obstacles, pointVfrProche, etat, reload };
