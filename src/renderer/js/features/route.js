/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// route.js — état du plan de vol, legs, caps et distances.
// Le coeur de la navigation : résolution des ICAO, suite des points tournants,
// altitude et séquencement du leg actif, géométrie grand cercle.
// ============================================================

// Ligne de route : trait droit ICAO départ → ICAO arrivée.
// Rouge épaisseur 3, bordé de blanc (1 px de chaque côté) — deux polylignes
// superposées (blanche ép.5 dessous, rouge ép.3 dessus). Les points sont résolus
// depuis la base aéroports (par code) ; 'ZZZZ' utilise le dernier point cliqué.
// ============================================================
let routeLayer = null;
let _lieuDepartLatLng = null;    // point de départ hors-aéroport (ZZZY)
let _lieuArriveeLatLng = null;   // point d'arrivée hors-aéroport (ZZZZ)
// Points tournants entre départ et arrivée, dans l'ordre de parcours. C'est le
// stockage EN MÉMOIRE du plan : [{lat, lon}] en coordonnées canoniques
// [-180,180]. (La sauvegarde du plan de vol s'appuiera dessus.)
let routeWaypoints = [];
let _routeTimer = null;
let _routeReqId = 0;
let _routeDragging = false;   // drag de création/déplacement d'un point en cours

function planifierLigneRoute() {
  if (_routeTimer) clearTimeout(_routeTimer);
  _routeTimer = setTimeout(majLigneRoute, 150);
}

// Résout une valeur de champ ICAO en {lat, lon} (ou null si introuvable).
// ZZZY = point de départ cliqué, ZZZZ = point d'arrivée cliqué.
async function resoudrePointIcao(valeur) {
  const code = nettoyerIcao(valeur);
  if (!code) return null;
  if (code === 'ZZZY') {
    return _lieuDepartLatLng ? { lat: _lieuDepartLatLng.lat, lon: _lieuDepartLatLng.lng } : null;
  }
  if (code === 'ZZZZ') {
    return _lieuArriveeLatLng ? { lat: _lieuArriveeLatLng.lat, lon: _lieuArriveeLatLng.lng } : null;
  }
  let res;
  try { res = await window.cap.aeroportParCode(code); } catch (_) { return null; }
  return (res && res.ok && res.airport) ? { lat: res.airport.lat, lon: res.airport.lon } : null;
}

// Ramène une longitude (éventuellement déroulée hors plage) dans [-180, 180].
function wrapLon(lon) { return ((lon + 180) % 360 + 360) % 360 - 180; }

// Déroule les longitudes d'une suite de points pour l'AFFICHAGE (antiméridien) :
// chaque point reste dans la même copie du monde que le précédent (écart ≤ 180°),
// pour que la ligne emprunte toujours le plus court chemin. Coordonnées stockées
// inchangées. Renvoie le tableau des longitudes d'affichage.
function deroulerLons(points) {
  const out = [];
  for (let i = 0; i < points.length; i++) {
    if (i === 0) { out.push(points[0].lon); continue; }
    let d = points[i].lon - points[i - 1].lon;
    d = ((d + 180) % 360 + 360) % 360 - 180;
    out.push(out[i - 1] + d);
  }
  return out;
}

// Extrémités résolues (cache), pour redessiner la route de façon SYNCHRONE
// pendant un drag sans relancer la résolution ICAO (asynchrone) à chaque mouvement.
let _routeDep = null, _routeArr = null;

// Altitude planifiée par leg (ft). Ancrée sur le point SOURCE du leg : sur le
// point tournant qui débute le leg (wp.alt), et pour le tout premier leg (au
// départ) sur cette variable dédiée. Suit donc les insertions/déplacements de
// points comme le nom. null = non renseignée.
let _legAltDep = null;
const DEFAULT_LEG_ALT = 2500;   // altitude par défaut d'un leg (ft) tant que non renseignée
function getLegAlt(i) {
  if (i === 0) return Number.isFinite(_legAltDep) ? _legAltDep : DEFAULT_LEG_ALT;
  const wp = routeWaypoints[i - 1];
  return wp && Number.isFinite(wp.alt) ? wp.alt : DEFAULT_LEG_ALT;
}
function setLegAlt(i, v) {
  const val = Number.isFinite(v) ? v : null;
  if (i === 0) { _legAltDep = val; return; }
  const wp = routeWaypoints[i - 1];
  if (!wp) return;
  if (val == null) delete wp.alt; else wp.alt = val;
}

