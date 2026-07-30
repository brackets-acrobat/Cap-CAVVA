/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// profil-vertical.js — profil du relief le long de la route.
// ============================================================

// ============================================================
// Profil vertical — relief GLOBE + altitudes prévues le long du plan.
// Adapté de NavXpressVFR : échantillonnage relief côté main (window.cap.profilVertical),
// dessin SVG côté renderer (aire relief + altitude prévue en escalier + altitude
// de sécurité par leg + survol). Se rafraîchit avec le plan et les altitudes.
// ============================================================
let _vpLast = null;   // dernier résultat (re-rendu au resize / basculement legs)
let _vpRender = null; // géométrie du dernier rendu (pour le survol)
let _vpSig = null;    // signature plan+altitudes (anti-recalcul)

function vpPanelVisible() {
  const p = $('vp-panel');
  return p && !p.hidden;
}

// Waypoints (dép. + points tournants + arr.) avec leurs noms, pour l'échantillonnage.
function vpWaypoints() {
  if (!_routeDep || !_routeArr) return [];
  const noms = nomsPointsTournants(routeWaypoints);
  const depName = nettoyerIcao($('icao-dep').value) || '';
  const arrName = nettoyerIcao($('icao-arr').value) || '';
  const pts = [_routeDep, ...routeWaypoints, _routeArr];
  return pts.map((p, i) => ({
    lat: p.lat, lon: p.lon,
    name: i === 0 ? depName : (i === pts.length - 1 ? arrName : noms[i - 1]),
  }));
}

// Altitudes au format du handler : legAlt[i] = altitude du leg wp[i-1] → wp[i].
// (backcountry : getLegAlt est 0-indexé par leg → décalage de 1.)
function vpLegAltitudes(nWps) {
  const arr = [null];
  for (let i = 1; i < nWps; i++) arr.push(getLegAlt(i - 1));
  return arr;
}

async function mettreAJourProfilVertical() {
  const host = $('vertical-profile-graph');
  if (!host || !vpPanelVisible()) return;

  const wps = vpWaypoints();
  if (wps.length < 2) {
    _vpLast = null; _vpSig = null;
    host.innerHTML = `<div class="vp-empty">${escapeHtml(t('vertProfileEmpty'))}</div>`;
    _vpMajHauteur();
    return;
  }
  const legAlt = vpLegAltitudes(wps.length);

  // Anti-recalcul : re-rend depuis le cache tant que plan + altitudes inchangés.
  const sig = JSON.stringify({ w: wps.map((p) => [p.lat, p.lon, p.name]), a: legAlt });
  if (sig === _vpSig && _vpLast) { _renderProfilInto(host, _vpLast); return; }

  // Une erreur du process principal doit S'AFFICHER. Un `catch` muet ici a déjà
  // caché une faute d'une seule ligne pendant tout un jalon : le panneau restait
  // vide sans rien dire, et le relief était accusé à tort.
  let res;
  try {
    res = await window.cap.profilVertical({ waypoints: wps, legAltitudes: legAlt });
  } catch (err) {
    _vpLast = null; _vpSig = null;
    host.innerHTML = `<div class="vp-empty">${escapeHtml(
      t('vertProfileError').replace('{err}', (err && err.message) || String(err)))}</div>`;
    _vpMajHauteur();
    return;
  }

  if (!res || !res.ok || !Array.isArray(res.dist) || res.dist.length < 2) {
    _vpLast = null; _vpSig = null;
    host.innerHTML = `<div class="vp-empty">${escapeHtml(t('vertProfileNoData'))}</div>`;
    _vpMajHauteur();
    return;
  }
  _vpLast = res; _vpSig = sig;
  _renderProfilInto(host, res);
}

function _renderProfilInto(host, res) {
  host.innerHTML = renderProfileSummary(res) + renderProfileSVG(res);
  _attachProfileHover(host);
  _vpMajHauteur();
}

// Publie la hauteur réelle du panneau profil dans --vp-h (sur <main>), pour que
// les contrôles Leaflet du bas (barre d'échelle) soient remontés juste au-dessus.
function _vpMajHauteur() {
  const panel = $('vp-panel');
  if (panel) document.querySelector('main').style.setProperty('--vp-h', panel.offsetHeight + 'px');
}

