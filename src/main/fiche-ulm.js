/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// fiche-ulm.js — fiches de terrain ULM (BASULM / FFPLUM).
// ============================================================
//
// Ouvre dans le navigateur par défaut la fiche PDF d'un terrain ULM publiée par
// la Fédération française d'ULM. Pendant de vac-sia.js, mais rien n'y ressemble.
//
// LE RAPPROCHEMENT SE FAIT PAR LES COORDONNÉES, PAS PAR LE CODE. Les codes des
// terrains ULM dans MSFS sont souvent faux : le simulateur donne LFIJ pour le
// terrain de Lavours quand BASULM le publie sous LF0125, à 89 m de distance ;
// « Aéroport de Meursault » (LF47) est en réalité la fiche LF2162 Saint-Romain,
// à 100 m. Sur les 643 terrains rapprochés, 74 ont un code MSFS qui ne mène à
// rien : par code seul, leur fiche serait inaccessible.
//
// LE RAYON. Mesuré sur les données réelles : à 1 NM apparaissent de fausses
// correspondances franches — une hélisurface d'hôpital rapprochée d'un
// aérodrome à 0,97 NM, un héliport de resort collé à une base ULM à 0,72 NM.
// Toutes disparaissent sous 0,4 NM. À 500 m les divergences restantes sont
// toutes des mêmes lieux nommés autrement. D'où RAYON_NM ci-dessous : l'élargir
// ne gagnerait que quelques terrains et ferait entrer des fiches fausses — sur
// un terrain d'atterrissage, une fiche fausse est pire que pas de fiche.
//
// LE PIÈGE DU SERVEUR. Un PDF absent ne renvoie PAS 404 : le serveur répond 200
// avec la page d'accueil HTML. Le code d'état est donc inutilisable ; c'est le
// Content-Type qui tranche. Voir estPdf().
//
// Données © FFPLUM (basulm.ffplum.fr). Index régénérable : npm run basulm:maj
// ============================================================

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { shell } = require('electron');

const INDEX = path.join(__dirname, 'bundled-data', 'basulm-index.csv.gz');
const BASE_PDF = 'https://basulm.ffplum.fr/PDF';
const TIMEOUT_MS = 15000;

// 0,27 NM ≈ 500 m. Voir l'en-tête : ce seuil est mesuré, pas choisi au hasard.
const RAYON_NM = 0.27;

const R_NM = 3440.065;
const rad = (d) => d * Math.PI / 180;

function distanceNm(aLat, aLon, bLat, bLon) {
  const dLat = rad(bLat - aLat), dLon = rad(bLon - aLon);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(s)));
}

// ------------------------------------------------------------
// Index
// ------------------------------------------------------------

let _terrains = null;         // [{ code, lat, lon, nom }]
let _grille = null;           // Map('lat10|lon10' -> [terrain])

const cle = (lat, lon) => `${Math.round(lat * 10)}|${Math.round(lon * 10)}`;

function charger() {
  if (_terrains) return _terrains;
  _terrains = [];
  _grille = new Map();
  let texte;
  try {
    texte = zlib.gunzipSync(fs.readFileSync(INDEX)).toString('utf8');
  } catch (_) {
    return _terrains;   // index absent : la fonctionnalité se tait, elle ne casse rien
  }
  for (const ligne of texte.split('\n')) {
    if (!ligne || ligne[0] === '#') continue;
    const [code, lat, lon, nom] = ligne.split(';');
    const la = Number(lat), lo = Number(lon);
    if (!code || !Number.isFinite(la) || !Number.isFinite(lo)) continue;
    const t = { code: code.trim().toUpperCase(), lat: la, lon: lo, nom: (nom || '').trim() };
    _terrains.push(t);
    const k = cle(la, lo);
    if (!_grille.has(k)) _grille.set(k, []);
    _grille.get(k).push(t);
  }
  return _terrains;
}

// Terrain BASULM le plus proche de ce point, dans RAYON_NM. null sinon.
// Les cases voisines sont balayées parce qu'un terrain proche peut tomber de
// l'autre côté d'une frontière de case.
function terrainProche(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  charger();
  if (!_grille || !_grille.size) return null;
  const la = Math.round(lat * 10), lo = Math.round(lon * 10);
  let meilleur = null, meilleureD = Infinity;
  for (let i = -1; i <= 1; i++) {
    for (let j = -1; j <= 1; j++) {
      const cases = _grille.get(`${la + i}|${lo + j}`);
      if (!cases) continue;
      for (const t of cases) {
        const d = distanceNm(lat, lon, t.lat, t.lon);
        if (d < meilleureD) { meilleureD = d; meilleur = t; }
      }
    }
  }
  return meilleureD <= RAYON_NM ? { ...meilleur, distanceNm: meilleureD } : null;
}

// ------------------------------------------------------------
// Réseau
// ------------------------------------------------------------

function urlFiche(code) {
  return `${BASE_PDF}/${encodeURIComponent(code)}.pdf`;
}

// Le serveur répond 200 même pour une fiche absente, en servant sa page
// d'accueil. Seul le Content-Type dit la vérité.
async function estPdf(url) {
  let res;
  try {
    res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    const err = new Error(`${url} : ${e.message}`);
    err.raison = 'reseau';
    throw err;
  }
  if (!res.ok) return false;
  return /application\/pdf/i.test(res.headers.get('content-type') || '');
}

// ------------------------------------------------------------
// Points d'entrée
// ------------------------------------------------------------

// Code BASULM correspondant à ces coordonnées, ou null. Sert à n'afficher
// l'entrée de menu que là où il y a effectivement une fiche.
function codePour(lat, lon) {
  const t = terrainProche(lat, lon);
  return t ? t.code : null;
}

// Ouvre la fiche du terrain situé à ces coordonnées.
// { ok: true, code, nom, url } ou { ok: false, raison } avec raison dans
// 'hors-base' | 'absente' | 'reseau'.
async function ouvrirFiche(lat, lon) {
  const t = terrainProche(lat, lon);
  if (!t) return { ok: false, raison: 'hors-base' };
  const url = urlFiche(t.code);
  try {
    if (!await estPdf(url)) return { ok: false, raison: 'absente', code: t.code };
    await shell.openExternal(url);
    return { ok: true, code: t.code, nom: t.nom, url };
  } catch (e) {
    return { ok: false, raison: e.raison || 'reseau', code: t.code, detail: e.message };
  }
}

module.exports = { ouvrirFiche, codePour, terrainProche, urlFiche, RAYON_NM };
