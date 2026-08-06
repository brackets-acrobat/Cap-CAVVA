/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// alerte-espaces.js — avertissement avant pénétration d'un espace.
// ============================================================
//
// Un bandeau s'affiche en haut de la carte quand la route sol de l'avion
// l'amène à entrer, dans les 90 secondes, dans un espace qu'il ne devrait pas
// traverser sans avoir agi :
//   • zone interdite, ou espace de classe A (VFR interdit) ;
//   • zone réglementée déclarée active par le brief de la séance ;
//   • espace imposant un contact radio (classes C et D, CTR, RMZ).
//
// LE PRÉAVIS EST UN TEMPS, PAS UNE DISTANCE. Une distance fixe avantagerait
// les lents et prendrait les rapides de court : à 90 kt une minute et demie
// vaut 2,25 NM, à 160 kt elle en vaut 4. On projette donc la route sol sur la
// distance réellement parcourue en 90 s et on cherche où elle coupe la limite.
// Pas d'intersection, pas d'avertissement : longer une TMA sans jamais mettre
// le cap dessus ne déclenche rien, et le test de rapprochement est inutile —
// c'est la géométrie qui le porte.
//
// LA ROUTE SOL, PAS LE CAP. Le cap avion ignore la dérive ; par vent de
// travers l'avion va où sa route le mène, pas où son nez pointe. On dérive
// donc la route des positions successives, et on ne retombe sur le cap que
// faute de mouvement mesurable.
//
// L'AVERTISSEMENT IGNORE LES FILTRES D'AFFICHAGE. Une famille décochée ou un
// plancher réglé trop bas masquent une zone sur la carte ; ils ne la font pas
// disparaître du ciel. Masquer l'avertissement avec le tracé serait le seul
// endroit où un réglage de confort deviendrait un risque.
//
// LIMITE CONNUE : la tranche d'altitude est jugée sur l'altitude COURANTE, pas
// sur celle qu'aura l'avion dans 90 s. Un avion qui monte vers le plancher
// d'une TMA n'est donc pas averti tant qu'il est dessous. Corriger cela
// demanderait une vitesse verticale, que le flux ne porte pas aujourd'hui.
// ============================================================

const ALERTE_PREAVIS_S = 90;      // 1 min 30 avant pénétration
const ALERTE_DUREE_MS = 10000;    // le bandeau reste 10 s
const ALERTE_GS_MIN_KT = 20;      // en deçà, la route sol n'a pas de sens
const ALERTE_REARME_S = 30;       // silence après qu'une zone a cessé de menacer
const ALERTE_MARGE_NM = 0.5;      // marge sur le tri grossier par cadre

// ------------------------------------------------------------
// Ce qui mérite un avertissement
// ------------------------------------------------------------

// Un contact radio est-il exigé pour pénétrer ? Voir obligationsZone().
function alerteRadioExigee(p) {
  if (p.type === 'CTR' || p.type === 'MCTR') return true;
  if (p.type === 'RMZ' || p.type === 'RMZ-TMZ') return true;
  return p.classe === 'C' || p.classe === 'D';
}

// Gravité de la zone, ou null si elle ne justifie aucun avertissement.
// Le rang départage deux zones menaçantes en même temps ; à rang égal, c'est
// la plus proche dans le temps qui l'emporte.
function alerteGravite(p) {
  if (p.type === 'P') return { rang: 3, genre: 'interdite' };
  if (p.classe === 'A') return { rang: 3, genre: 'classeA' };
  if (p.type === 'R' && typeof estZoneActive === 'function' && estZoneActive(p)) {
    return { rang: 2, genre: 'reglementee' };
  }
  if (alerteRadioExigee(p)) return { rang: 1, genre: 'radio' };
  return null;
}

// Texte du bandeau. La classe ne convient pas à tout : une RMZ porte souvent
// la classe E, qui n'impose rien — c'est la RMZ qui impose. On nomme donc le
// type quand c'est lui qui fonde l'obligation.
function alerteTexte(p, genre) {
  const nom = p.nomUsuel || p.nom || '?';
  if (genre === 'interdite') return t('alerteInterdite').replace('{nom}', nom);
  if (genre === 'classeA') return t('alerteClasseA').replace('{nom}', nom);
  if (genre === 'reglementee') return t('alerteReglementee').replace('{nom}', nom);
  if (p.type === 'RMZ' || p.type === 'RMZ-TMZ' || !p.classe) {
    return t('alerteRadioType').replace('{type}', p.type).replace('{nom}', nom);
  }
  return t('alerteRadioClasse').replace('{classe}', p.classe).replace('{nom}', nom);
}