// Leg actif (0-based). Suit l'avion par séquencement (avance quand l'avion
// franchit le travers du waypoint de fin, ou la bissectrice du virage suivant),
// ou forcé au clic droit dans le tableau. Couleurs carte : actif = rouge,
// suivants = magenta, faits = gris.
let _legActif = 0;
const LEG_COL_ACTIVE = '#ff0000';   // leg actif
const LEG_COL_NEXT   = '#ff00ff';   // legs à venir (magenta)
const LEG_COL_PAST   = '#9e9e9e';   // legs déjà parcourus (gris)

function nbLegs() {
  if (!_routeDep || !_routeArr) return 0;
  return routeWaypoints.length + 1;
}
// Leg actif ramené dans [0, nbLegs-1] (−1 si pas de route).
function legActifClamp() {
  const n = nbLegs();
  return n <= 0 ? -1 : Math.max(0, Math.min(_legActif, n - 1));
}
// Forçage manuel (clic droit) : rend le leg i actif, recolore carte + tableau.
function forcerLegActif(i) {
  if (!(i >= 0)) return;
  _legActif = i;
  dessinerRoute();
}
// Séquencement auto, portage FIDÈLE de Little Navmap (Route::updateActiveLegAndPos).
// Le leg actif « cur » (A→B) bascule sur le suivant (B→C) quand :
//   • l'avion a franchi le TRAVERS de B  → statut du leg actif == AFTER_END ; OU
//   • le leg suivant est devenu plus proche que le leg actif
//     (isSmaller, marge 10 m) ET le cap RÉEL de l'avion s'écarte de moins de 90°
//     du cap du leg suivant (courseDiff).
// La distance comparée par isSmaller est, hors segment, la distance au point
// d'extrémité le plus proche (cf. distanceVersLeg) : tant que l'avion n'a pas
// atteint B, il est BEFORE_START du leg suivant → distance = distance à B
// (grande) → aucune bascule anticipée, même en s'écartant latéralement.
// Aucun cercle de proximité. Monotone (n'avance jamais en arrière) ; le forçage
// manuel (clic droit) tient jusqu'au prochain franchissement.
const _SEQ_EPS_NM = 10 / 1852;   // marge isSmaller de LNM : 10 mètres, en NM

function majLegActifDepuisAvion(f) {
  if (!f || typeof f.lat !== 'number' || typeof f.lon !== 'number' || !isFinite(f.lat) || !isFinite(f.lon)) return;
  const n = nbLegs();
  if (n <= 0) return;
  const cur = legActifClamp();
  if (cur < 0 || cur >= n - 1) return;   // dernier leg → rien à séquencer
  const pts = [_routeDep, ...routeWaypoints, _routeArr];
  const A = pts[cur];        // départ du leg actif
  const B = pts[cur + 1];    // arrivée du leg actif (waypoint à franchir)
  const C = pts[cur + 2];    // arrivée du leg suivant (absent sur l'avant-dernier)

  const resActif = distanceVersLeg(f.lat, f.lon, A.lat, A.lon, B.lat, B.lon);

  // 1) Travers de B franchi.
  let basculer = (resActif.status === 'AFTER_END');

  // 2) Leg suivant plus proche + cap avion cohérent avec le leg suivant.
  if (!basculer && C) {
    const resSuivant = distanceVersLeg(f.lat, f.lon, B.lat, B.lon, C.lat, C.lon);
    const capSuivant = capVraiInitial(B.lat, B.lon, C.lat, C.lon);
    // Cap RÉEL de l'avion (vrai) — pos.course de LNM. Repli : cap du leg actif.
    const capAvion = Number.isFinite(f.headingTrue) ? f.headingTrue : capVraiInitial(A.lat, A.lon, B.lat, B.lon);
    let courseDiff = Math.abs(((capAvion - capSuivant) % 360 + 360) % 360);
    if (courseDiff > 180) courseDiff = 360 - courseDiff;
    // isSmaller(resSuivant, resActif, 10 m) && courseDiff < 90°
    if (Math.abs(resSuivant.distance) < Math.abs(resActif.distance) + _SEQ_EPS_NM && courseDiff < 90) {
      basculer = true;
    }
  }

  if (basculer) {
    _legActif = cur + 1;
    dessinerRoute();
  }
}

// --- Géométrie pour les étiquettes de leg (cap magnétique + distance) ---
const _RAYON_TERRE_NM = 3440.065;

