/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// etiquettes-legs.js — étiquette cap magnétique + distance sur chaque branche.
// L'étiquette porte le cap MAGNÉTIQUE (cap vrai grand cercle corrigé de la
// déclinaison locale, cf. declinaison.js) et la distance en milles nautiques.
// Les noms des points tournants ne sont posés que là où ils ne recouvrent rien.
// ============================================================

// Mesure la largeur d'un texte au gabarit de l'étiquette (canvas hors-écran).
let _badgeCtx = null;
function mesurerLargeurTexte(txt) {
  if (!_badgeCtx) {
    _badgeCtx = document.createElement('canvas').getContext('2d');
    _badgeCtx.font = "11px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
  }
  return _badgeCtx.measureText(txt).width;
}

// Étiquette d'un leg : carré rouge (bord blanc 1 px, texte blanc 11 px) au
// milieu du segment, orienté le long de la ligne. Affiche le cap MAGNÉTIQUE
// (cap vrai − déclinaison) et la distance en NM. N'apparaît que si le segment à
// l'écran est assez long pour contenir le carré + 20 px de ligne de chaque côté
// (sinon il faut zoomer davantage).
function dessinerEtiquetteLeg(a, lonA, b, lonB) {
  if (!map) return;
  const capVrai = capVraiInitial(a.lat, lonA, b.lat, lonB);
  const decl = declinaisonEn((a.lat + b.lat) / 2, (lonA + lonB) / 2);
  const capMag = Math.round(((capVrai - decl) % 360 + 360) % 360);
  const dNM = distanceNM(a.lat, lonA, b.lat, lonB);
  const distTxt = dNM >= 10 ? String(Math.round(dNM)) : dNM.toFixed(1);
  const label = `${String(capMag).padStart(3, '0')}°  ${distTxt} NM`;

  // Largeur du carré (texte + padding 5px×2 + bord 1px×2), hauteur fixe.
  const w = Math.ceil(mesurerLargeurTexte(label)) + 12;
  const h = 19;

  // Longueur du segment à l'écran : on n'affiche que s'il reste ≥ 20 px de ligne
  // de chaque côté du carré.
  const pA = map.latLngToContainerPoint([a.lat, lonA]);
  const pB = map.latLngToContainerPoint([b.lat, lonB]);
  if (pA.distanceTo(pB) < w + 40) return;

  // Orientation le long de la ligne, texte gardé lisible (jamais à l'envers).
  let ang = Math.atan2(pB.y - pA.y, pB.x - pA.x) * 180 / Math.PI;
  if (ang > 90) ang -= 180; else if (ang < -90) ang += 180;

  const icon = L.divIcon({
    className: 'leg-badge-wrap',
    html: `<div class="leg-badge" style="transform:rotate(${ang}deg)">${escapeHtml(label)}</div>`,
    iconSize: [w, h],
    iconAnchor: [w / 2, h / 2],
  });
  L.marker([(a.lat + b.lat) / 2, (lonA + lonB) / 2], { icon, interactive: false, keyboard: false }).addTo(routeLayer);
}

// --- Labels permanents des points tournants (rouge, contour blanc) ---------
// Mesure la largeur d'un nom au gabarit du label (police en gras, canvas caché).
let _labelCtx = null;
function mesurerLargeurLabel(txt) {
  if (!_labelCtx) {
    _labelCtx = document.createElement('canvas').getContext('2d');
    _labelCtx.font = "700 12px 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";
  }
  return _labelCtx.measureText(txt).width;
}