// ------------------------------------------------------------
// Géométrie
// ------------------------------------------------------------

// Cadre englobant d'une zone, calculé une fois et gardé sur la feature (même
// procédé que __couche dans espaces-aeriens.js).
function alerteCadre(feature) {
  if (feature.__cadre) return feature.__cadre;
  let n = -Infinity, s = Infinity, e = -Infinity, o = Infinity;
  const anneaux = feature.geometry.type === 'MultiPolygon'
    ? feature.geometry.coordinates.flat()
    : feature.geometry.coordinates;
  for (const anneau of anneaux) {
    for (const [lon, lat] of anneau) {
      if (lat > n) n = lat;
      if (lat < s) s = lat;
      if (lon > e) e = lon;
      if (lon < o) o = lon;
    }
  }
  feature.__cadre = { n, s, e, o };
  return feature.__cadre;
}

// Repère plan local en milles nautiques, centré sur l'avion : x vers l'est,
// y vers le nord. Sur quelques milles l'écart à la sphère est négligeable, et
// tout le calcul d'intersection devient de la géométrie plane.
function alerteRepere(lat0, lon0) {
  const k = Math.cos(lat0 * Math.PI / 180) * 60;
  return (lon, lat) => [(lon - lon0) * k, (lat - lat0) * 60];
}

// Abscisse t ∈ [0,1] de l'intersection de [p0,p1] avec [q0,q1], ou null.
function alerteIntersection(p0, p1, q0, q1) {
  const rx = p1[0] - p0[0], ry = p1[1] - p0[1];
  const sx = q1[0] - q0[0], sy = q1[1] - q0[1];
  const den = rx * sy - ry * sx;
  if (den === 0) return null;                 // parallèles
  const qpx = q0[0] - p0[0], qpy = q0[1] - p0[1];
  const t = (qpx * sy - qpy * sx) / den;
  const u = (qpx * ry - qpy * rx) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return t;
}

// Première intersection de la route projetée avec la limite de la zone.
function alertePremiereCoupe(feature, repere, p0, p1) {
  const anneaux = feature.geometry.type === 'MultiPolygon'
    ? feature.geometry.coordinates.flat()
    : feature.geometry.coordinates;
  let meilleur = null;
  for (const anneau of anneaux) {
    for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
      const a = repere(anneau[j][0], anneau[j][1]);
      const b = repere(anneau[i][0], anneau[i][1]);
      const t = alerteIntersection(p0, p1, a, b);
      if (t != null && (meilleur == null || t < meilleur)) meilleur = t;
    }
  }
  return meilleur;
}

// ------------------------------------------------------------
// Route sol
// ------------------------------------------------------------

let _alerteHist = [];   // positions récentes, pour dériver la route réelle

// Route sol en degrés vrais, dérivée du déplacement réel. Retombe sur le cap
// avion tant que l'avion n'a pas parcouru de quoi mesurer une direction.
function alerteRouteSol(f) {
  const now = f.t || Date.now();
  _alerteHist.push({ lat: f.lat, lon: f.lon, t: now });
  while (_alerteHist.length > 40) _alerteHist.shift();
  for (let i = _alerteHist.length - 2; i >= 0; i--) {
    const p = _alerteHist[i];
    if (now - p.t < 2000) continue;               // trop récent : bruit
    if (distanceNM(p.lat, p.lon, f.lat, f.lon) < 0.03) continue;   // pas assez bougé
    return capVraiInitial(p.lat, p.lon, f.lat, f.lon);
  }
  return Number.isFinite(f.headingTrue) ? f.headingTrue : null;
}

// ------------------------------------------------------------
// Bandeau
// ------------------------------------------------------------

let _alerteTimer = null;
let _alerteRangAffiche = 0;   // gravité de ce qui est à l'écran, 0 si rien

