/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// obstacles.js — obstacles et feux aéronautiques de l'export du SIA.
//
// 13 452 obstacles en métropole, dont 10 612 éoliennes, plus 50 feux
// aéronautiques au sol. Symboles et couleur repris de la carte OACI au
// 1/500 000 : bleu, silhouette pour l'éolienne, fût effilé pour le reste,
// zigzag pour un câble de traversée de vallée.
//
// ── Deux hauteurs, et une seule qui compte ─────────────────────────────────
// Le SIA donne la cote du sommet (AMSL) ET la hauteur au-dessus du sol (AGL).
// C'est la seconde qui dit s'il faut monter, et c'est sur elle que porte le
// filtre. La carte OACI n'imprime que les obstacles de plus de 300 ft sol ;
// ici on garde toute la donnée et c'est un réglage qui tranche, parce qu'un
// pylône de 250 ft reste un obstacle quand on vole à 1 000 ft sol.
//
// ── Pourquoi le zoom 11 ────────────────────────────────────────────────────
// Plus bas, la Beauce et la Champagne deviennent un tapis bleu où l'on ne
// distingue plus rien — ni le relief, ni les espaces, ni les obstacles
// eux-mêmes. Au zoom 11 on lit une arrivée ou un transit bas, et c'est là
// qu'un obstacle sert à quelque chose.
//
// ── Ce qu'on ne fait pas ───────────────────────────────────────────────────
// On ne regroupe pas les éoliennes en parcs. Le SIA publie une entrée par
// machine ; la carte OACI, elle, dessine un symbole de parc. Reconstituer ces
// parcs supposerait de décider à partir de quelle distance deux éoliennes en
// forment un — ce serait notre invention. Voir sia-convert.js.
// ============================================================

let obstaclesLayer = null;       // groupe Leaflet, créé par initMap()
let _obstaclesData = null;       // FeatureCollection, ou null si rien de converti
let _obstChargement = null;      // promesse en cours, pour ne charger qu'une fois

// Le bleu de la carte OACI. Aucune famille d'espace ne l'emploie.
const OBST_BLEU = '#1c3f94';

// Zoom d'apparition. Plus haut que ZOOM_MIN_COUCHES (8) : il y a cent fois plus
// d'obstacles que d'aérodromes.
const ZOOM_MIN_OBSTACLES = 11;

// Hauteur sol minimale affichée, persistée. 300 ft est le seuil de la carte
// OACI — le défaut donc, mais il se descend jusqu'à 0.
const obstacleFiltres = {
  hauteurMinFt: parseInt(localStorage.getItem('cap-obst-hauteur') || '300', 10),
};

// ------------------------------------------------------------
// Chargement
// ------------------------------------------------------------

async function chargerObstacles() {
  if (_obstaclesData) return _obstaclesData;
  if (_obstChargement) return _obstChargement;
  _obstChargement = (async () => {
    try {
      _obstaclesData = await window.cap.siaObstacles();
    } catch (_) {
      _obstaclesData = null;
    }
    _obstChargement = null;
    return _obstaclesData;
  })();
  return _obstChargement;
}

function oublierObstacles() {
  _obstaclesData = null;
  _obstChargement = null;
}

function obstaclesCharges() {
  return !!(_obstaclesData && Array.isArray(_obstaclesData.features) && _obstaclesData.features.length);
}

// Les obstacles retenus par le filtre de hauteur, pour la carte comme pour le
// profil vertical. Les feux aéronautiques n'ont pas de hauteur : ils ne passent
// jamais par ici.
function obstaclesRetenus() {
  if (!obstaclesCharges()) return [];
  const min = obstacleFiltres.hauteurMinFt;
  return _obstaclesData.features.filter((f) => {
    const p = f.properties;
    if (p.genre !== 'obstacle') return false;
    if (!Number.isFinite(min)) return true;
    return (p.aglFt || 0) >= min;
  });
}

// ------------------------------------------------------------
// Symboles
// ------------------------------------------------------------

// Fût effilé à flancs concaves, base évasée : la silhouette de la carte OACI.
// Le symbole « élevé » (≥ 500 ft sol) est le même, plus haut et plus large du
// pied — c'est ce qui le fait repérer d'un coup d'œil dans un semis.
const SVG_FUT = 'M12 4 C12 4 13.3 14 16.6 20.5 L7.4 20.5 C10.7 14 12 4 12 4 Z';
const SVG_FUT_HAUT = 'M12 1.5 C12 1.5 13.5 13 17.4 20.5 L6.6 20.5 C10.5 13 12 1.5 12 1.5 Z';

