/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// carte.js — carte Leaflet : fonds, échelle, suivi de l'avion.
// ============================================================

// --- Carte (fond OpenTopoMap) ---
let map = null;
let planeMarker = null;
let planeTrack = null;    // tracé (polyline) accumulant les positions de l'avion
// Mode « suivi de l'avion » (bouton). Quand actif, l'avion reste au centre ;
// si l'utilisateur déplace la carte, on la laisse et on recentre 5 s plus tard.
let suiviActif = localStorage.getItem('cap-follow') === '1';
let suiviPause = false;      // déplacement utilisateur en cours → centrage suspendu
let _suiviTimer = null;      // minuteur de recentrage (5 s après déplacement)
let suiviBtnEl = null;       // bouton (pour l'état visuel actif)
const SUIVI_RECENTRE_MS = 5000;
let rotationAvion = 0;    // rotation CUMULÉE appliquée à l'icône (degrés, non bornée)
let capPrecedent = null;  // dernier cap brut reçu (pour calculer le plus court delta)

// Fonds de carte. OpenTopoMap par défaut : le relief compte pour un vol VFR.
// Dark Matter et Positron (CARTO) sont volontairement pâles — c'est le fond qui
// laisse le mieux lire les espaces aériens par-dessus, les vols de soirée.
let baseLayer = null;
const BASE_LAYERS = {
  opentopomap: {
    url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    options: { maxZoom: 17, attribution: '© OpenTopoMap (CC-BY-SA), © OpenStreetMap' },
  },
  openstreetmap: {
    url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    options: { maxZoom: 19, attribution: '© OpenStreetMap' },
  },
  darkmatter: {
    url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
    options: { maxZoom: 20, subdomains: 'abcd', attribution: '© OpenStreetMap, © CARTO' },
  },
  positron: {
    url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',
    options: { maxZoom: 20, subdomains: 'abcd', attribution: '© OpenStreetMap, © CARTO' },
  },
};

// Couches de données MSFS (aéroports / héliports / hydrobases / navaids).
let airportsLayer = null, heliportsLayer = null, seaplanesLayer = null, navaidsLayer = null;
let _couchesTimer = null, _airReqId = 0, _navReqId = 0;
const ZOOM_MIN_COUCHES = 8;
const TAILLES_AEROPORT = { large_airport: 9, medium_airport: 7, small_airport: 5, heliport: 6, seaplane_base: 6 };
// États des couches, persistés (off par défaut → on les fait apparaître via le menu)
const layerState = {
  airports:  localStorage.getItem('cap-layer-airports')  === '1',
  heliports: localStorage.getItem('cap-layer-heliports') === '1',
  seaplanes: localStorage.getItem('cap-layer-seaplanes') === '1',
  navaids:   localStorage.getItem('cap-layer-navaids')   === '1',
};

// Icône avion (vue de dessus, pointe vers le nord à 0°). Une <img> dans un
// divIcon : on la fait pivoter en CSS selon le cap (la rotation du marqueur
// lui-même entrerait en conflit avec le translate de positionnement de Leaflet).
const planeIcon = L.divIcon({
  className: 'plane-marker',
  html: '<img src="../img/icone40x40.png" alt="">',
  iconSize: [40, 40],
  iconAnchor: [20, 20],   // centre de l'image sur la position
});

// Barre d'échelle à trois unités (km, miles, NM). Leaflet ne fournit que le
// métrique et l'impérial : on étend L.Control.Scale pour ajouter une ligne NM
// (1 NM = 1852 m). Indépendante du fond : valable sur satellite, CARTO, OSM, topo.
const ScaleTriple = L.Control.Scale.extend({
  options: { metric: true, imperial: true, nautical: true },
  _addScales(options, className, container) {
    L.Control.Scale.prototype._addScales.call(this, options, className, container);
    if (options.nautical) { this._nScale = L.DomUtil.create('div', className, container); }
  },
  _updateScales(maxMeters) {
    L.Control.Scale.prototype._updateScales.call(this, maxMeters);
    if (this.options.nautical && maxMeters) { this._updateNautical(maxMeters); }
  },
  _updateNautical(maxMeters) {
    const maxNm = maxMeters / 1852;
    if (maxNm < 1) { this._updateScale(this._nScale, '', 0); return; }  // trop zoomé : pas de NM
    const nm = this._getRoundNum(maxNm);
    this._updateScale(this._nScale, nm + ' NM', nm / maxNm);
  },
});