function alerteAfficher(texte, rang) {
  const el = $('alerte-espace');
  if (!el) return;
  el.textContent = texte;
  el.hidden = false;
  _alerteRangAffiche = rang;
  if (_alerteTimer) clearTimeout(_alerteTimer);
  _alerteTimer = setTimeout(alerteMasquer, ALERTE_DUREE_MS);
}

function alerteMasquer() {
  if (_alerteTimer) { clearTimeout(_alerteTimer); _alerteTimer = null; }
  _alerteRangAffiche = 0;
  const el = $('alerte-espace');
  if (el) el.hidden = true;
}

// ------------------------------------------------------------
// Boucle
// ------------------------------------------------------------

// Zones déjà annoncées : clé → instant où elles ont cessé de menacer (null tant
// qu'elles menacent encore). Sans cette mémoire, le flux arrivant deux fois par
// seconde rejouerait le bandeau en boucle le long d'une limite.
let _alerteAnnoncees = new Map();

function reinitAlerteEspaces() {
  _alerteHist = [];
  _alerteAnnoncees = new Map();
  alerteMasquer();
}

function majAlerteEspaces(f) {
  if (!f || f.onGround) return;                       // au sol : bruit garanti
  if (!espacesCharges()) return;
  const gs = f.groundSpeedKt;
  if (!Number.isFinite(gs) || gs < ALERTE_GS_MIN_KT) return;
  if (!Number.isFinite(f.lat) || !Number.isFinite(f.lon)) return;
  const route = alerteRouteSol(f);
  if (route == null) return;

  const portee = gs * ALERTE_PREAVIS_S / 3600;        // NM parcourus en 1 min 30
  const repere = alerteRepere(f.lat, f.lon);
  const rad = route * Math.PI / 180;
  const p0 = [0, 0];
  const p1 = [portee * Math.sin(rad), portee * Math.cos(rad)];

  // Tri grossier par cadre : sans lui on testerait 2231 polygones deux fois par
  // seconde.
  const dLat = portee / 60 + ALERTE_MARGE_NM / 60;
  const dLon = dLat / Math.max(0.2, Math.cos(f.lat * Math.PI / 180));
  const ctx = { amslFt: f.amslFt, aglFt: f.aglFt, stdFt: f.stdFt };
  const menacantes = new Set();
  let meilleure = null;

  for (const feature of _espacesData.features) {
    const p = feature.properties;
    const g = alerteGravite(p);
    if (!g) continue;
    // Une zone sans étendue connue n'a pas de limite à franchir : annoncer une
    // pénétration demanderait de lui inventer un rayon. Elle reste visible sur
    // la carte et dans la sonde, mais ne déclenche rien.
    if (p.ponctuel) continue;
    const c = alerteCadre(feature);
    if (f.lat < c.s - dLat || f.lat > c.n + dLat) continue;
    if (f.lon < c.o - dLon || f.lon > c.e + dLon) continue;
    if (!traverseZone(p, ctx)) continue;
    if (pointDansGeometrie([f.lon, f.lat], feature.geometry)) continue;   // déjà dedans
    const t = alertePremiereCoupe(feature, repere, p0, p1);
    if (t == null) continue;

    menacantes.add(p.cle);
    if (_alerteAnnoncees.has(p.cle)) continue;
    const secondes = (t * portee) / gs * 3600;
    if (!meilleure || g.rang > meilleure.rang
        || (g.rang === meilleure.rang && secondes < meilleure.secondes)) {
      meilleure = { rang: g.rang, genre: g.genre, secondes, p };
    }
  }

  // Réarmement : une zone redevient annonçable après ALERTE_REARME_S sans
  // menace, pour ne pas se rejouer au moindre frémissement de route.
  const now = Date.now();
  for (const [cle, depuis] of _alerteAnnoncees) {
    if (menacantes.has(cle)) { _alerteAnnoncees.set(cle, null); continue; }
    if (depuis == null) _alerteAnnoncees.set(cle, now);
    else if (now - depuis > ALERTE_REARME_S * 1000) _alerteAnnoncees.delete(cle);
  }

  if (!meilleure) return;
  // Un bandeau à l'écran n'est remplacé que par plus grave que lui.
  if (_alerteRangAffiche && meilleure.rang <= _alerteRangAffiche) return;
  _alerteAnnoncees.set(meilleure.p.cle, null);
  alerteAfficher(alerteTexte(meilleure.p, meilleure.genre), meilleure.rang);
}
