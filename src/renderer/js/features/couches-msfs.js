/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// couches-msfs.js — aéroports, héliports, hydrobases et navaids.
// Les données viennent des bases extraites de MSFS 2024 (import-msfs.js côté
// main). Icônes et code couleur repris à l'identique de NavXpressVFR.
// ============================================================

// ============================================================
// Couches MSFS : aéroports / héliports / hydrobases / navaids.
// Icônes et code couleur REPRIS À L'IDENTIQUE de NavXpressVFR.
// ============================================================
function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

// Décale une longitude [-180,180] vers la copie du monde visible (scroll infini).
function lonVersVue(lon, west) { return west + ((((lon - west) % 360) + 360) % 360); }

// Couleur du marqueur aéroport selon la surface de la piste principale (NavXpress).
function surfaceMarkerColors(surface) {
  const s = String(surface || '').toLowerCase();
  if (/grass/.test(s)) return { fill: '#00d700', stroke: '#0a5e0a', line: '#0a5e0a' };
  if (/dirt|gravel|sand|shale|coral|turf|earth|mud/.test(s)) return { fill: '#c07a00', stroke: '#5e3c00', line: '#5e3c00' };
  if (/water/.test(s)) return { fill: '#2970ff', stroke: '#0a2a66', line: '#0d4d6e' };
  if (/snow|ice/.test(s)) return { fill: '#33fff3', stroke: '#0a5e58', line: '#0a5e58' };
  if (/unknown/.test(s)) return { fill: '#9aa0a8', stroke: '#4b4f55', line: '#4b4f55' };
  return { fill: '#fff', stroke: '#000', line: '#000' };
}