function initMap() {
  map = L.map('map', { zoomControl: true }).setView([46.8, 2.5], 5);  // vue par défaut (France)
  appliquerFond(localStorage.getItem('cap-basemap') || 'opentopomap');  // OpenTopoMap par défaut
  new ScaleTriple({ position: 'bottomleft', maxWidth: 120 }).addTo(map);  // échelle km / mi / NM
  // Suivi : pendant un déplacement utilisateur, on suspend le centrage ; 5 s
  // après la fin du déplacement, on recentre sur l'avion. En mode libre, rien.
  map.on('dragstart', () => {
    if (!suiviActif) return;
    suiviPause = true;
    if (_suiviTimer) { clearTimeout(_suiviTimer); _suiviTimer = null; }
  });
  map.on('dragend', () => {
    if (!suiviActif) return;
    if (_suiviTimer) clearTimeout(_suiviTimer);
    _suiviTimer = setTimeout(() => { suiviPause = false; recentrerAvion(); }, SUIVI_RECENTRE_MS);
  });

  // Espaces aériens EN PREMIER : ils forment le fond documentaire, tout le reste
  // (terrains, cercles, route, avion) doit se lire par-dessus. Rendu sur un
  // canvas dédié — 2 200 polygones en SVG feraient ramer le déplacement.
  _espacesRenderer = L.canvas({ padding: 0.4 });
  espacesLayer   = L.layerGroup().addTo(map);

  // Couches de données + contrôles déroulants (haut-droite)
  airportsLayer  = L.layerGroup().addTo(map);
  heliportsLayer = L.layerGroup().addTo(map);
  seaplanesLayer = L.layerGroup().addTo(map);
  navaidsLayer   = L.layerGroup().addTo(map);
  _rangeLayer    = L.layerGroup().addTo(map);   // cercles de portée (magenta)
  _briefLayer    = L.layerGroup().addTo(map);   // rayon de départ et repères du brief (ambre)
  routeLayer     = L.layerGroup().addTo(map);   // ligne de route départ → arrivée
  ajouterBoutonSuivi();
  ajouterControlesCarte();
  map.on('moveend', planifierRafraichirCouches);
  map.on('zoomend', planifierRafraichirCouches);
  // Clic droit sur le fond de carte (hors marqueur) → départ (ZZZY) / arrivée (ZZZZ).
  map.on('contextmenu', ouvrirMenuFondCarte);
  map.on('movestart zoomstart', fermerMenuContextuel);
  // Au zoom, on ré-évalue l'affichage des étiquettes de leg (seuil de longueur).
  map.on('zoomend', () => dessinerRoute());
  brancherSondeEspaces();   // clic gauche → empilement des espaces à cet endroit
  rafraichirCouches();
}

// Applique (et persiste) le fond de carte. Le tileLayer va dans le tilePane,
// donc toujours SOUS les marqueurs.
function appliquerFond(key) {
  const def = BASE_LAYERS[key] || BASE_LAYERS.opentopomap;
  if (baseLayer) map.removeLayer(baseLayer);
  baseLayer = L.tileLayer(def.url, def.options).addTo(map);
  baseLayer.bringToBack();
  localStorage.setItem('cap-basemap', BASE_LAYERS[key] ? key : 'opentopomap');
}

// Recentre la carte sur l'avion (zoom inchangé).
function recentrerAvion() {
  if (map && planeMarker) map.panTo(planeMarker.getLatLng());
}

// Active/désactive le suivi (persisté). À l'activation, recentre tout de suite.
function setSuivi(on) {
  suiviActif = on;
  localStorage.setItem('cap-follow', on ? '1' : '0');
  suiviPause = false;
  if (_suiviTimer) { clearTimeout(_suiviTimer); _suiviTimer = null; }
  if (suiviBtnEl) suiviBtnEl.classList.toggle('active', on);
  if (on) recentrerAvion();
}

// Bouton de suivi de l'avion (haut-gauche, sous le contrôle de zoom).
function ajouterBoutonSuivi() {
  const ctl = L.control({ position: 'topleft' });
  ctl.onAdd = function () {
    const div = L.DomUtil.create('div', 'map-follow');
    div.innerHTML = `<button class="map-follow-btn" type="button" data-i18n-title="followTitle" title="${t('followTitle')}"><i class="ph-light ph-crosshair"></i></button>`;
    L.DomEvent.disableClickPropagation(div);
    suiviBtnEl = div.querySelector('.map-follow-btn');
    suiviBtnEl.classList.toggle('active', suiviActif);
    suiviBtnEl.addEventListener('click', () => setSuivi(!suiviActif));
    return div;
  };
  ctl.addTo(map);
}
