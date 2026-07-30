/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// declinaison.js — déclinaison magnétique locale par leg.
// ============================================================

// Déclinaison magnétique locale par leg (degrés, + = Est), via le modèle WMM du
// main. Le tracé est SYNCHRONE (drag) alors que le modèle est ASYNCHRONE (IPC) :
// on mémorise donc les valeurs dans un cache indexé par position arrondie, que
// `dessinerEtiquetteLeg` lit au milieu de son segment (repli : moyenne de route).
// Indexer par position (et non par index de leg) reste correct pendant un drag,
// où le nombre de legs change à la volée.
const _DECL_GRID = 0.5;          // pas de la grille de cache (~30 NM)
const _declCache = new Map();    // clé "lat,lon" arrondie → déclinaison (°, +E)
let _routeDeclinaison = 0;       // repli : moyenne des legs (segments pas en cache)

function _cleDecl(lat, lon) {
  const rl = Math.round(lat / _DECL_GRID) * _DECL_GRID;
  const ro = Math.round(wrapLon(lon) / _DECL_GRID) * _DECL_GRID;
  return rl + ',' + ro;
}

// Déclinaison connue la plus proche d'un point (repli : moyenne de route).
function declinaisonEn(lat, lon) {
  const v = _declCache.get(_cleDecl(lat, lon));
  return Number.isFinite(v) ? v : _routeDeclinaison;
}

async function rafraichirDeclinaison() {
  if (!_routeDep || !_routeArr) return;
  const pts = [_routeDep, ...routeWaypoints, _routeArr];
  const disp = deroulerLons(pts);   // évite l'artefact antiméridien sur les milieux

  // Une requête WMM par leg : déclinaison au milieu de chaque segment, mémorisée
  // dans le cache de position. Leur moyenne sert de repli pour les segments pas
  // encore en cache (ex. aperçu d'un drag).
  let somme = 0, n = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const midLat = (pts[i].lat + pts[i + 1].lat) / 2;
    const midLon = wrapLon((disp[i] + disp[i + 1]) / 2);
    let res;
    try { res = await window.cap.declinaison(midLat, midLon); } catch (_) { res = null; }
    if (res && res.ok && Number.isFinite(res.decl)) {
      _declCache.set(_cleDecl(midLat, midLon), res.decl);
      somme += res.decl; n += 1;
    }
  }
  _routeDeclinaison = n ? somme / n : 0;
  dessinerRoute();   // ré-étiquette avec les déclinaisons à jour
}