function makeAirportIcon(airport) {
  if (airport.type === 'heliport') {
    const rh = TAILLES_AEROPORT.heliport, sizeH = rh * 2 + 12, fs = Math.round(rh * 1.7);
    const svgH = `<svg viewBox="-${sizeH / 2} -${sizeH / 2} ${sizeH} ${sizeH}" width="${sizeH}" height="${sizeH}" style="overflow:visible;">`
      + `<circle cx="0" cy="0" r="${rh}" fill="#fff" stroke="#000" stroke-width="1.6"/>`
      + `<text x="0" y="0" text-anchor="middle" dominant-baseline="central" font-family="Arial, sans-serif" font-weight="700" font-size="${fs}" fill="#000">H</text></svg>`;
    return L.divIcon({ className: 'airport-marker', html: svgH, iconSize: [sizeH, sizeH], iconAnchor: [sizeH / 2, sizeH / 2] });
  }
  if (airport.type === 'seaplane_base') {
    const rs = TAILLES_AEROPORT.seaplane_base, sizeS = rs * 2 + 12, extS = rs + 4;
    const headingS = airport.runway ? airport.runway.headingDegT : 0, hasRwyS = !!airport.runway;
    const svgS = `<svg viewBox="-${sizeS / 2} -${sizeS / 2} ${sizeS} ${sizeS}" width="${sizeS}" height="${sizeS}" style="overflow:visible;">`
      + (hasRwyS ? `<line x1="-${extS}" y1="0" x2="${extS}" y2="0" stroke="#0d4d6e" stroke-width="2.2" stroke-linecap="round" transform="rotate(${headingS - 90})"/>` : '')
      + `<circle cx="0" cy="0" r="${rs}" fill="#2970ff" stroke="#0a2a66" stroke-width="1.6"/></svg>`;
    return L.divIcon({ className: 'airport-marker', html: svgS, iconSize: [sizeS, sizeS], iconAnchor: [sizeS / 2, sizeS / 2] });
  }
  const r = TAILLES_AEROPORT[airport.type] || 5, size = r * 2 + 12;
  const heading = airport.runway ? airport.runway.headingDegT : 0, hasRunway = !!airport.runway;
  const lineExtent = r + 4, rotation = heading - 90;
  const sc = surfaceMarkerColors(airport.runway && airport.runway.surface);
  const svg = `<svg viewBox="-${size / 2} -${size / 2} ${size} ${size}" width="${size}" height="${size}" style="overflow:visible;">`
    + (hasRunway ? `<line x1="-${lineExtent}" y1="0" x2="${lineExtent}" y2="0" stroke="${sc.line}" stroke-width="2.2" stroke-linecap="round" transform="rotate(${rotation})"/>` : '')
    + `<circle cx="0" cy="0" r="${r}" fill="${sc.fill}" stroke="${sc.stroke}" stroke-width="1.6"/></svg>`;
  return L.divIcon({ className: 'airport-marker', html: svg, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

function makeAirportTooltipHtml(a) {
  const fr = currentLang === 'fr';
  const code = a.code || a.ident || '';
  const lignes = [];
  if (Number.isFinite(a.elevation_ft)) {
    lignes.push(`<div class="ap-tt-rwy">${fr ? 'Altitude' : 'Elevation'} : ${a.elevation_ft} ft</div>`);
  }
  if (a.runway) {
    const r = a.runway;
    // Numéros de piste (le_ident/he_ident, ex. « 08/26 »).
    lignes.push(`<div class="ap-tt-rwy">${fr ? 'Piste' : 'Runway'} ${escapeHtml(r.name)}</div>`);
    if (Number.isFinite(r.length_ft)) {
      const ft = Math.round(r.length_ft);
      const m = Math.round(ft * 0.3048);
      lignes.push(`<div class="ap-tt-rwy">${fr ? 'Longueur' : 'Length'} : ${ft} ft / ${m} m</div>`);
    }
    if (r.surface) {
      lignes.push(`<div class="ap-tt-rwy">${fr ? 'Surface' : 'Surface'} : ${escapeHtml(r.surface)}</div>`);
    }
  }
  return `<div class="ap-tt-icao">${escapeHtml(code)}</div><div class="ap-tt-name">${escapeHtml(a.name)}</div>${lignes.join('')}`;
}

function formatNavaidFreq(type, freqKhz) {
  if (!freqKhz || !Number.isFinite(freqKhz) || freqKhz <= 0) return '—';
  if (type === 'NDB' || type === 'NDB-DME') return Math.round(freqKhz) + ' kHz';
  return (freqKhz / 1000).toFixed(2) + ' MHz';
}

function makeNavaidIcon(navaid) {
  const C = '#1565c0', size = 22, sw = 1.6;
  const hexPts = '-7,4 -7,-4 0,-8 7,-4 7,4 0,8';
  const hexInsidePts = '-5,2.9 -5,-2.9 0,-5.8 5,-2.9 5,2.9 0,5.8';
  let inner = '';
  switch (navaid.type) {
    case 'VOR':
      inner = `<polygon points="${hexPts}" fill="#fff" stroke="${C}" stroke-width="${sw}"/><circle cx="0" cy="0" r="1.6" fill="${C}"/>`; break;
    case 'VOR-DME':
      inner = `<rect x="-9" y="-9" width="18" height="18" fill="#fff" stroke="${C}" stroke-width="${sw}"/><polygon points="${hexInsidePts}" fill="#fff" stroke="${C}" stroke-width="1.3"/><circle cx="0" cy="0" r="1.4" fill="${C}"/>`; break;
    case 'VORTAC':
      inner = `<rect x="-2.6" y="-11" width="5.2" height="3" fill="${C}"/><rect x="-2.6" y="-1.5" width="5.2" height="3" fill="${C}" transform="rotate(120 0 0) translate(0 9.5)"/><rect x="-2.6" y="-1.5" width="5.2" height="3" fill="${C}" transform="rotate(-120 0 0) translate(0 9.5)"/><polygon points="${hexPts}" fill="#fff" stroke="${C}" stroke-width="${sw}"/><circle cx="0" cy="0" r="1.6" fill="${C}"/>`; break;
    case 'TACAN':
      inner = `<polygon points="0,-8 7,5 -7,5" fill="#fff" stroke="${C}" stroke-width="${sw}"/><circle cx="0" cy="1" r="1.4" fill="${C}"/>`; break;
    case 'NDB':
      inner = `<circle cx="0" cy="0" r="7" fill="#fff" stroke="${C}" stroke-width="1.5" stroke-dasharray="1.8 1.8"/><circle cx="0" cy="0" r="1.8" fill="${C}"/>`; break;
    case 'NDB-DME':
      inner = `<rect x="-9" y="-9" width="18" height="18" fill="#fff" stroke="${C}" stroke-width="${sw}"/><circle cx="0" cy="0" r="5.5" fill="#fff" stroke="${C}" stroke-width="1.4" stroke-dasharray="1.6 1.6"/><circle cx="0" cy="0" r="1.6" fill="${C}"/>`; break;
    default: // DME
      inner = `<rect x="-7" y="-7" width="14" height="14" fill="#fff" stroke="${C}" stroke-width="${sw}"/><text x="0" y="3.5" text-anchor="middle" fill="${C}" font-size="8" font-weight="bold" font-family="Arial, sans-serif">D</text>`; break;
  }
  const svg = `<svg viewBox="-12 -12 24 24" width="${size}" height="${size}" style="overflow:visible;">${inner}</svg>`;
  return L.divIcon({ className: 'navaid-marker', html: svg, iconSize: [size, size], iconAnchor: [size / 2, size / 2] });
}

function makeNavaidTooltipHtml(n) {
  const freq = formatNavaidFreq(n.type, n.freqKhz);
  const range = Number.isFinite(n.rangeNm) ? `<div class="nv-tt-range">${n.rangeNm} NM</div>` : '';
  return `<div class="nv-tt-ident">${escapeHtml(n.ident)}</div><div class="nv-tt-type">${escapeHtml(n.type)}</div><div class="nv-tt-freq">${freq}</div>${range}`;
}

function planifierRafraichirCouches() {
  if (_couchesTimer) clearTimeout(_couchesTimer);
  _couchesTimer = setTimeout(rafraichirCouches, 200);
}

function rafraichirCouches() {
  rafraichirAeroports();
  rafraichirNavaids();
}

async function rafraichirAeroports() {
  if (!map) return;
  if (!layerState.airports && !layerState.heliports && !layerState.seaplanes) {
    airportsLayer.clearLayers(); heliportsLayer.clearLayers(); seaplanesLayer.clearLayers(); return;
  }
  if (map.getZoom() < ZOOM_MIN_COUCHES) {
    airportsLayer.clearLayers(); heliportsLayer.clearLayers(); seaplanesLayer.clearLayers(); return;
  }
  const b = map.getBounds();
  const bbox = { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
  const reqId = ++_airReqId;
  let res;
  try { res = await window.cap.aeroportsDansBbox(bbox); } catch (_) { return; }
  if (reqId !== _airReqId) return;
  airportsLayer.clearLayers(); heliportsLayer.clearLayers(); seaplanesLayer.clearLayers();
  if (!res || !res.ok) return;
  for (const a of res.airports) {
    const isHeli = a.type === 'heliport', isSea = a.type === 'seaplane_base';
    const enabled = isHeli ? layerState.heliports : isSea ? layerState.seaplanes : layerState.airports;
    if (!enabled) continue;
    const marker = L.marker([a.lat, lonVersVue(a.lon, bbox.west)], { icon: makeAirportIcon(a), interactive: true, keyboard: false });
    marker.bindTooltip(makeAirportTooltipHtml(a), { direction: 'top', offset: [0, -8], className: 'airport-tooltip', opacity: 1 });
    marker.on('contextmenu', (ev) => ouvrirMenuAeroport(a, ev));   // clic droit → départ/arrivée
    // Clic gauche sur un aéroport qui EST un point tournant (aimanté) → le déplacer
    // comme les autres (l'icône d'aéroport recouvre sinon le marqueur du point).
    marker.on('mousedown', (ev) => {
      if (ev.originalEvent && ev.originalEvent.button !== 0) return;
      const code = (a.code || a.ident || '').toUpperCase();
      const k = routeWaypoints.findIndex((w) => (w.code || '').toUpperCase() === code);
      if (k < 0) return;   // pas un point tournant → comportement normal
      L.DomEvent.stopPropagation(ev);
      L.DomEvent.preventDefault(ev);
      demarrerDeplacementPoint(k);
    });
    marker.addTo(isHeli ? heliportsLayer : isSea ? seaplanesLayer : airportsLayer);
  }
}

async function rafraichirNavaids() {
  if (!map) return;
  if (!layerState.navaids) { navaidsLayer.clearLayers(); return; }
  if (map.getZoom() < ZOOM_MIN_COUCHES) { navaidsLayer.clearLayers(); return; }
  const b = map.getBounds();
  const bbox = { south: b.getSouth(), west: b.getWest(), north: b.getNorth(), east: b.getEast() };
  const reqId = ++_navReqId;
  let res;
  try { res = await window.cap.navaidsDansBbox(bbox); } catch (_) { return; }
  if (reqId !== _navReqId) return;
  navaidsLayer.clearLayers();
  if (!res || !res.ok) return;
  for (const n of res.navaids) {
    const marker = L.marker([n.lat, lonVersVue(n.lon, bbox.west)], { icon: makeNavaidIcon(n), interactive: true, keyboard: false });
    marker.bindTooltip(makeNavaidTooltipHtml(n), { direction: 'top', offset: [0, -8], className: 'navaid-tooltip', opacity: 1 });
    marker.on('contextmenu', (e) => ouvrirMenuNavaid(e, n));   // arrivée ZZZZ + cercle de portée
    marker.addTo(navaidsLayer);
  }
}
