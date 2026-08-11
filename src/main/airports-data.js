/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// airports-data.js — lecture des bases MSFS extraites (airports-msfs.jsonl /
// navaids.jsonl) et requêtes par bounding box pour la carte.
//
// Logique reprise de NavXpressVFR (même filtrage de types, même choix de la
// piste principale, même test d'appartenance à la bbox avec antiméridien).
// Chargement paresseux + cache, invalidé par reload() après un import.
// ============================================================

const fs = require('fs');
const path = require('path');
const { dossierBase } = require('./config');

const TYPES_OK = new Set(['large_airport', 'medium_airport', 'small_airport', 'heliport', 'seaplane_base']);
const NAVAID_TYPES = new Set(['VOR', 'VOR-DME', 'VORTAC', 'TACAN', 'NDB', 'NDB-DME', 'DME']);

let _airports = null;   // [{ident, code, name, lat, lon, type, runway}]
let _navaids = null;    // [{id, ident, name, type, lat, lon, freqKhz, rangeNm}]

function dataDir() { return path.join(dossierBase(), 'data'); }

// Lit un fichier .jsonl ligne par ligne (ignore l'en-tête __meta et le vide).
function* lireJsonl(p) {
  let brut;
  try { brut = fs.readFileSync(p, 'utf-8'); } catch (_) { return; }
  for (const ligne of brut.split('\n')) {
    const s = ligne.trim();
    if (!s) continue;
    let obj;
    try { obj = JSON.parse(s); } catch (_) { continue; }
    if (obj && obj.__meta) continue;
    yield obj;
  }
}

// Piste principale = la plus longue dotée d'un cap (comme NavXpress).
function pistePrincipale(runways) {
  if (!Array.isArray(runways) || runways.length === 0) return null;
  let best = null;
  for (const r of runways) {
    if (r.closed) continue;
    if (r.headingDegT === null || r.headingDegT === undefined) continue;
    if (!best || (r.length_ft || 0) > (best.length_ft || 0)) best = r;
  }
  return best;
}

function chargerAeroports() {
  if (_airports) return _airports;
  const list = [];
  for (const a of lireJsonl(path.join(dataDir(), 'airports-msfs.jsonl'))) {
    if (!TYPES_OK.has(a.type)) continue;
    const lat = parseFloat(a.latitude_deg);
    const lon = parseFloat(a.longitude_deg);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    // POI MSFS (stades, ponts…) exposés en « airport » sans piste ni hélipad → exclus.
    const rws = Array.isArray(a.runways) ? a.runways : [];
    const nbHelipads = Array.isArray(a.helipads) ? a.helipads.length : 0;
    if (rws.length === 0 && nbHelipads === 0) continue;

    const runway = pistePrincipale(rws);
    const code = (a.icao_code && String(a.icao_code).trim())
      || (a.gps_code && String(a.gps_code).trim())
      || (a.local_code && String(a.local_code).trim())
      || a.ident || '';

    const elev = parseFloat(a.elevation_ft);
    list.push({
      ident: a.ident,
      code,
      name: a.name || a.ident,
      lat, lon,
      type: a.type,
      elevation_ft: Number.isFinite(elev) ? Math.round(elev) : null,
      runway: runway ? {
        name: runway.le_ident + (runway.he_ident ? '/' + runway.he_ident : ''),
        headingDegT: runway.headingDegT,
        length_ft: runway.length_ft,
        surface: runway.surface || '',
      } : null,
    });
  }
  _airports = list;
  return _airports;
}

function chargerNavaids() {
  if (_navaids) return _navaids;
  const list = [];
  for (const n of lireJsonl(path.join(dataDir(), 'navaids.jsonl'))) {
    if (!NAVAID_TYPES.has(n.type)) continue;
    const lat = parseFloat(n.latitude_deg);
    const lon = parseFloat(n.longitude_deg);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    const rng = parseFloat(n.range_nm);
    list.push({
      id: n.id,
      ident: n.ident,
      name: n.name || n.ident,
      type: n.type,
      lat, lon,
      freqKhz: parseFloat(n.frequency_khz) || 0,
      rangeNm: Number.isFinite(rng) ? rng : null,
    });
  }
  _navaids = list;
  return _navaids;
}

// Appartenance d'une longitude à la plage [west, east] (gère l'antiméridien et
// le défilement infini de Leaflet : west peut être > east).
function lonDansPlage(lon, west, east) {
  let width = east - west;
  if (width < 0) width += 360;
  if (width >= 360) return true;
  const delta = (((lon - west) % 360) + 360) % 360;
  return delta <= width;
}

