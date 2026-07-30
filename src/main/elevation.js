/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// elevation.js — relief GLOBE : import du jeu de données, lecture, et profil
// vertical le long du plan de vol.
//
// Jeu de données GLOBE (NOAA, 30 arc-sec ≈ 1 km) : 16 tuiles a10g..p10g pavant
// le globe, entiers 16 bits signés little-endian en mètres, depuis le coin
// nord-ouest de chaque tuile. Océan et absence de donnée valent -500.
//
// Repris de NavXpressVFR puis de Backcountry Pathfinders, sans changement de
// fond : seul l'emplacement des fichiers suit désormais config.js.
// ============================================================

const fs = require('fs');
const path = require('path');
const https = require('https');
const extract = require('extract-zip');

const { dossierBase } = require('./config');

const ZIP_URL = 'https://www.ngdc.noaa.gov/mgg/topo/DATATILES/elev/all10g.zip';

function dossierElevation() { return path.join(dossierBase(), 'elevation'); }

// ------------------------------------------------------------
// Import
// ------------------------------------------------------------

// Téléchargement HTTPS vers un fichier, avec suivi des redirections et
// progression. Le timeout porte sur l'absence de données, pas sur la durée
// totale : l'archive fait plus de 200 Mo.
function telechargerVersFichier(url, destination, onProgress, redirectionsMax = 5) {
  return new Promise((resolve, reject) => {
    const get = (courante, restantes) => {
      const req = https.get(courante, { headers: { 'User-Agent': 'CapCAVVA' } }, (res) => {
        const { statusCode, headers } = res;
        if (statusCode >= 300 && statusCode < 400 && headers.location) {
          if (restantes <= 0) { res.resume(); reject(new Error('Trop de redirections pour ' + url)); return; }
          res.resume();
          get(new URL(headers.location, courante).toString(), restantes - 1);
          return;
        }
        if (statusCode !== 200) { res.resume(); reject(new Error('HTTP ' + statusCode + ' pour ' + courante)); return; }

        const total = parseInt(headers['content-length'] || '0', 10);
        let recu = 0;
        const out = fs.createWriteStream(destination);
        res.on('data', (bloc) => { recu += bloc.length; if (onProgress) onProgress(recu, total); });
        res.on('error', (e) => { out.destroy(); reject(e); });
        out.on('error', reject);
        out.on('finish', () => out.close(() => resolve({ recu, total })));
        res.pipe(out);
      });
      req.on('error', reject);
      req.setTimeout(90000, () => req.destroy(new Error('Timeout (90 s sans données) pour ' + courante)));
    };
    get(url, redirectionsMax);
  });
}

// Les trois tuiles témoins (bande nord, bande médiane, bande sud) sont-elles là ?
function tuilesPresentes() {
  const dir = dossierElevation();
  try {
    return ['a10g', 'g10g', 'p10g'].every((t) => fs.existsSync(path.join(dir, t)));
  } catch (_) {
    return false;
  }
}

let _importEnCours = false;

// Télécharge l'archive, l'extrait, aplatit le sous-dossier all10/ et supprime
// l'archive. `envoyer` reçoit les étapes ({type: 'start'|'download'|…}).
async function importer(envoyer = () => {}) {
  if (_importEnCours) return { ok: false, error: 'Un import est déjà en cours.' };
  _importEnCours = true;

  const dir = dossierElevation();
  const zip = path.join(dir, 'all10g.zip');

  try {
    fs.mkdirSync(dir, { recursive: true });
    fermerDescripteurs();   // libère d'éventuels descripteurs ouverts (réimport)
    envoyer({ type: 'start' });

    // 1) Téléchargement — progression limitée à ~4 messages par seconde.
    let dernier = 0;
    await telechargerVersFichier(ZIP_URL, zip, (recu, total) => {
      const now = Date.now();
      if (now - dernier >= 250 || (total && recu >= total)) {
        dernier = now;
        envoyer({ type: 'download', received: recu, total });
      }
    });

    // 2) Extraction
    envoyer({ type: 'extract' });
    await extract(zip, { dir });

    // 3) Aplatissement : elevation/all10/* → elevation/
    envoyer({ type: 'flatten' });
    const all10 = path.join(dir, 'all10');
    if (fs.existsSync(all10)) {
      for (const nom of fs.readdirSync(all10)) {
        const src = path.join(all10, nom);
        const dst = path.join(dir, nom);
        try { if (fs.existsSync(dst)) fs.rmSync(dst, { force: true }); } catch (_) {}
        fs.renameSync(src, dst);
      }
      try { fs.rmSync(all10, { recursive: true, force: true }); } catch (_) {}
    }

    // 4) Nettoyage
    try { fs.rmSync(zip, { force: true }); } catch (_) {}

    const ok = tuilesPresentes();
    envoyer({ type: 'done', dir, ok });
    return { ok, dir };
  } catch (err) {
    console.error('[Elevation] Import échec :', err);
    try { if (fs.existsSync(zip)) fs.rmSync(zip, { force: true }); } catch (_) {}
    envoyer({ type: 'error', error: (err && err.message) || String(err) });
    return { ok: false, error: (err && err.message) || String(err) };
  } finally {
    _importEnCours = false;
  }
}

