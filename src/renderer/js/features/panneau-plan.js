/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// panneau-plan.js — tableau des legs (panneau « Plan de vol »).
// ============================================================

// Panneau « Plan de vol » — tableau des legs (tiers droit de la carte).
// Une ligne par leg : départ, arrivée, cap magnétique (déclinaison locale du
// leg déjà appliquée, cf. declinaisonEn), distance. Double-clic sur le nom d'un
// point tournant → renommage en ligne, validé par Entrée puis répercuté sur la
// carte.
// ============================================================
let _legEditing = false;   // une cellule de nom est en cours d'édition

function legsPanelVisible() {
  const p = $('legs-panel');
  return p && !p.hidden;
}

// Distance formatée comme l'étiquette de leg (1 décimale sous 10 NM).
function formatDistNM(dNM) {
  return dNM >= 10 ? String(Math.round(dNM)) : dNM.toFixed(1);
}

// Construit les lignes de leg depuis un état de route (points + longitudes
// déroulées + points tournants). Réutilise exactement la géométrie de la carte.
function construireLegs(points, disp, wps) {
  const noms = nomsPointsTournants(wps);
  const depName = nettoyerIcao($('icao-dep').value) || '—';
  const arrName = nettoyerIcao($('icao-arr').value) || '—';
  const nomDe = (i) => (i === 0 ? depName : (i === points.length - 1 ? arrName : noms[i - 1]));
  // Index dans routeWaypoints (donc éditable) si le point est un point tournant.
  const wpIdxDe = (i) => (i >= 1 && i <= wps.length ? i - 1 : -1);
  const rows = [];
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    const capVrai = capVraiInitial(a.lat, disp[i], b.lat, disp[i + 1]);
    const decl = declinaisonEn((a.lat + b.lat) / 2, (disp[i] + disp[i + 1]) / 2);
    const capMag = Math.round(((capVrai - decl) % 360 + 360) % 360);
    rows.push({
      from: nomDe(i), to: nomDe(i + 1),
      fromWp: wpIdxDe(i), toWp: wpIdxDe(i + 1),
      capMag, decl, distNm: distanceNM(a.lat, disp[i], b.lat, disp[i + 1]),
      legIdx: i, alt: getLegAlt(i),
    });
  }
  return rows;
}

// Cellule de nom : éditable (data-wp) si c'est un point tournant, sinon simple.
function celluleNom(nom, wpIdx) {
  const cls = wpIdx >= 0 ? 'legs-name is-editable' : 'legs-name';
  const attr = wpIdx >= 0 ? ` data-wp="${wpIdx}"` : '';
  return `<td class="${cls}"${attr}>${escapeHtml(nom)}</td>`;
}

// (Re)construit le tableau depuis l'état courant validé de la route.
function rafraichirTableauLegs() {
  if (!legsPanelVisible() || _legEditing) return;   // édition en cours → ne pas écraser l'input
  const tbody = $('legs-tbody');
  const empty = $('legs-empty');
  const totalEl = $('legs-total-val');
  if (!tbody) return;
  if (!_routeDep || !_routeArr) {   // pas de dép./arr. résolus → rien à afficher
    tbody.innerHTML = '';
    if (empty) empty.hidden = false;
    if (totalEl) totalEl.textContent = '—';
    return;
  }
  const points = [_routeDep, ...routeWaypoints, _routeArr];
  const disp = deroulerLons(points);
  const rows = construireLegs(points, disp, routeWaypoints);
  if (empty) empty.hidden = rows.length > 0;
  if (totalEl) {
    const total = rows.reduce((s, r) => s + r.distNm, 0);
    totalEl.textContent = formatDistNM(total) + ' NM';
  }
  const actLeg = legActifClamp();
  tbody.innerHTML = rows.map((r) => {
    const cap = String(r.capMag).padStart(3, '0');
    const declTxt = (r.decl >= 0 ? '+' : '') + r.decl.toFixed(1);
    const hint = escapeHtml(t('legsDeclHint').replace('{d}', declTxt));
    const altTxt = `${r.alt} ft`;
    const rowCls = r.legIdx === actLeg ? ' class="leg-row-active"' : (r.legIdx < actLeg ? ' class="leg-row-past"' : '');
    return `<tr data-leg="${r.legIdx}"${rowCls}>${celluleNom(r.from, r.fromWp)}${celluleNom(r.to, r.toWp)}`
      + `<td class="legs-num" title="${hint}">${cap}°</td>`
      + `<td class="legs-num legs-alt is-editable" data-leg="${r.legIdx}">${altTxt}</td>`
      + `<td class="legs-num">${formatDistNM(r.distNm)}</td></tr>`;
  }).join('');
}

