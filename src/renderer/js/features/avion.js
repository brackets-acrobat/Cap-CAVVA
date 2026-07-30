/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// avion.js — position de l'avion en temps réel.
// ============================================================

// Oriente l'image de l'avion selon le cap (degrés, sens horaire = nord 0°).
// On accumule une rotation NON bornée : à chaque image on n'ajoute que le plus
// court écart angulaire (±180°), pour que la transition CSS tourne toujours du
// bon côté et ne fasse pas un tour complet au passage 359°↔0°.
function orienterAvion(capDeg) {
  if (!planeMarker) return;
  const el = planeMarker.getElement();
  const img = el && el.firstElementChild;
  if (!img) return;
  const cap = Number.isFinite(capDeg) ? capDeg : 0;
  if (capPrecedent === null) {
    rotationAvion = cap;
  } else {
    let delta = cap - capPrecedent;
    delta = ((delta + 180) % 360 + 360) % 360 - 180;   // ramène à (-180°, +180°]
    rotationAvion += delta;
  }
  capPrecedent = cap;
  img.style.transform = `rotate(${rotationAvion}deg)`;
}

function majCarte(f) {
  if (!map || typeof f.lat !== 'number' || typeof f.lon !== 'number'
      || !isFinite(f.lat) || !isFinite(f.lon)) return;
  const ll = [f.lat, f.lon];
  if (!planeMarker) {
    planeMarker = L.marker(ll, { icon: planeIcon }).addTo(map);
    capPrecedent = null;   // nouveau marqueur → repart d'une orientation absolue
    map.setView(ll, 13);   // premier point : on cadre sur l'avion
  } else {
    planeMarker.setLatLng(ll);
    if (suiviActif && !suiviPause) map.panTo(ll);   // recentre (zoom inchangé)
  }
  // Tracé continu magenta, 3 px, qui suit l'avion.
  if (!planeTrack) {
    planeTrack = L.polyline([ll], { color: '#ff00ff', weight: 3 }).addTo(map);
  } else {
    planeTrack.addLatLng(ll);
  }
  orienterAvion(f.headingTrue);   // carte nord-VRAI → orienter l'avion en cap vrai (pas magnétique)
}

// Dernière trame reçue du simulateur. Les espaces aériens y lisent les trois
// références d'altitude (hauteur-sol, altitude vraie, altitude pression) pour
// juger si l'avion traverse réellement une zone — sans elle, ils retombent sur
// l'altitude de test saisie à la main.
let derniereTrame = null;

function viderScan() {
  derniereTrame = null;
  ['b-lat','b-lon','b-amsl'].forEach((id) => { $(id).textContent = '—'; });
  if (map && planeMarker) { map.removeLayer(planeMarker); planeMarker = null; }
  if (map && planeTrack) { map.removeLayer(planeTrack); planeTrack = null; }
  $('wind-indicator').hidden = true;
  _ventLastUpdate = 0;
  suiviPause = false;
  if (_suiviTimer) { clearTimeout(_suiviTimer); _suiviTimer = null; }
  capPrecedent = null;
  rotationAvion = 0;
}

function majScan(f) {
  derniereTrame = f;
  $('b-lat').textContent = fmt(f.lat, 5);
  $('b-lon').textContent = fmt(f.lon, 5);
  $('b-amsl').textContent = fmt(f.amslFt);
  majCarte(f);
  majVent(f);
  majLegActifDepuisAvion(f);   // séquencement du leg actif selon la position avion
}
