/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// points-vfr.js — points de report VFR de l'export du SIA.
//
// Ce sont les repères par lesquels un contrôleur fait entrer et sortir : « Vous
// rappellerez MM-CV ». Le SIA en publie 1 098 en métropole, chacun avec le
// repère au sol qui permet de le trouver à vue — « Cavaillon (Pont TGV sur la
// Durance) ». C'est ce texte qui compte en vol, pas la latitude.
//
// ── Pourquoi une couche à part ──────────────────────────────────────────────
// Les points VFR ne sont pas des espaces et ne passent pas par espacesLayer.
// Tout ce qui lit les espaces y cherche des VOLUMES : dans quelle zone suis-je,
// quelles tranches ma route traverse, quelle limite vais-je franchir. Un repère
// n'a aucune de ces réponses. Il vit donc dans son propre fichier, sa propre
// couche, et n'entre dans aucun de ces calculs.
//
// ── Pourquoi le seuil de zoom ───────────────────────────────────────────────
// À l'échelle de la France, mille repères font une nappe illisible qui masque
// le relief et les espaces. Ils apparaissent donc au zoom 8, celui-là même où
// apparaissent déjà les aérodromes et les navaids (ZOOM_MIN_COUCHES) : à cette
// échelle on prépare une arrivée, et c'est là qu'un point de report sert.
// ============================================================

let pointsVfrLayer = null;      // groupe Leaflet, créé par initMap()
let _pointsVfrData = null;      // FeatureCollection, ou null si rien de converti
let _vfrChargement = null;      // promesse en cours, pour ne charger qu'une fois

// Noir plein, comme sur les cartes VAC. Aucune famille d'espace n'est noire :
// le repère ne peut pas se lire comme une zone.
//
// Le liseré blanc n'est pas un ornement — Dark Matter est l'un des quatre fonds
// de carte, et un triangle noir y disparaîtrait purement et simplement.
const VFR_COULEUR = '#000000';
const VFR_LISERE = '#ffffff';

// ------------------------------------------------------------
// Chargement
// ------------------------------------------------------------

// Chargé à la demande, à la première fois où la couche est allumée : un export
// converti avant que cette fonctionnalité existe n'a pas de fichier de points,
// et il ne faut pas que son absence coûte quoi que ce soit au démarrage.
async function chargerPointsVfr() {
  if (_pointsVfrData) return _pointsVfrData;
  if (_vfrChargement) return _vfrChargement;
  _vfrChargement = (async () => {
    try {
      _pointsVfrData = await window.cap.siaPointsVfr();
    } catch (_) {
      _pointsVfrData = null;
    }
    _vfrChargement = null;
    return _pointsVfrData;
  })();
  return _vfrChargement;
}

// Vidé après une conversion : le cycle suivant peut ajouter ou déplacer des
// repères.
function oublierPointsVfr() {
  _pointsVfrData = null;
  _vfrChargement = null;
}

function pointsVfrCharges() {
  return !!(_pointsVfrData && Array.isArray(_pointsVfrData.features) && _pointsVfrData.features.length);
}

// ------------------------------------------------------------
// Tracé
// ------------------------------------------------------------

// Triangle plein, pointe en haut. La forme se distingue au premier coup d'œil
// des ronds (terrains) et des hexagones (navaids), y compris pour qui ne
// perçoit pas la différence de couleur.
function iconePointVfr() {
  const svg = '<svg viewBox="-9 -9 18 18" width="16" height="16" style="overflow:visible;">'
    + `<polygon points="0,-6.5 6,4.5 -6,4.5" fill="${VFR_COULEUR}"`
    + ` stroke="${VFR_LISERE}" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
  return L.divIcon({ className: 'vfr-marker', html: svg, iconSize: [16, 16], iconAnchor: [8, 8] });
}

// Une seule icône pour tous les repères : ils sont identiques par nature, et
// mille divIcon distincts pèseraient pour rien.
const _iconeVfr = iconePointVfr();

function infobullePointVfr(p) {
  const lignes = [`<div class="vfr-tt-ident">${escapeHtml(p.ident)}</div>`];
  if (p.description) lignes.push(`<div class="vfr-tt-desc">${escapeHtml(p.description)}</div>`);
  if (p.situation) lignes.push(`<div class="vfr-tt-situation">${escapeHtml(p.situation)}</div>`);
  return lignes.join('');
}

async function rafraichirPointsVfr() {
  if (!map || !pointsVfrLayer) return;

  if (!layerState.pointsVfr || map.getZoom() < ZOOM_MIN_COUCHES) {
    pointsVfrLayer.clearLayers();
    return;
  }

  await chargerPointsVfr();
  // La couche a pu être éteinte, ou la carte dézoomée, pendant le chargement.
  if (!layerState.pointsVfr || map.getZoom() < ZOOM_MIN_COUCHES) {
    pointsVfrLayer.clearLayers();
    return;
  }
  pointsVfrLayer.clearLayers();
  if (!pointsVfrCharges()) return;

  // Seuls les repères visibles sont posés. Sur la France entière au zoom 8 il y
  // en a une poignée à l'écran ; en poser mille pour en montrer dix coûterait à
  // chaque déplacement de carte.
  const b = map.getBounds();
  const ouest = b.getWest();
  for (const f of _pointsVfrData.features) {
    const [lon, lat] = f.geometry.coordinates;
    const lonVue = lonVersVue(lon, ouest);
    if (!b.contains([lat, lonVue])) continue;
    const marqueur = L.marker([lat, lonVue], { icon: _iconeVfr, interactive: true, keyboard: false });
    marqueur.bindTooltip(infobullePointVfr(f.properties), {
      direction: 'top', offset: [0, -8], className: 'vfr-tooltip', opacity: 1,
    });
    marqueur.addTo(pointsVfrLayer);
  }
}
