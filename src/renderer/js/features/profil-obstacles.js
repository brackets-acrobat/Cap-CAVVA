/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// profil-obstacles.js — les obstacles DANS le profil vertical.
//
// Sur la carte, un obstacle est un symbole bleu et deux nombres. Dans le profil,
// c'est un trait qui monte du sol jusqu'à son sommet, sous la ligne d'altitude
// prévue — ou au travers. C'est la seule vue où l'on voit d'un coup si la
// hauteur choisie passe au-dessus des éoliennes du parcours.
//
// ── Le couloir ─────────────────────────────────────────────────────────────
// Un profil est une coupe : sans largeur, il ne rencontrerait presque aucun
// obstacle. On retient donc ceux qui sont à moins de COULOIR_NM de la route.
// Un mille nautique de part et d'autre, c'est l'ordre de grandeur d'une
// déviation de cap ordinaire — pas une marge de sécurité réglementaire, et le
// profil ne prétend pas en être une.
//
// ── Le sol vient de l'obstacle, pas du relief ──────────────────────────────
// La base d'un obstacle vaut `amslFt − aglFt` : c'est l'altitude de son pied,
// donnée par le SIA. On ne l'interpole pas depuis le profil du relief, qui est
// échantillonné le long de la route et non à l'aplomb de l'obstacle.
//
// ── Rouge au-dessus de l'altitude prévue ───────────────────────────────────
// Un obstacle dont le sommet dépasse l'altitude prévue à cet endroit est tracé
// en rouge, comme les dépassements d'altitude de sécurité du profil. C'est la
// raison d'être de cette couche : le reste est du décor bleu.
// ============================================================

const COULOIR_NM = 1.0;            // de part et d'autre de la route
const PROFIL_OBST_MAX = 400;       // garde-fou de tracé : au-delà c'est illisible

let _profilObstSig = null;
let _profilObstListe = [];

// ------------------------------------------------------------
// Sélection
// ------------------------------------------------------------

// Les obstacles à moins de COULOIR_NM de la route, avec leur abscisse le long
// de celle-ci. Mémorisé : le profil se redessine à chaque survol de la souris.
function calculerObstaclesProfil(wps) {
  const min = obstacleFiltres.hauteurMinFt;
  const sig = JSON.stringify({ w: wps.map((p) => [p.lat, p.lon]), m: min, on: !!layerState.obstacles });
  if (sig === _profilObstSig) return _profilObstListe;
  _profilObstSig = sig;
  _profilObstListe = [];

  // La couche éteinte vaut réglage à zéro : le profil suit la carte, sinon on
  // lirait deux états différents de la même donnée.
  if (!layerState.obstacles || wps.length < 2) return _profilObstListe;

  const retenus = obstaclesRetenus();
  if (!retenus.length) return _profilObstListe;

  const { ech } = echantillonnerRoute(wps);
  if (!ech.length) return _profilObstListe;

  // Cadre de la route élargi du couloir : écarte d'emblée les 13 000 obstacles
  // qui n'ont rien à voir avec ce vol.
  let latMin = Infinity, latMax = -Infinity, lonMin = Infinity, lonMax = -Infinity;
  for (const p of ech) {
    if (p.lat < latMin) latMin = p.lat;
    if (p.lat > latMax) latMax = p.lat;
    if (p.lon < lonMin) lonMin = p.lon;
    if (p.lon > lonMax) lonMax = p.lon;
  }
  const margeLat = COULOIR_NM / 60;
  const margeLon = margeLat / Math.max(0.2, Math.cos(((latMin + latMax) / 2) * Math.PI / 180));

  const trouves = [];
  for (const f of retenus) {
    const [lon, lat] = f.geometry.coordinates;
    if (lat < latMin - margeLat || lat > latMax + margeLat) continue;
    if (lon < lonMin - margeLon || lon > lonMax + margeLon) continue;

    // Échantillon le plus proche : son abscisse devient celle de l'obstacle.
    let meilleur = null;
    for (const p of ech) {
      const dLat = Math.abs(p.lat - lat);
      if (dLat > margeLat) continue;   // pré-filtre avant le grand cercle
      const nm = distanceNM(lat, lon, p.lat, p.lon);
      if (nm <= COULOIR_NM && (!meilleur || nm < meilleur.nm)) meilleur = { nm, d: p.d };
    }
    if (meilleur) trouves.push({ f, d: meilleur.d, ecartNm: meilleur.nm });
  }

  // Les plus hauts d'abord : si le garde-fou tronque, il tronque le bas.
  trouves.sort((a, b) => (b.f.properties.amslFt || 0) - (a.f.properties.amslFt || 0));
  _profilObstListe = trouves.slice(0, PROFIL_OBST_MAX);
  return _profilObstListe;
}

