/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// cercles-portee.js — cercles de portée et de rayon.
// Repris de NavXpressVFR. Sert aussi, au jalon 4, à tracer le rayon de départ
// annoncé par le brief de la séance.
// ============================================================

// Cercles de portée (repris de NavXpressVFR). Anneau magenta #FF00FF (ép.2, sans
// remplissage) ; le cercle MANUEL ajoute un point central plein (8px). Le cercle
// NAVAID utilise sa portée publiée (rangeNm), centré sur le navaid (pas de point,
// son icône marque déjà le centre). Les cercles s'accumulent ; effacés par le menu
// ou par « Nouveau plan ».
// ============================================================
const MAGENTA = '#ff00ff';
let _rangeLayer = null;          // créé dans initMap
let _rangePendingLatLng = null;  // centre en attente (modale de saisie ouverte)

function tracerCercle(lat, lon, nm, avecPoint) {
  if (!_rangeLayer || !Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(nm) || nm <= 0) return;
  const rayonM = nm * 1852;
  // Trait visible (non interactif).
  const visible = L.circle([lat, lon], { radius: rayonM, color: MAGENTA, weight: 2, opacity: 1, fill: false, interactive: false }).addTo(_rangeLayer);
  // Bande de clic invisible centrée sur le trait : ép. 4 = trait (2px) + 1px de
  // chaque côté (magnétisme). Trait « transparent » (≠ none) → cliquable même
  // invisible. Porte le menu contextuel du cercle.
  const hit = L.circle([lat, lon], { radius: rayonM, color: 'transparent', weight: 4, opacity: 1, fill: false, interactive: true }).addTo(_rangeLayer);
  let dot = null;
  if (avecPoint) {
    dot = L.circleMarker([lat, lon], { radius: 4, stroke: false, fill: true, fillColor: MAGENTA, fillOpacity: 1, interactive: false }).addTo(_rangeLayer);
  }
  const supprimer = () => {
    _rangeLayer.removeLayer(visible);
    _rangeLayer.removeLayer(hit);
    if (dot) _rangeLayer.removeLayer(dot);
  };
  hit.on('contextmenu', (e) => ouvrirMenuCercle(e, supprimer));
  hit.on('mouseover', () => { if (!_routeDragging) map.getContainer().style.cursor = 'pointer'; });
  hit.on('mouseout', () => { if (!_routeDragging) map.getContainer().style.cursor = ''; });
}

function tracerCercleNavaid(navaid) {
  if (navaid) tracerCercle(navaid.lat, navaid.lon, navaid.rangeNm, false);
}

function aDesCercles() { return !!_rangeLayer && _rangeLayer.getLayers().length > 0; }
function effacerCercles() { if (_rangeLayer) _rangeLayer.clearLayers(); }

function ouvrirModaleCercle(latlng) {
  _rangePendingLatLng = latlng;
  $('range-radius').value = '';
  $('range-error').textContent = '';
  $('range-overlay').hidden = false;
  setTimeout(() => { try { $('range-radius').focus(); } catch (_) {} }, 50);
}
function fermerModaleCercle() { $('range-overlay').hidden = true; _rangePendingLatLng = null; }
function validerCercle() {
  if (!_rangePendingLatLng) return;
  const nm = parseFloat(String($('range-radius').value || '').trim().replace(',', '.'));
  if (!Number.isFinite(nm) || nm <= 0) { $('range-error').textContent = t('rangeInvalid'); return; }
  tracerCercle(_rangePendingLatLng.lat, _rangePendingLatLng.lng, nm, true);
  fermerModaleCercle();
}

$('btn-range-ok').addEventListener('click', validerCercle);
$('btn-range-cancel').addEventListener('click', fermerModaleCercle);
$('range-radius').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); validerCercle(); }
  else if (e.key === 'Escape') { e.preventDefault(); fermerModaleCercle(); }
});
