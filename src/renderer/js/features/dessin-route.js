/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// dessin-route.js — tracé de la route sur la carte.
// ============================================================

// Résout les ICAO (asynchrone) puis dessine la route. Garde anti-concurrence.
async function majLigneRoute(opts) {
  if (!routeLayer) return;
  const reqId = ++_routeReqId;
  const dep = await resoudrePointIcao($('icao-dep').value);
  const arr = await resoudrePointIcao($('icao-arr').value);
  if (reqId !== _routeReqId) return;   // une saisie plus récente a pris le relais
  _routeDep = dep; _routeArr = arr;
  dessinerRoute();
  rafraichirDeclinaison();   // recalcule la déclinaison puis ré-étiquette
  if (opts && opts.fit) centrerSurRoute();   // ex. ouverture d'un plan → recadre sur tout le tracé
}

// Recadre la carte pour englober l'entièreté du tracé (dép. + points tournants +
// arr.), longitudes déroulées (antiméridien géré comme pour le tracé). Compense
// le panneau « Plan de vol » s'il couvre le tiers droit.
function centrerSurRoute() {
  if (!map || !_routeDep || !_routeArr) return;
  const pts = [_routeDep, ...routeWaypoints, _routeArr];
  const disp = deroulerLons(pts);
  const bounds = L.latLngBounds(pts.map((p, i) => [p.lat, disp[i]]));
  if (!bounds.isValid()) return;
  const panW = legsPanelVisible() ? $('legs-panel').getBoundingClientRect().width : 0;
  map.fitBounds(bounds, {
    paddingTopLeft: [40, 40],
    paddingBottomRight: [40 + panW, 40],
    maxZoom: 12,
  });
}

// Dessine la route à partir des extrémités en cache (synchrone). `opts.wps`
// remplace les points tournants (prévisualisation pendant un drag) ;
// `opts.activeIdx` est l'index, dans la suite complète, du point déplacé.
function dessinerRoute(opts) {
  if (!routeLayer) return;
  routeLayer.clearLayers();
  const dep = _routeDep, arr = _routeArr;
  if (!dep || !arr) { if (!opts) { rafraichirTableauLegs(); mettreAJourProfilVertical(); } return; }   // route effacée → vide tableau + profil
  const wps = (opts && opts.wps) ? opts.wps : routeWaypoints;
  const activeIdx = (opts && Number.isFinite(opts.activeIdx)) ? opts.activeIdx : -1;

  // Suite complète : départ → points tournants → arrivée, longitudes d'affichage
  // déroulées (antiméridien).
  const points = [dep, ...wps, arr];
  const disp = deroulerLons(points);

  // Un segment par leg : bordure blanche (dessous) + trait coloré selon l'état du
  // leg (actif rouge / à venir magenta / fait gris). Clic-glisser → insertion d'un point.
  const nLeg = points.length - 1;
  const actLeg = nLeg > 0 ? Math.max(0, Math.min(_legActif, nLeg - 1)) : -1;
  for (let i = 0; i < points.length - 1; i++) {
    const latlngs = [[points[i].lat, disp[i]], [points[i + 1].lat, disp[i + 1]]];
    const legCol = i === actLeg ? LEG_COL_ACTIVE : (i < actLeg ? LEG_COL_PAST : LEG_COL_NEXT);
    L.polyline(latlngs, { color: '#ffffff', weight: 5, opacity: 1 }).addTo(routeLayer);
    const seg = L.polyline(latlngs, { color: legCol, weight: 3, opacity: 1 }).addTo(routeLayer);
    dessinerEtiquetteLeg(points[i], disp[i], points[i + 1], disp[i + 1]);
    const segIndex = i;
    seg.on('mouseover', () => { if (!_routeDragging) { seg.setStyle({ weight: 4 }); map.getContainer().style.cursor = 'crosshair'; } });
    seg.on('mouseout', () => { if (!_routeDragging) { seg.setStyle({ weight: 3 }); map.getContainer().style.cursor = ''; } });
    seg.on('mousedown', (e) => {
      if (e.originalEvent && e.originalEvent.button !== 0) return;   // clic gauche seulement
      L.DomEvent.stopPropagation(e);
      L.DomEvent.preventDefault(e);
      // Le point est inséré à segIndex ; il occupe l'index segIndex+1 dans la suite.
      dragPointTournant(
        (ll) => {   // temps réel : aperçu avec le point inséré sous le curseur
          const w = routeWaypoints.slice();
          w.splice(segIndex, 0, { lat: ll.lat, lon: wrapLon(ll.lng) });
          dessinerRoute({ wps: w, activeIdx: segIndex + 1 });
        },
        (ll) => {   // relâcher : enregistre le point tournant
          routeWaypoints.splice(segIndex, 0, { lat: ll.lat, lon: wrapLon(ll.lng) });
          dessinerRoute();
          rafraichirDeclinaison();
          verifierProximitePointTournant(segIndex);   // aimantation aéroport/navaid proche
        }
      );
    });
  }

  // Marqueurs des points tournants (déplaçables par clic-glisser).
  const noms = nomsPointsTournants(wps);
  for (let k = 0; k < wps.length; k++) {
    const ptIdx = k + 1;
    const actif = ptIdx === activeIdx;
    const m = L.circleMarker([wps[k].lat, disp[ptIdx]], {
      radius: actif ? 7 : 6, color: '#ffffff', weight: 2,
      fillColor: '#ff7043', fillOpacity: 0.95, opacity: 1,
    }).addTo(routeLayer);
    const idx = k;
    m.on('mouseover', () => { if (!_routeDragging) map.getContainer().style.cursor = 'grab'; });
    m.on('mouseout', () => { if (!_routeDragging) map.getContainer().style.cursor = ''; });
    m.on('mousedown', (e) => {
      if (e.originalEvent && e.originalEvent.button !== 0) return;   // clic gauche → déplacement
      L.DomEvent.stopPropagation(e);
      L.DomEvent.preventDefault(e);
      demarrerDeplacementPoint(idx);
    });
    m.on('contextmenu', (e) => {   // clic droit → suppression du point tournant
      if (e.originalEvent) e.originalEvent.preventDefault();
      L.DomEvent.stopPropagation(e);
      const p = ctxPageXY(e);
      ouvrirMenuContextuel(p.x, p.y, [
        { label: t('ctxDeleteWp'), action: () => supprimerPointTournant(idx) },
      ]);
    });
  }

  // Points d'extrémité hors-aéroport (ZZZY départ / ZZZZ arrivée) : point rouge.
  const depCode = nettoyerIcao($('icao-dep').value);
  const arrCode = nettoyerIcao($('icao-arr').value);
  if (depCode === 'ZZZY') dessinerPointExtremite(dep.lat, disp[0]);
  if (arrCode === 'ZZZZ') dessinerPointExtremite(arr.lat, disp[points.length - 1]);

  dessinerLabelsPoints(points, disp, wps, noms);   // noms rouges à côté des points (si place nette)

  if (!opts) { rafraichirTableauLegs(); mettreAJourProfilVertical(); }   // aperçu de drag → pas de reconstruction
}