// Bandeau texte : point culminant de la route + marge mini réelle ; alerte si un
// leg passe sous son altitude de sécurité.
function renderProfileSummary(res) {
  const s = res && res.summary;
  if (!s) return '';
  let txt = `${t('vertProfileSummit')} ${s.summitFt} ft`;
  if (s.minMargin) txt += ` · ${t('vertProfileMinMargin')} ${s.minMargin.clearanceFt} ft`;
  const cls = s.anyBreach ? 'vp-summary vp-summary-warn' : 'vp-summary';
  return `<div class="${cls}">${escapeHtml(txt)}${s.anyBreach ? ' <i class="ph-light ph-warning" aria-hidden="true"></i>' : ''}</div>`;
}

function renderProfileSVG(res) {
  const host = $('vertical-profile-graph');
  const W = Math.max(320, (host && host.clientWidth) || 600);
  const H = 168;
  const m = { l: 46, r: 12, t: 12, b: 28 };
  const iw = W - m.l - m.r;
  const ih = H - m.t - m.b;

  const dist = res.dist, terr = res.terrain, plan = res.planned;
  const totalNM = res.totalNM || dist[dist.length - 1] || 1;

  let yMax = 0;
  for (const v of terr) if (v > yMax) yMax = v;
  for (const v of plan) if (v > yMax) yMax = v;
  if (Array.isArray(res.legs)) for (const lg of res.legs) if (lg.safeAltFt > yMax) yMax = lg.safeAltFt;
  yMax = Math.max(1000, yMax * 1.12);
  yMax = Math.ceil(yMax / 500) * 500;

  const X = (d) => m.l + (d / totalNM) * iw;
  const Y = (ft) => m.t + ih - (Math.max(0, ft) / yMax) * ih;

  _vpRender = { W, H, m, iw, ih, yMax, totalNM, dist, terr, legs: res.legs };

  // Espaces aériens traversés. Le relief est interpolé depuis le profil : c'est
  // lui qui donne leur hauteur réelle aux limites référencées sol.
  const blocsEspaces = calculerEspacesProfil(vpWaypoints());
  const espacesSvg = rendreEspacesProfil(blocsEspaces, X, Y, _terrainAtDist, yMax);

  let area = `M ${X(dist[0]).toFixed(1)} ${Y(0).toFixed(1)}`;
  for (let i = 0; i < dist.length; i++) area += ` L ${X(dist[i]).toFixed(1)} ${Y(terr[i]).toFixed(1)}`;
  area += ` L ${X(dist[dist.length - 1]).toFixed(1)} ${Y(0).toFixed(1)} Z`;

  let tline = '';
  for (let i = 0; i < dist.length; i++) tline += (i ? ' L ' : 'M ') + X(dist[i]).toFixed(1) + ' ' + Y(terr[i]).toFixed(1);

  let pline = '';
  for (let i = 0; i < dist.length; i++) pline += (i ? ' L ' : 'M ') + X(dist[i]).toFixed(1) + ' ' + Y(plan[i]).toFixed(1);

  let safeLines = '', breachBands = '';
  if (Array.isArray(res.legs)) {
    for (const lg of res.legs) {
      const x0 = X(lg.dStart), x1 = X(lg.dEnd), ys = Y(lg.safeAltFt);
      if (lg.breach) {
        const yp = Y(lg.plannedFt);
        breachBands += `<rect x="${x0.toFixed(1)}" y="${ys.toFixed(1)}" width="${(x1 - x0).toFixed(1)}" `
          + `height="${Math.max(0, yp - ys).toFixed(1)}" fill="#e11900" fill-opacity="0.13"/>`;
      }
      const col = lg.breach ? '#e11900' : '#b91500';
      safeLines += `<line x1="${x0.toFixed(1)}" y1="${ys.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${ys.toFixed(1)}" stroke="${col}" stroke-width="1.6"/>`;
    }
  }

  let grid = '', ylabels = '';
  for (const yt of [0, yMax / 2, yMax]) {
    const yy = Y(yt).toFixed(1);
    grid += `<line x1="${m.l}" y1="${yy}" x2="${W - m.r}" y2="${yy}" stroke="#e2e8f0" stroke-width="1"/>`;
    ylabels += `<text x="${m.l - 4}" y="${(Y(yt) + 3).toFixed(1)}" text-anchor="end" font-size="9" fill="#64748b">${Math.round(yt)}</text>`;
  }

  let wpLines = '', wpLabels = '';
  const wps = res.waypoints || [];
  for (let i = 0; i < wps.length; i++) {
    const x = X(wps[i].d).toFixed(1);
    wpLines += `<line x1="${x}" y1="${m.t}" x2="${x}" y2="${m.t + ih}" stroke="#cbd5e1" stroke-width="1" stroke-dasharray="2,3"/>`;
    const anchor = i === 0 ? 'start' : (i === wps.length - 1 ? 'end' : 'middle');
    const name = (wps[i].name || '').slice(0, 8);
    wpLabels += `<text x="${x}" y="${H - 14}" text-anchor="${anchor}" font-size="9" fill="#64748b">${escapeHtml(name)}</text>`;
  }

  return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" xmlns="http://www.w3.org/2000/svg" `
    + `style="background:#f8fafc;border:1px solid #cbd5e1;border-radius:6px">`
    + grid + breachBands
    // Les espaces d'abord : le relief et la route se lisent PAR-DESSUS eux.
    + espacesSvg
    + `<path d="${area}" fill="#d7e0cc" fill-opacity="0.9"/>`
    + `<path d="${tline}" fill="none" stroke="#6e8552" stroke-width="1.3"/>`
    + wpLines
    // Altitude prévue : magenta bordé de blanc, comme la route sur la carte.
    // Deux tracés superposés — le blanc dessous, 1 px plus large de chaque côté,
    // avec le MÊME pointillé pour que chaque tiret garde son liseré.
    + `<path d="${pline}" fill="none" stroke="#ffffff" stroke-width="4" stroke-dasharray="6,3"/>`
    + `<path d="${pline}" fill="none" stroke="#ff00ff" stroke-width="2" stroke-dasharray="6,3"/>`
    + safeLines
    + _vpLegend(W, m)
    + ylabels + wpLabels
    + `<text x="${m.l}" y="${m.t - 3}" font-size="9" fill="#64748b">ft</text>`
    + `</svg>`;
}