// Édition en ligne générique d'une cellule du tableau : Entrée valide (via
// onValider), Échap annule, la perte de focus annule. onValider fait la mise à
// jour de l'état ET le redessin approprié.
function editerCelluleTableau(td, { initial, maxLength, numeric, onValider }) {
  if (_legEditing) return;
  _legEditing = true;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'legs-cell-input';
  input.maxLength = maxLength;
  input.value = initial;
  if (numeric) { input.inputMode = 'numeric'; input.style.textAlign = 'right'; }
  td.textContent = '';
  td.appendChild(input);
  input.focus();
  input.select();

  const finir = (valider) => {
    if (!_legEditing) return;
    _legEditing = false;
    if (valider) onValider(input.value);
    else rafraichirTableauLegs();   // annulation → restaure la cellule
  };
  input.addEventListener('keydown', (e) => {
    e.stopPropagation();   // n'atteint pas les raccourcis globaux (Échap ferme les menus)
    if (e.key === 'Enter') { e.preventDefault(); finir(true); }
    else if (e.key === 'Escape') { e.preventDefault(); finir(false); }
  });
  input.addEventListener('blur', () => finir(false));
}

// Renommage d'un point tournant (met à jour la carte + le tableau).
function demarrerEditionNom(td) {
  const wpIdx = parseInt(td.dataset.wp, 10);
  if (!(wpIdx >= 0) || !routeWaypoints[wpIdx]) return;
  editerCelluleTableau(td, {
    initial: td.textContent, maxLength: 12, numeric: false,
    onValider: (raw) => {
      const v = raw.trim().slice(0, 12);
      const wp = routeWaypoints[wpIdx];
      if (wp) { if (v) wp.nom = v; else delete wp.nom; }   // vide → revient au nom auto (WPn/code)
      dessinerRoute();   // ré-étiquette la carte + reconstruit le tableau
    },
  });
}

// Altitude d'un leg (ft). Sans impact carte → simple rafraîchissement du tableau.
function demarrerEditionAlt(td) {
  const legIdx = parseInt(td.dataset.leg, 10);
  if (!(legIdx >= 0)) return;
  const cur = getLegAlt(legIdx);
  editerCelluleTableau(td, {
    initial: cur != null ? String(cur) : '', maxLength: 6, numeric: true,
    onValider: (raw) => {
      const digits = raw.replace(/[^\d]/g, '');
      setLegAlt(legIdx, digits === '' ? null : Math.min(60000, parseInt(digits, 10)));
      rafraichirTableauLegs();
      mettreAJourProfilVertical();   // l'altitude prévue change → re-échantillonne le profil
    },
  });
}

// Délégation : double-clic sur une cellule éditable (nom de point ou altitude).
$('legs-tbody').addEventListener('dblclick', (e) => {
  const nameTd = e.target.closest('td.legs-name.is-editable');
  if (nameTd) { demarrerEditionNom(nameTd); return; }
  const altTd = e.target.closest('td.legs-alt.is-editable');
  if (altTd) demarrerEditionAlt(altTd);
});

// Clic droit sur une ligne de leg → menu contextuel « rendre ce leg actif ».
$('legs-tbody').addEventListener('contextmenu', (e) => {
  const tr = e.target.closest('tr[data-leg]');
  if (!tr) return;
  e.preventDefault();
  const legIdx = parseInt(tr.dataset.leg, 10);
  if (!(legIdx >= 0)) return;
  ouvrirMenuContextuel(e.pageX, e.pageY, [
    { label: t('ctxSetActiveLeg'), action: () => forcerLegActif(legIdx) },
  ]);
});

// Ouverture / fermeture du panneau.
const legsBtn = $('btn-legs');
function ouvrirFermerLegs(ouvrir) {
  const panel = $('legs-panel');
  panel.hidden = !ouvrir;
  legsBtn.classList.toggle('is-active', ouvrir);
  legsBtn.setAttribute('aria-pressed', String(ouvrir));
  // Décale les contrôles Leaflet (haut-droite) hors du panneau tant qu'il est ouvert.
  document.querySelector('main').classList.toggle('legs-open', ouvrir);
  // Les deux panneaux occupent le même tiers droit : l'un chasse l'autre.
  // (brief-seance.js est chargé après ce fichier — d'où la garde.)
  if (ouvrir && typeof fermerBrief === 'function') fermerBrief();
  if (ouvrir) rafraichirTableauLegs();
  mettreAJourProfilVertical();   // la largeur de la bande profil change avec ce panneau
}
legsBtn.addEventListener('click', () => ouvrirFermerLegs($('legs-panel').hidden));
$('legs-close').addEventListener('click', () => ouvrirFermerLegs(false));