// Rayons du balisage nocturne, posés au sommet.
function svgRayons(y) {
  return `<g stroke="${OBST_BLEU}" stroke-width="1.5" stroke-linecap="round">`
    + `<path d="M12 ${y} L12 ${y - 4.4}"/>`
    + `<path d="M12 ${y} L8.4 ${y - 3}"/><path d="M12 ${y} L15.6 ${y - 3}"/>`
    + `<path d="M12 ${y} L7.2 ${y - 0.2}"/><path d="M12 ${y} L16.8 ${y - 0.2}"/></g>`;
}

// Mât, moyeu et trois pales.
const SVG_EOLIENNE =
  `<g stroke="${OBST_BLEU}" stroke-width="1.7" stroke-linecap="round" fill="none">`
  + '<path d="M12 20.5 L12 9.2"/><path d="M12 8.4 L12 1.6"/>'
  + '<path d="M12 8.4 L6.1 11.9"/><path d="M12 8.4 L17.9 11.9"/></g>'
  + `<circle cx="12" cy="8.4" r="1.5" fill="${OBST_BLEU}"/>`;

// Câble suspendu : la traversée de vallée de la légende.
const SVG_CABLE =
  `<path d="M1.5 15 L6 8 L10.5 16 L15 8 L19.5 16 L22.5 11.5" fill="none" stroke="${OBST_BLEU}"`
  + ' stroke-width="1.9" stroke-linejoin="round" stroke-linecap="round"/>';

// Feu aéronautique au sol : l'étoile seule.
const SVG_PHARE =
  `<g stroke="${OBST_BLEU}" stroke-width="1.6" stroke-linecap="round">`
  + '<path d="M12 4 L12 20"/><path d="M4 12 L20 12"/>'
  + '<path d="M6.3 6.3 L17.7 17.7"/><path d="M17.7 6.3 L6.3 17.7"/></g>';

// Les icônes sont mises en cache : une poignée de combinaisons pour des
// milliers de marqueurs, autant ne les fabriquer qu'une fois.
const _iconesObst = new Map();

function iconeObstacle(p) {
  const haut = (p.aglFt || 0) >= 500;
  const groupe = (p.combien || 1) > 1;
  const cle = `${p.forme}|${haut ? 'h' : 'b'}|${p.nuit ? 'n' : '-'}|${groupe ? 'g' : '-'}`;
  if (_iconesObst.has(cle)) return _iconesObst.get(cle);

  // Le repère est posé sur la BASE du symbole : c'est là qu'est l'obstacle.
  // Les variantes de nuit débordent vers le haut, d'où la boîte plus haute.
  let corps, largeur = 24, ancreX = 12, vbX = 0;

  if (p.forme === 'cable') {
    corps = SVG_CABLE;
  } else if (p.forme === 'eolienne') {
    corps = SVG_EOLIENNE;
    if (groupe) { corps = `<g transform="translate(-9,3.5) scale(0.8)">${SVG_EOLIENNE}</g>${corps}`; largeur = 34; vbX = -6; ancreX = 18; }
  } else {
    const d = haut ? SVG_FUT_HAUT : SVG_FUT;
    corps = `<path d="${d}" fill="${OBST_BLEU}"/>`;
    if (groupe) { corps = `<g transform="translate(-8.5,3) scale(0.82)"><path d="${d}" fill="${OBST_BLEU}"/></g>${corps}`; largeur = 34; vbX = -6; ancreX = 18; }
    if (p.nuit) corps += svgRayons(haut ? 1.5 : 3.2);
  }

  const vbY = -5, hauteur = 29;
  const ech = 22 / 24;
  const l = Math.round(largeur * ech), h = Math.round(hauteur * ech);
  const svg = `<svg viewBox="${vbX} ${vbY} ${largeur} ${hauteur}" width="${l}" height="${h}" style="overflow:visible;">${corps}</svg>`;
  const icone = L.divIcon({
    className: 'obst-marker',
    html: svg,
    iconSize: [l, h],
    // Ancre : abscisse du fût, ordonnée de sa base (20.5 dans le repère SVG).
    iconAnchor: [Math.round((ancreX - vbX) * ech), Math.round((20.5 - vbY) * ech)],
  });
  _iconesObst.set(cle, icone);
  return icone;
}