// ------------------------------------------------------------
// Lecture du relief
// ------------------------------------------------------------

const COLONNES = 10800;      // colonnes par tuile (90° à 30 arc-sec)
const CELLULE = 1 / 120;     // degrés par cellule
const BANDES = [
  { latMax: 90,  lignes: 4800, tuiles: ['a10g', 'b10g', 'c10g', 'd10g'] }, // 50°N..90°N
  { latMax: 50,  lignes: 6000, tuiles: ['e10g', 'f10g', 'g10g', 'h10g'] }, // 0°..50°N
  { latMax: 0,   lignes: 6000, tuiles: ['i10g', 'j10g', 'k10g', 'l10g'] }, // 50°S..0°
  { latMax: -50, lignes: 4800, tuiles: ['m10g', 'n10g', 'o10g', 'p10g'] }, // 90°S..50°S
];

const _descripteurs = new Map();   // nom de tuile → descripteur (null si absente)
const _tampon = Buffer.alloc(2);

function _descripteur(tuile) {
  if (_descripteurs.has(tuile)) return _descripteurs.get(tuile);
  let fd = null;
  try { fd = fs.openSync(path.join(dossierElevation(), tuile), 'r'); } catch (_) { fd = null; }
  _descripteurs.set(tuile, fd);
  return fd;
}

// Ferme et oublie les descripteurs ouverts (avant un réimport).
function fermerDescripteurs() {
  for (const fd of _descripteurs.values()) {
    if (fd != null) { try { fs.closeSync(fd); } catch (_) {} }
  }
  _descripteurs.clear();
}

// Élévation en mètres à (lat, lon). null si la tuile est absente, 0 pour
// l'océan et l'absence de donnée.
function lire(lat, lon) {
  if (!isFinite(lat) || !isFinite(lon)) return 0;
  const la = Math.max(-90, Math.min(90, lat));
  const lo = ((lon + 180) % 360 + 360) % 360 - 180;

  let b;
  if (la >= 50) b = 0; else if (la >= 0) b = 1; else if (la >= -50) b = 2; else b = 3;
  const bande = BANDES[b];

  let g = Math.floor((lo + 180) / 90);
  if (g < 0) g = 0; else if (g > 3) g = 3;
  const fd = _descripteur(bande.tuiles[g]);
  if (fd == null) return null;

  let ligne = Math.floor((bande.latMax - la) / CELLULE);
  if (ligne < 0) ligne = 0; else if (ligne >= bande.lignes) ligne = bande.lignes - 1;
  let colonne = Math.floor((lo - (-180 + g * 90)) / CELLULE);
  if (colonne < 0) colonne = 0; else if (colonne >= COLONNES) colonne = COLONNES - 1;

  try { fs.readSync(fd, _tampon, 0, 2, (ligne * COLONNES + colonne) * 2); } catch (_) { return null; }
  const v = _tampon.readInt16LE(0);
  return v <= -500 ? 0 : v;
}

// ------------------------------------------------------------
// Profil vertical
// ------------------------------------------------------------

const M2FT = 3.28084;
const ALT_DEFAUT = 2500;             // altitude supposée d'un leg sans altitude saisie
const MARGE_PLAINE_FT = 1000;
const MARGE_MONTAGNE_FT = 1500;
const AMPLITUDE_MONTAGNE_FT = 1500;  // au-delà, le leg est traité comme montagneux
const ECHANTILLONS_MAX = 1500;