// ------------------------------------------------------------
// Tracé
// ------------------------------------------------------------

// Altitude prévue à la distance d, interpolée depuis le profil déjà calculé.
// null quand on ne sait pas : on ne colore alors rien en rouge.
function _prevueADistance(dist, plan, d) {
  if (!Array.isArray(dist) || !Array.isArray(plan) || dist.length < 2) return null;
  if (d <= dist[0]) return plan[0];
  if (d >= dist[dist.length - 1]) return plan[plan.length - 1];
  for (let i = 1; i < dist.length; i++) {
    if (d <= dist[i]) {
      const t = (d - dist[i - 1]) / Math.max(1e-9, dist[i] - dist[i - 1]);
      return plan[i - 1] + (plan[i] - plan[i - 1]) * t;
    }
  }
  return null;
}

const OBST_PROFIL_BLEU = '#1c3f94';
const OBST_PROFIL_ROUGE = '#e11900';

function rendreObstaclesProfil(liste, X, Y, dist, plan) {
  if (!liste || !liste.length) return '';
  let svg = '';
  for (const o of liste) {
    const p = o.f.properties;
    const sommet = p.amslFt;
    if (!Number.isFinite(sommet)) continue;
    const pied = Number.isFinite(p.aglFt) ? sommet - p.aglFt : sommet;

    const x = X(o.d);
    const yh = Y(sommet), yb = Y(pied);
    if (!(yb > yh)) continue;   // hauteur nulle à l'écran : rien à tracer

    const prevue = _prevueADistance(dist, plan, o.d);
    const perce = Number.isFinite(prevue) && sommet >= prevue;
    const col = perce ? OBST_PROFIL_ROUGE : OBST_PROFIL_BLEU;

    svg += `<line x1="${x.toFixed(1)}" y1="${yb.toFixed(1)}" x2="${x.toFixed(1)}" y2="${yh.toFixed(1)}" `
      + `stroke="${col}" stroke-width="${perce ? 1.8 : 1.2}" stroke-opacity="${perce ? 1 : 0.75}"/>`;
    // Petit chapeau au sommet : sans lui, un obstacle court se perd dans le relief.
    svg += `<path d="M${(x - 2.4).toFixed(1)} ${(yh + 2.6).toFixed(1)} L${x.toFixed(1)} ${yh.toFixed(1)} `
      + `L${(x + 2.4).toFixed(1)} ${(yh + 2.6).toFixed(1)} Z" fill="${col}"/>`;
  }
  return svg;
}

// Obstacles à la distance d, pour l'infobulle de survol du profil. `alt` est
// l'ordonnée survolée en pieds : on ne cite que ceux qui la dépassent.
function obstaclesAuSurvol(d, demiLargeurNm) {
  const out = [];
  for (const o of _profilObstListe) {
    if (Math.abs(o.d - d) > demiLargeurNm) continue;
    out.push(o);
  }
  return out.sort((a, b) => (b.f.properties.amslFt || 0) - (a.f.properties.amslFt || 0)).slice(0, 4);
}