const _iconePhare = L.divIcon({
  className: 'obst-marker',
  html: `<svg viewBox="0 0 24 24" width="20" height="20" style="overflow:visible;">${SVG_PHARE}</svg>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

// ------------------------------------------------------------
// Infobulles
// ------------------------------------------------------------

function infobulleObstacle(p) {
  const l = [];
  const n = (p.combien || 1) > 1 ? ` × ${p.combien}` : '';
  l.push(`<div class="obst-tt-type">${escapeHtml(p.type)}${n}</div>`);
  // La hauteur sol d'abord : c'est elle qui dit s'il faut monter.
  if (Number.isFinite(p.aglFt)) l.push(`<div class="obst-tt-agl">${p.aglFt} ft sol</div>`);
  if (Number.isFinite(p.amslFt)) l.push(`<div class="obst-tt-amsl">${p.amslFt} ft AMSL au sommet</div>`);
  if (p.balisage) l.push(`<div class="obst-tt-bal">Balisage : ${escapeHtml(p.balisage)}</div>`);
  if (p.remarque) l.push(`<div class="obst-tt-rem">${escapeHtml(p.remarque)}</div>`);
  return l.join('');
}

function infobullePhare(p) {
  const l = [`<div class="obst-tt-type">${escapeHtml(p.type === 'IBN' ? t('obstIbn') : t('obstHbn'))}</div>`];
  if (p.situation) l.push(`<div class="obst-tt-agl">${escapeHtml(p.situation)}</div>`);
  if (p.signal) l.push(`<div class="obst-tt-amsl">${escapeHtml(p.signal)}</div>`);
  if (p.horTxt) l.push(`<div class="obst-tt-bal">${escapeHtml(p.horTxt)}</div>`);
  else if (p.horCode) l.push(`<div class="obst-tt-bal">${escapeHtml(p.horCode)}</div>`);
  return l.join('');
}

// ------------------------------------------------------------
// Tracé
// ------------------------------------------------------------

async function rafraichirObstacles() {
  if (!map || !obstaclesLayer) return;

  const veutObstacles = layerState.obstacles && map.getZoom() >= ZOOM_MIN_OBSTACLES;
  const veutPhares = layerState.phares && map.getZoom() >= ZOOM_MIN_COUCHES;
  if (!veutObstacles && !veutPhares) { obstaclesLayer.clearLayers(); return; }

  await chargerObstacles();
  if (!obstaclesCharges()) { obstaclesLayer.clearLayers(); return; }
  // La couche a pu être éteinte, ou la carte dézoomée, pendant le chargement.
  const encoreObst = layerState.obstacles && map.getZoom() >= ZOOM_MIN_OBSTACLES;
  const encorePhares = layerState.phares && map.getZoom() >= ZOOM_MIN_COUCHES;
  obstaclesLayer.clearLayers();
  if (!encoreObst && !encorePhares) return;

  const b = map.getBounds();
  const ouest = b.getWest();
  const min = obstacleFiltres.hauteurMinFt;

  for (const f of _obstaclesData.features) {
    const p = f.properties;
    const estPhare = p.genre === 'phare';
    if (estPhare ? !encorePhares : !encoreObst) continue;
    if (!estPhare && Number.isFinite(min) && (p.aglFt || 0) < min) continue;

    const [lon, lat] = f.geometry.coordinates;
    const lonVue = lonVersVue(lon, ouest);
    if (!b.contains([lat, lonVue])) continue;

    const marqueur = L.marker([lat, lonVue], {
      icon: estPhare ? _iconePhare : iconeObstacle(p),
      interactive: true,
      keyboard: false,
    });
    marqueur.bindTooltip(estPhare ? infobullePhare(p) : infobulleObstacle(p), {
      direction: 'top', offset: [0, -8], className: 'obst-tooltip', opacity: 1,
    });
    marqueur.addTo(obstaclesLayer);
  }
}

// Hauteur sol minimale des obstacles affichés. Le champ qui l'appelle est créé
// avec les contrôles de carte, donc APRÈS ce fichier.
function appliquerHauteurMinObstacles(v) {
  obstacleFiltres.hauteurMinFt = Number.isFinite(v) && v >= 0 ? v : 0;
  localStorage.setItem('cap-obst-hauteur', String(obstacleFiltres.hauteurMinFt));
  rafraichirObstacles();
  // Le profil vertical trace les mêmes obstacles : il suit le même réglage.
  mettreAJourProfilVertical();
}