function dansBbox(item, bbox) {
  if (item.lat < bbox.south || item.lat > bbox.north) return false;
  return lonDansPlage(item.lon, bbox.west, bbox.east);
}

function aeroportsDansBbox(bbox) {
  if (!bbox) return { ok: false, reason: 'no-bbox' };
  const all = chargerAeroports();
  if (!all.length) return { ok: false, reason: 'no-data' };
  return { ok: true, airports: all.filter((a) => dansBbox(a, bbox)) };
}

function navaidsDansBbox(bbox) {
  if (!bbox) return { ok: false, reason: 'no-bbox' };
  const all = chargerNavaids();
  if (!all.length) return { ok: false, reason: 'no-data' };
  return { ok: true, navaids: all.filter((n) => dansBbox(n, bbox)) };
}

// Recherche un aéroport par code (ICAO/GPS/local) ou ident, insensible à la casse.
// Utilisé pour tracer la route départ → arrivée à partir des champs ICAO.
function aeroportParCode(code) {
  const c = String(code == null ? '' : code).trim().toUpperCase();
  if (!c) return { ok: false, reason: 'no-code' };
  const all = chargerAeroports();
  if (!all.length) return { ok: false, reason: 'no-data' };
  const a = all.find((x) => String(x.code || '').toUpperCase() === c)
         || all.find((x) => String(x.ident || '').toUpperCase() === c);
  if (!a) return { ok: false, reason: 'not-found' };
  // elevation_ft : altitude du terrain, que l'export GTN750 porte dans le PLN.
  return { ok: true, airport: { code: a.code, ident: a.ident, name: a.name, lat: a.lat, lon: a.lon, type: a.type, elevation_ft: a.elevation_ft } };
}

// ------------------------------------------------------------
// Recherche par code OACI ou par nom
// ------------------------------------------------------------
//
// ── Périmètre : la France, et rien d'autre ──────────────────────────────────
// Les bases MSFS sont mondiales — 85 680 aérodromes, 7 583 navaids. Chercher
// « TOURS » dedans ramène des terrains de quatre continents, et la liste devient
// inutilisable. Deux règles, une par base, parce que les deux bases ne portent
// pas la même information :
//
//   • AÉRODROMES : code commençant par LF. Vérifié sur la base en service —
//     1 845 retenus, et AUCUN aérodrome dont MSFS déclare la région française
//     n'y échappe. (Le champ iso_region, lui, n'en désignerait que 429 : il est
//     vide sur la plus grande partie de l'export.)
//
//   • NAVAIDS : appartenance à l'emprise de la métropole et de la Corse. Leur
//     indicatif est un trigramme qui ne porte aucun pays (MTL, DJL…), donc la
//     règle « LF » ne s'y applique pas. iso_region, testé, ne convient pas non
//     plus : il retient trois stations hors de France (Colorado, Miquelon,
//     Brésil) et en manque six qui y sont, mal étiquetées. La position, elle,
//     ne se trompe pas. Contrepartie assumée : l'emprise inclut les stations
//     frontalières voisines (allemandes, espagnoles, belges, suisses,
//     italiennes) — utiles au flanquement le long d'une frontière.
const FRANCE_METRO = { sud: 41.2, nord: 51.2, ouest: -5.3, est: 9.7 };

function enFranceMetro(item) {
  return item.lat >= FRANCE_METRO.sud && item.lat <= FRANCE_METRO.nord
      && item.lon >= FRANCE_METRO.ouest && item.lon <= FRANCE_METRO.est;
}

// Repli des diacritiques et de la casse : « Aérodrome » se trouve en tapant
// « aerodrome ». Personne ne saisit les accents dans un champ de recherche.
function plier(s) {
  // La classe \p{M} couvre les marques combinantes que NFD vient de détacher.
  // Nommée plutôt qu'écrite en plage : des combinantes littérales dans le
  // source seraient invisibles à la relecture.
  return String(s == null ? '' : s).normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
}

const RECHERCHE_MAX = 60;      // résultats renvoyés au plus
const RECHERCHE_MIN_CAR = 2;   // en deçà, tout correspond : on ne cherche pas

// Index de recherche : codes et noms repliés UNE FOIS. Replier à chaque frappe
// coûterait deux normalize() par enregistrement — six chiffres d'appels pour un
// caractère tapé. Construit paresseusement, invalidé par reload() comme les
// caches de base.
let _index = null;