// Légende (relief / altitude prévue / sécurité / espaces) en haut à droite.
function _vpLegend(W, m) {
  const lx = W - m.r - 320, y = m.t + 6;
  const item = (dx, dessin, cle) =>
    dessin + `<text x="${lx + dx + 18}" y="${y + 3}" font-size="9" fill="#64748b">${escapeHtml(t(cle))}</text>`;

  return item(0, `<line x1="${lx}" y1="${y}" x2="${lx + 14}" y2="${y}" stroke="#6e8552" stroke-width="2"/>`, 'vertProfileTerrain')
    + item(70, `<line x1="${lx + 70}" y1="${y}" x2="${lx + 84}" y2="${y}" stroke="#ffffff" stroke-width="4" stroke-dasharray="5,3"/>`
             + `<line x1="${lx + 70}" y1="${y}" x2="${lx + 84}" y2="${y}" stroke="#ff00ff" stroke-width="2" stroke-dasharray="5,3"/>`, 'vertProfilePlanned')
    + item(150, `<line x1="${lx + 150}" y1="${y}" x2="${lx + 164}" y2="${y}" stroke="#e11900" stroke-width="2"/>`, 'vertProfileSafe')
    + item(230, `<rect x="${lx + 230}" y="${y - 4}" width="14" height="8" fill="#e02b2b" fill-opacity="0.26" stroke="#e02b2b" stroke-width="1"/>`, 'vertProfileAirspace');
}

function _terrainAtDist(d) {
  if (!_vpRender) return null;
  const { dist, terr } = _vpRender;
  if (!dist || !terr || dist.length === 0) return null;
  const n = dist.length;
  if (d <= dist[0]) return terr[0];
  if (d >= dist[n - 1]) return terr[n - 1];
  for (let i = 1; i < n; i++) {
    if (d <= dist[i]) {
      const span = (dist[i] - dist[i - 1]) || 1;
      return terr[i - 1] + (terr[i] - terr[i - 1]) * ((d - dist[i - 1]) / span);
    }
  }
  return terr[n - 1];
}

function _legAtDist(d) {
  if (!_vpRender || !Array.isArray(_vpRender.legs)) return null;
  const legs = _vpRender.legs;
  for (const lg of legs) if (d >= lg.dStart && d <= lg.dEnd) return lg;
  return legs.length ? legs[legs.length - 1] : null;
}