// Intersection de deux segments (coordonnées écran).
function segmentsSecants(x1, y1, x2, y2, x3, y3, x4, y4) {
  const d = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
  if (d === 0) return false;   // parallèles
  const t = ((x3 - x1) * (y4 - y3) - (y3 - y1) * (x4 - x3)) / d;
  const u = ((x3 - x1) * (y2 - y1) - (y3 - y1) * (x2 - x1)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}
function pointDansRect(x, y, r) { return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h; }
// Un segment [1,2] coupe-t-il le rectangle r (bord ou intérieur) ?
function segmentCoupeRect(x1, y1, x2, y2, r) {
  if (pointDansRect(x1, y1, r) || pointDansRect(x2, y2, r)) return true;
  const rx = r.x + r.w, ry = r.y + r.h;
  return segmentsSecants(x1, y1, x2, y2, r.x, r.y, rx, r.y)     // haut
      || segmentsSecants(x1, y1, x2, y2, rx, r.y, rx, ry)       // droite
      || segmentsSecants(x1, y1, x2, y2, rx, ry, r.x, ry)       // bas
      || segmentsSecants(x1, y1, x2, y2, r.x, ry, r.x, r.y);    // gauche
}
function rectsSeChevauchent(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

// Place un label rouge (contour blanc) à côté de chaque point tournant, MAIS
// seulement si une position candidate autour du point ne chevauche ni une ligne
// de leg ni un label déjà posé (sinon le nom est masqué : zoom insuffisant).
const WP_LABEL_ZOOM_MIN = 10;   // zoom en deçà duquel les noms de points ne sont pas affichés
function dessinerLabelsPoints(points, disp, wps, noms) {
  if (!map || !wps.length) return;
  if (map.getZoom() < WP_LABEL_ZOOM_MIN) return;   // trop dézoomé → pas de labels
  // Legs en pixels-écran (mêmes points que le tracé).
  const px = points.map((p, i) => map.latLngToContainerPoint([p.lat, disp[i]]));
  const segs = [];
  for (let i = 0; i < px.length - 1; i++) segs.push([px[i], px[i + 1]]);

  const H = 16, GAP = 9, MARGE = 3;   // hauteur label, écart au point, marge anti-frôlement des lignes
  const placés = [];                   // rectangles des labels déjà posés (anti-chevauchement)

  for (let k = 0; k < wps.length; k++) {
    const P = px[k + 1];               // le point tournant occupe l'index k+1 dans la suite
    const nom = noms[k];
    const W = Math.ceil(mesurerLargeurLabel(nom)) + 4;
    // Positions candidates (coin haut-gauche du rectangle), par ordre de préférence.
    const cands = [
      { x: P.x + GAP,     y: P.y - H / 2 },       // E
      { x: P.x + GAP,     y: P.y - GAP - H },      // NE
      { x: P.x + GAP,     y: P.y + GAP },          // SE
      { x: P.x - GAP - W, y: P.y - H / 2 },        // O
      { x: P.x - GAP - W, y: P.y - GAP - H },      // NO
      { x: P.x - GAP - W, y: P.y + GAP },          // SO
      { x: P.x - W / 2,   y: P.y - GAP - H },      // N
      { x: P.x - W / 2,   y: P.y + GAP },          // S
    ];
    let choisi = null;
    for (const c of cands) {
      const r = { x: c.x, y: c.y, w: W, h: H };
      // Test lignes de legs : rectangle élargi de MARGE (les traits font ~5 px).
      const rt = { x: r.x - MARGE, y: r.y - MARGE, w: r.w + 2 * MARGE, h: r.h + 2 * MARGE };
      const heurteLeg = segs.some(([A, B]) => segmentCoupeRect(A.x, A.y, B.x, B.y, rt));
      if (heurteLeg) continue;
      if (placés.some((pr) => rectsSeChevauchent(r, pr))) continue;   // chevauche un autre label
      choisi = r; break;
    }
    if (!choisi) continue;             // aucune position propre → on n'affiche pas ce nom
    placés.push(choisi);
    const icon = L.divIcon({
      className: 'wp-label-wrap',
      html: `<div class="wp-label">${escapeHtml(nom)}</div>`,
      iconSize: [W, H],
      iconAnchor: [P.x - choisi.x, P.y - choisi.y],   // aligne le coin du label sur la position choisie
    });
    L.marker([wps[k].lat, disp[k + 1]], { icon, interactive: false, keyboard: false }).addTo(routeLayer);
  }
}