// Cap vrai initial (grand cercle) de A vers B, en degrés [0,360).
// On passe des longitudes d'affichage (déroulées) → l'écart est déjà le plus
// court chemin, l'antiméridien est donc géré.
function capVraiInitial(latA, lonA, latB, lonB) {
  const f1 = latA * Math.PI / 180, f2 = latB * Math.PI / 180;
  const dl = (lonB - lonA) * Math.PI / 180;
  const y = Math.sin(dl) * Math.cos(f2);
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// Distance grand cercle A→B en milles nautiques.
function distanceNM(latA, lonA, latB, lonB) {
  const f1 = latA * Math.PI / 180, f2 = latB * Math.PI / 180;
  const df = (latB - latA) * Math.PI / 180, dl = (lonB - lonA) * Math.PI / 180;
  const h = Math.sin(df / 2) ** 2 + Math.cos(f1) * Math.cos(f2) * Math.sin(dl / 2) ** 2;
  return 2 * _RAYON_TERRE_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Portage fidèle de atools::geo::Pos::distanceMeterToLine (Little Navmap) :
// projette P sur la droite grand-cercle A→B. Toutes distances en NM.
//   status        : 'ALONG_TRACK' (pied entre A et B), 'BEFORE_START' (avant A),
//                   'AFTER_END' (après B) ou 'INVALID'.
//   distance      : si ALONG_TRACK → écart latéral SIGNÉ (+ = à droite de la
//                   route) ; sinon → distance au point d'extrémité le plus proche
//                   (A ou B). C'est ce basculement de sens qui empêche toute
//                   bascule anticipée quand l'avion n'a pas encore atteint B.
//   distanceFrom1 : distance le long de la route de A au pied de la perpendiculaire.
//   distanceFrom2 : idem depuis B.
// Antiméridien géré (caps via atan2(sin, cos), périodiques).
function distanceVersLeg(latP, lonP, latA, lonA, latB, lonB) {
  const R = _RAYON_TERRE_NM;
  const res = { distance: NaN, distanceFrom1: NaN, distanceFrom2: NaN, status: 'INVALID' };
  if (![latP, lonP, latA, lonA, latB, lonB].every(Number.isFinite)) return res;

  const dist1To2 = distanceNM(latA, lonA, latB, lonB) / R;   // distance angulaire A→B (rad)
  if (dist1To2 === 0) {                                       // leg dégénéré A == B
    res.status = 'ALONG_TRACK';
    res.distance = distanceNM(latP, lonP, latA, lonA);
    res.distanceFrom1 = res.distanceFrom2 = 0;
    return res;
  }

  const distFrom1 = distanceNM(latA, lonA, latP, lonP) / R;   // rad
  const distFrom2 = distanceNM(latB, lonB, latP, lonP) / R;   // rad
  const courseFrom1 = capVraiInitial(latA, lonA, latP, lonP) * Math.PI / 180;  // cap A→P
  const course1To2  = capVraiInitial(latA, lonA, latB, lonB) * Math.PI / 180;  // cap A→B

  // Écart latéral (+ = à droite du cap) puis distances le long de la route.
  const crossTrack = Math.asin(Math.max(-1, Math.min(1, Math.sin(distFrom1) * Math.sin(courseFrom1 - course1To2))));
  const distAlongFrom1 = Math.acos(Math.max(-1, Math.min(1, Math.cos(distFrom1) / Math.cos(crossTrack))));
  const distAlongFrom2 = Math.acos(Math.max(-1, Math.min(1, Math.cos(distFrom2) / Math.cos(crossTrack))));

  if (distAlongFrom1 <= dist1To2 && distAlongFrom2 <= dist1To2) {
    res.status = 'ALONG_TRACK';
    res.distance = crossTrack * R;
  } else {
    res.status = (distFrom1 < distFrom2) ? 'BEFORE_START' : 'AFTER_END';
    res.distance = (distFrom1 < distFrom2 ? distFrom1 : distFrom2) * R;
  }
  res.distanceFrom1 = distAlongFrom1 * R;
  res.distanceFrom2 = distAlongFrom2 * R;
  return res;
}

// Saisie ICAO : majuscules, alphanumérique seulement, 6 caractères max.
['icao-dep', 'icao-arr'].forEach((id) => {
  const el = $(id);
  if (!el) return;
  el.addEventListener('input', () => {
    const v = nettoyerIcao(el.value);
    if (el.value !== v) el.value = v;
    planifierLigneRoute();
    majBoutonsPlan();
  });
});