function _attachProfileHover(host) {
  if (!host || !_vpRender) return;
  const svg = host.querySelector('svg');
  if (!svg) return;
  host.style.position = 'relative';

  const tip = document.createElement('div');
  tip.className = 'vp-terrain-tooltip';
  tip.style.cssText = 'position:absolute;display:none;pointer-events:none;z-index:5;'
    + 'background:#fff;border:1px solid #cbd5e1;color:#1f2933;font-size:11px;line-height:1.35;'
    + 'padding:3px 7px;border-radius:4px;white-space:nowrap;transform:translate(-50%,-130%);'
    + 'box-shadow:0 2px 8px rgba(15,23,42,.18);';
  host.appendChild(tip);

  const { W, H, m, iw, ih, yMax, totalNM } = _vpRender;
  const Yof = (ft) => m.t + ih - (Math.max(0, ft) / yMax) * ih;

  function onMove(ev) {
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const sx = (ev.clientX - rect.left) * (W / rect.width);
    const sy = (ev.clientY - rect.top) * (H / rect.height);
    const bottomY = m.t + ih;
    if (sx < m.l || sx > W - m.r || sy < m.t || sy > bottomY + 1) { tip.style.display = 'none'; return; }

    let d = ((sx - m.l) / iw) * totalNM;
    if (d < 0) d = 0; else if (d > totalNM) d = totalNM;

    const lg = _legAtDist(d);
    let html = '';
    if (lg) html += `<span style="color:#b91500">${escapeHtml(t('vertProfileSafeFull'))} : ${lg.safeAltFt} ft</span>`;
    if (lg && Math.abs(sy - Yof(lg.plannedFt)) <= 4) {
      html += `${html ? '<br>' : ''}<span style="color:#b45309">${escapeHtml(t('vertProfilePlannedFull'))} : ${lg.plannedFt} ft</span>`;
    }
    const elev = _terrainAtDist(d);
    if (elev != null && sy >= Yof(elev) - 1) {
      html += `${html ? '<br>' : ''}<span style="color:#4a5c33">${escapeHtml(t('vertProfileGround'))} ${Math.round(elev)} ft</span>`;
    }

    // Espaces englobant le point survolé : leur nom, leur tranche verticale.
    // C'est ce qui remplace les étiquettes là où le bloc est trop étroit.
    const altSurvol = ((m.t + ih - sy) / ih) * yMax;
    for (const z of espacesAuSurvol(d, altSurvol, _terrainAtDist)) {
      html += `${html ? '<br>' : ''}<span style="color:${z.fam.couleur}">`
        + `${escapeHtml(`${z.p.type} ${z.p.nom || ''}`.trim())} · `
        + `${escapeHtml(limiteTexte(z.p.plancher, z.p.plancherRef))} → `
        + `${escapeHtml(limiteTexte(z.p.plafond, z.p.plafondRef))}</span>`;
    }

    if (!html) { tip.style.display = 'none'; return; }
    tip.innerHTML = html;
    tip.style.left = ((sx / W) * rect.width) + 'px';
    tip.style.top = ((sy / H) * rect.height) + 'px';
    tip.style.display = 'block';
  }
  svg.addEventListener('mousemove', onMove);
  svg.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
}

// Re-rendu (depuis le cache) au redimensionnement de la fenêtre.
let _vpResizeTO = null;
window.addEventListener('resize', () => {
  clearTimeout(_vpResizeTO);
  _vpResizeTO = setTimeout(() => {
    const host = $('vertical-profile-graph');
    if (host && vpPanelVisible() && _vpLast) _renderProfilInto(host, _vpLast);
  }, 200);
});

// Ouverture / fermeture du panneau du profil vertical.
const profilBtn = $('btn-profil');
function ouvrirFermerProfil(ouvrir) {
  const panel = $('vp-panel');
  panel.hidden = !ouvrir;
  profilBtn.classList.toggle('is-active', ouvrir);
  profilBtn.setAttribute('aria-pressed', String(ouvrir));
  // Remonte les contrôles Leaflet du bas (barre d'échelle) au-dessus de la bande profil.
  document.querySelector('main').classList.toggle('profil-open', ouvrir);
  if (ouvrir) mettreAJourProfilVertical();
}
profilBtn.addEventListener('click', () => ouvrirFermerProfil($('vp-panel').hidden));
$('vp-close').addEventListener('click', () => ouvrirFermerProfil(false));
