/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// points-tournants.js — création, glisser, aimantation, suppression.
// ============================================================

// --- Aimantation d'un point tournant sur un aéroport / navaid proche ---
const SNAP_RAYON_NM = 0.2;
let _snapIndex = -1;        // index (dans routeWaypoints) du point concerné
let _snapFeature = null;    // feature proposé (aéroport/navaid)

// Après création/déplacement d'un point tournant : si un aéroport ou un navaid
// est à moins de SNAP_RAYON_NM, propose de l'aimanter dessus (modale).
async function verifierProximitePointTournant(index) {
  if (index < 0 || index >= routeWaypoints.length) return;
  const pt = routeWaypoints[index];
  let best = null;
  let res;
  try { res = await window.cap.featureProche(pt.lat, pt.lon, SNAP_RAYON_NM); } catch (_) { res = null; }
  if (res && res.ok && res.found && res.feature) best = res.feature;
  if (!best) return;
  _snapIndex = index;
  _snapFeature = best;
  const kindKey = best.kind === 'airport' ? 'snapAirport' : 'snapNavaid';
  const label = (best.code && best.code !== best.name) ? `${best.name} (${best.code})` : best.name;
  const dist = best.distNm < 0.1 ? best.distNm.toFixed(2) : best.distNm.toFixed(1);
  $('snap-text').textContent = t('snapText')
    .replace('{kind}', t(kindKey)).replace('{dist}', dist).replace('{feature}', label);
  $('snap-overlay').hidden = false;
}

function fermerModaleSnap() {
  $('snap-overlay').hidden = true;
  _snapIndex = -1; _snapFeature = null;
}

// Validation : place le point tournant sur les coordonnées du feature.
$('btn-snap-ok').addEventListener('click', () => {
  if (_snapIndex >= 0 && _snapIndex < routeWaypoints.length && _snapFeature) {
    // Point aimanté : on garde le code (ICAO/ident) → il servira de nom du point.
    routeWaypoints[_snapIndex] = { lat: _snapFeature.lat, lon: wrapLon(_snapFeature.lon), code: _snapFeature.code || null };
    dessinerRoute();
    rafraichirDeclinaison();
  }
  fermerModaleSnap();
});
$('btn-snap-cancel').addEventListener('click', fermerModaleSnap);   // garde la position posée

// Drag manuel (events DOM natifs). `appliquer(latlng)` est appelé à chaque
// déplacement (prévisualisation temps réel), `valider(latlng)` au relâcher.
function dragPointTournant(appliquer, valider) {
  if (_routeDragging) return;
  _routeDragging = true;
  map.dragging.disable();
  map.getContainer().style.cursor = 'grabbing';
  function latlngFromEvent(ev) {
    const rect = map.getContainer().getBoundingClientRect();
    const pt = L.point(ev.clientX - rect.left, ev.clientY - rect.top);
    return map.containerPointToLatLng(pt);
  }
  function onMove(ev) { appliquer(latlngFromEvent(ev)); }
  function onUp(ev) {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    map.dragging.enable();
    map.getContainer().style.cursor = '';
    _routeDragging = false;
    valider(latlngFromEvent(ev));
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

// Démarre le déplacement (clic-glisser) du point tournant d'index k. Réutilisé
// par le marqueur du point ET par le clic gauche sur un aéroport qui est ce point.
function demarrerDeplacementPoint(k) {
  if (k < 0 || k >= routeWaypoints.length) return;
  const nom = routeWaypoints[k].nom;   // nom personnalisé : conservé au déplacement (contrairement au code aimanté)
  const alt = routeWaypoints[k].alt;   // altitude de leg : conservée elle aussi
  dragPointTournant(
    (ll) => {   // temps réel : déplace le point dans l'aperçu
      const w = routeWaypoints.slice();
      w[k] = { lat: ll.lat, lon: wrapLon(ll.lng), nom, alt };
      dessinerRoute({ wps: w, activeIdx: k + 1 });
    },
    (ll) => {   // relâcher : enregistre la nouvelle position (perd le code aimanté, garde le nom et l'altitude)
      routeWaypoints[k] = { lat: ll.lat, lon: wrapLon(ll.lng), nom, alt };
      dessinerRoute();
      rafraichirDeclinaison();
      verifierProximitePointTournant(k);   // aimantation aéroport/navaid proche
    }
  );
}

// Supprime le point tournant d'index k.
function supprimerPointTournant(k) {
  if (k < 0 || k >= routeWaypoints.length) return;
  routeWaypoints.splice(k, 1);
  dessinerRoute();
  rafraichirDeclinaison();
}

// Petit point rouge (rayon 6, contour blanc 1px) sur une extrémité hors-aéroport
// (départ ZZZY / arrivée ZZZZ) — il n'y a pas d'icône d'aéroport à cet endroit.
function dessinerPointExtremite(lat, lonDisp) {
  L.circleMarker([lat, lonDisp], {
    radius: 6, color: '#ffffff', weight: 1,
    fillColor: '#ff0000', fillOpacity: 1, opacity: 1, interactive: false,
  }).addTo(routeLayer);
}