function distanceNM(aLat, aLon, bLat, bLon) {
  const R = 3440.065, rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad, dLon = (bLon - aLon) * rad;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

// Échantillonne le relief le long du plan de vol.
// charge = { waypoints: [{lat,lon,name}], legAltitudes: [null, alt1, alt2, …] }
function profil(charge) {
  const wps = Array.isArray(charge && charge.waypoints) ? charge.waypoints : [];
  const legAlt = Array.isArray(charge && charge.legAltitudes) ? charge.legAltitudes : [];
  if (wps.length < 2) return { ok: false, dist: [], terrain: [], planned: [], waypoints: [] };

  const distLeg = [];
  let totalNM = 0;
  for (let i = 1; i < wps.length; i++) {
    const d = distanceNM(wps[i - 1].lat, wps[i - 1].lon, wps[i].lat, wps[i].lon);
    distLeg[i] = d;
    totalNM += d;
  }

  const totalKm = totalNM * 1.852;
  let pasKm = 1.0;
  if (totalKm / pasKm > ECHANTILLONS_MAX) pasKm = totalKm / ECHANTILLONS_MAX;

  const dist = [], terrain = [], planned = [], waypoints = [], legs = [];
  let cumNM = 0, donnee = false, sommetFt = -Infinity, sommetD = 0;
  waypoints.push({ d: 0, name: (wps[0].name || '') });

  for (let i = 1; i < wps.length; i++) {
    const a = wps[i - 1], b = wps[i];
    const legNM = distLeg[i];
    const altFt = (legAlt[i] != null ? legAlt[i] : ALT_DEFAUT);
    const nSeg = Math.max(1, Math.round((legNM * 1.852) / pasKm));
    let maxLeg = -Infinity, minLeg = Infinity;

    for (let s = (i === 1 ? 0 : 1); s <= nSeg; s++) {
      const f = s / nSeg;
      const lat = a.lat + (b.lat - a.lat) * f;
      const lon = a.lon + (b.lon - a.lon) * f;
      const brut = lire(lat, lon);
      if (brut != null) donnee = true;
      const terrFt = (brut == null ? 0 : brut) * M2FT;
      const d = cumNM + legNM * f;
      dist.push(d); terrain.push(terrFt); planned.push(altFt);
      if (terrFt > maxLeg) maxLeg = terrFt;
      if (terrFt < minLeg) minLeg = terrFt;
      if (terrFt > sommetFt) { sommetFt = terrFt; sommetD = d; }
    }

    const terrMaxFt = (maxLeg === -Infinity ? 0 : maxLeg);
    const amplitudeFt = (maxLeg === -Infinity ? 0 : maxLeg - minLeg);
    const montagne = amplitudeFt > AMPLITUDE_MONTAGNE_FT;
    const margeFt = montagne ? MARGE_MONTAGNE_FT : MARGE_PLAINE_FT;
    const safeAltFt = Math.ceil((terrMaxFt + margeFt) / 100) * 100;

    legs.push({
      i, dStart: cumNM, dEnd: cumNM + legNM,
      name0: (a.name || ''), name1: (b.name || ''),
      terrMaxFt: Math.round(terrMaxFt), amplitudeFt: Math.round(amplitudeFt),
      mountain: montagne, marginFt: margeFt, safeAltFt, plannedFt: Math.round(altFt),
      breach: altFt < safeAltFt, clearanceFt: Math.round(altFt - terrMaxFt),
    });
    cumNM += legNM;
    waypoints.push({ d: cumNM, name: (b.name || '') });
  }

  if (!donnee) return { ok: false, reason: 'no-data', dist: [], terrain: [], planned: [], waypoints: [] };

  let margeMini = null;
  for (const lg of legs) {
    if (margeMini == null || lg.clearanceFt < margeMini.clearanceFt) {
      margeMini = { clearanceFt: lg.clearanceFt, name0: lg.name0, name1: lg.name1, breach: lg.breach };
    }
  }

  return {
    ok: true, totalNM, dist, terrain, planned, waypoints, legs,
    summary: {
      summitFt: Math.round(sommetFt === -Infinity ? 0 : sommetFt),
      summitD: sommetD, minMargin: margeMini, anyBreach: legs.some((lg) => lg.breach),
    },
  };
}

module.exports = {
  dossierElevation, tuilesPresentes, importer,
  lire, fermerDescripteurs, distanceNM, profil,
};