function chargerIndex() {
  if (_index) return _index;
  const idx = [];
  for (const a of chargerAeroports()) {
    if (!String(a.code || '').toUpperCase().startsWith('LF')) continue;
    idx.push({
      codes: [plier(a.code), plier(a.ident)],
      nom: plier(a.name),
      lieu: {
        genre: 'airport', code: a.code || a.ident, ident: a.ident, name: a.name,
        lat: a.lat, lon: a.lon, type: a.type, elevation_ft: a.elevation_ft, runway: a.runway,
      },
    });
  }
  for (const n of chargerNavaids()) {
    if (!enFranceMetro(n)) continue;
    idx.push({
      codes: [plier(n.ident)],
      nom: plier(n.name),
      lieu: {
        genre: 'navaid', code: n.ident, ident: n.ident, name: n.name,
        lat: n.lat, lon: n.lon, type: n.type, freqKhz: n.freqKhz, rangeNm: n.rangeNm,
      },
    });
  }
  _index = idx;
  return _index;
}

// Rang d'une correspondance, du plus au moins pertinent. Le code exact passe
// devant tout : qui tape « LFMD » veut Cannes, pas les terrains dont le nom
// contient ces quatre lettres par accident.
//   0 code exact · 1 code commençant par · 2 nom commençant par · 3 nom contenant
function rangCorrespondance(q, codes, nom) {
  for (const c of codes) if (c === q) return 0;
  for (const c of codes) if (c.startsWith(q)) return 1;
  if (nom.startsWith(q)) return 2;
  if (nom.includes(q)) return 3;
  return -1;
}

function rechercherLieux(requete, limite) {
  const q = plier(requete).trim();
  if (q.length < RECHERCHE_MIN_CAR) return { ok: false, reason: 'too-short' };
  const idx = chargerIndex();
  if (!idx.length) return { ok: false, reason: 'no-data' };

  const trouves = [];
  for (const e of idx) {
    const rang = rangCorrespondance(q, e.codes, e.nom);
    if (rang >= 0) trouves.push({ rang, lieu: e.lieu });
  }
  // À rang égal, l'ordre alphabétique — pas celui du fichier d'import, qui n'a
  // aucun sens pour qui lit la liste.
  trouves.sort((x, y) => x.rang - y.rang || x.lieu.name.localeCompare(y.lieu.name, 'fr'));

  const max = Number.isFinite(limite) && limite > 0 ? limite : RECHERCHE_MAX;
  return {
    ok: true,
    total: trouves.length,
    tronque: trouves.length > max,
    lieux: trouves.slice(0, max).map((t) => t.lieu),
  };
}

// Distance grand cercle (NM) entre deux points.
function distNmEntre(lat1, lon1, lat2, lon2) {
  const R = 3440.065;
  const f1 = lat1 * Math.PI / 180, f2 = lat2 * Math.PI / 180;
  const df = (lat2 - lat1) * Math.PI / 180, dl = (lon2 - lon1) * Math.PI / 180;
  const h = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Cherche le feature (aéroport OU navaid) le plus proche d'un point, dans un
// rayon donné (NM). Sert à proposer d'aimanter un point tournant. Pré-filtre par
// latitude (gate large) pour éviter le haversine sur toute la base.
function featureProche(lat, lon, rayonNm) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return { ok: false };
  const r = Number.isFinite(rayonNm) ? rayonNm : 0.2;
  let best = null;
  const examiner = (item, kind, code, type) => {
    if (Math.abs(item.lat - lat) > 0.05) return;   // ~3 NM : gate grossier
    const d = distNmEntre(lat, lon, item.lat, item.lon);
    if (d <= r && (!best || d < best.distNm)) {
      best = { kind, code: code || '', name: item.name, lat: item.lat, lon: item.lon, type: type || '', distNm: d };
    }
  };
  for (const a of chargerAeroports()) examiner(a, 'airport', a.code || a.ident, a.type);
  for (const n of chargerNavaids()) examiner(n, 'navaid', n.ident, n.type);
  return best ? { ok: true, found: true, feature: best } : { ok: true, found: false };
}

// Invalide les caches (après un import) → rechargés à la prochaine requête.
// _index en fait partie : il est bâti SUR ces caches, le laisser survivre à un
// import ferait chercher dans l'ancienne base.
function reload() { _airports = null; _navaids = null; _index = null; }

module.exports = { aeroportsDansBbox, navaidsDansBbox, aeroportParCode, rechercherLieux, featureProche, reload };
