/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// menu-contextuel.js — clic droit sur la carte.
// ============================================================

// Menu contextuel (clic droit sur la carte) + champs ICAO du bandeau.
//   • Aéroport / héliport / hydrobase → « Définir comme aéroport de départ /
//     d'arrivée » : inscrit l'ICAO de l'aéroport dans le champ correspondant.
//   • Ailleurs (fond de carte, navaid, lieu de poser) → « Définir comme lieu
//     d'arrivée » : inscrit le code ZZZZ dans le champ ICAO arrivée.
// Le menu est un simple <div> positionné au curseur, reconstruit à chaque
// ouverture (libellés dans la langue courante).
// ============================================================
let _ctxMenuEl = null;

// Réduit une chaîne à un ICAO valide : 6 caractères alphanumériques majuscules.
function nettoyerIcao(s) {
  return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

// Inscrit un code dans le champ ICAO départ ('dep') ou arrivée ('arr'),
// puis (re)trace la ligne de route.
function definirIcao(champ, code) {
  const el = $(champ === 'dep' ? 'icao-dep' : 'icao-arr');
  if (el) { el.value = nettoyerIcao(code); planifierLigneRoute(); majBoutonsPlan(); }
}

function fermerMenuContextuel() {
  if (_ctxMenuEl) { _ctxMenuEl.remove(); _ctxMenuEl = null; }
}

// Ouvre le menu au point (pageX, pageY) avec une liste d'items {label, action}.
function ouvrirMenuContextuel(pageX, pageY, items) {
  fermerMenuContextuel();
  if (!items || !items.length) return;
  const menu = document.createElement('div');
  menu.className = 'map-ctx-menu';
  items.forEach((it) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'map-ctx-item';
    b.textContent = it.label;
    b.addEventListener('click', () => { fermerMenuContextuel(); it.action(); });
    menu.appendChild(b);
  });
  document.body.appendChild(menu);
  // Positionne au curseur, en rabattant le menu s'il déborde du viewport.
  menu.style.left = pageX + 'px';
  menu.style.top = pageY + 'px';
  const r = menu.getBoundingClientRect();
  if (r.right > window.innerWidth) menu.style.left = Math.max(0, pageX - r.width) + 'px';
  if (r.bottom > window.innerHeight) menu.style.top = Math.max(0, pageY - r.height) + 'px';
  _ctxMenuEl = menu;
}

// Coordonnées page (curseur) depuis un événement Leaflet.
function ctxPageXY(e) {
  const oe = e.originalEvent || e;
  return { x: oe.pageX || 0, y: oe.pageY || 0 };
}

// Menu pour un aéroport (ou héliport / hydrobase) : définir comme départ/arrivée.
// Si cet aéroport est aussi un point tournant (aimanté), propose sa suppression.
function ouvrirMenuAeroport(airport, e) {
  if (e.originalEvent) e.originalEvent.preventDefault();
  const code = nettoyerIcao(airport.code || airport.ident);
  const p = ctxPageXY(e);
  const items = [
    { label: t('ctxSetDep'), action: () => definirIcao('dep', code) },
    { label: t('ctxSetArr'), action: () => definirIcao('arr', code) },
  ];
  // Correspondance avec un point tournant aimanté : code brut (même base que le
  // mousedown de l'aéroport et que le code stocké via featureProche).
  const rawCode = (airport.code || airport.ident || '').toUpperCase();
  const k = routeWaypoints.findIndex((w) => (w.code || '').toUpperCase() === rawCode);
  if (k >= 0) items.push({ label: t('ctxDeleteWp'), action: () => supprimerPointTournant(k) });
  // Carte VAC du SIA : seulement sur un code OACI métropolitain régulier.
  if (vacEligible(code)) items.push({ label: t('ctxVac'), action: () => ouvrirCarteVac(code) });
  // Fiche terrain FFPLUM : seulement si le rapprochement par coordonnées, fait
  // côté principal, a trouvé un terrain BASULM à moins de 500 m.
  if (airport.ficheUlm) items.push({ label: t('ctxFicheUlm'), action: () => ouvrirFicheTerrain(airport) });
  // Cercle de portée centré sur l'aéroport (rayon saisi dans la modale).
  items.push({ label: t('ctxRangeCircle'), action: () => ouvrirModaleCercle(L.latLng(airport.lat, airport.lon)) });
  if (aDesCercles()) items.push({ label: t('ctxRangeClear'), action: effacerCercles });
  ouvrirMenuContextuel(p.x, p.y, items);
}

// Menu sur le FOND de carte (ni aéroport ni navaid) ou un lieu de poser : définir
// le départ (ZZZY) / l'arrivée (ZZZZ) à partir de ce point, + cercle de portée.
// Items communs du menu « fond de carte » (départ/arrivée/cercle + effacer tous).
function itemsFondCarte(latlng) {
  const items = [
    { label: t('ctxSetDepPoint'), action: () => { _lieuDepartLatLng = latlng; definirIcao('dep', 'ZZZY'); } },
    { label: t('ctxSetArrPoint'), action: () => { _lieuArriveeLatLng = latlng; definirIcao('arr', 'ZZZZ'); } },
    { label: t('ctxRangeCircle'), action: () => ouvrirModaleCercle(latlng) },
  ];
  if (aDesCercles()) items.push({ label: t('ctxRangeClear'), action: effacerCercles });
  return items;
}
function ouvrirMenuFondCarte(e) {
  if (e.originalEvent) e.originalEvent.preventDefault();
  const p = ctxPageXY(e);
  ouvrirMenuContextuel(p.x, p.y, itemsFondCarte(e.latlng));
}

// Menu d'un cercle de portée (clic droit sur son tracé) : options du fond de
// carte + suppression de CE cercle.
function ouvrirMenuCercle(e, supprimerCeCercle) {
  if (e.originalEvent) e.originalEvent.preventDefault();
  L.DomEvent.stopPropagation(e);
  const p = ctxPageXY(e);
  const items = itemsFondCarte(e.latlng);
  items.push({ label: t('ctxRangeDeleteOne'), action: supprimerCeCercle });
  ouvrirMenuContextuel(p.x, p.y, items);
}

// Menu sur un navaid : arrivée ZZZZ + cercle de portée du navaid (rayon publié).
function ouvrirMenuNavaid(e, navaid) {
  if (e.originalEvent) e.originalEvent.preventDefault();
  const p = ctxPageXY(e);
  const latlng = e.latlng;
  const items = [
    { label: t('ctxSetArrPoint'), action: () => { _lieuArriveeLatLng = latlng; definirIcao('arr', 'ZZZZ'); } },
  ];
  if (navaid && Number.isFinite(navaid.rangeNm) && navaid.rangeNm > 0) {
    items.push({ label: t('ctxRangeCircleNavaid'), action: () => tracerCercleNavaid(navaid) });
  }
  if (aDesCercles()) items.push({ label: t('ctxRangeClear'), action: effacerCercles });
  ouvrirMenuContextuel(p.x, p.y, items);
}

// Câblage global : ferme le menu sur clic ailleurs / Échap. (Le clic droit
// d'ouverture ne déclenche pas de 'click', donc n'auto-ferme pas le menu.)
document.addEventListener('click', (e) => {
  if (_ctxMenuEl && !e.target.closest('.map-ctx-menu')) fermerMenuContextuel();
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fermerMenuContextuel(); });
