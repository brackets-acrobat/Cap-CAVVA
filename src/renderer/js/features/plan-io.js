/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// plan-io.js — nommage des points, sauvegarde et ouverture du plan.
// ============================================================

// --- Nommage des points tournants ---
// Nom d'un point tournant : nom personnalisé (renommé dans le tableau) en
// priorité, sinon code aimanté (ICAO/ident), sinon « WPn » numéroté
// séquentiellement — n ne s'incrémente que sur les points NON nommés.
function nomsPointsTournants(wps) {
  let n = 0;
  return wps.map((p) => {
    if (p.nom) return p.nom;
    if (p.code) return p.code;
    n += 1;
    return 'WP' + n;
  });
}

// --- Sauvegarde du plan de vol (.ccfp) ---
// Construit l'objet plan à partir de l'état courant (ICAO + points tournants).
function construirePlan() {
  const dep = nettoyerIcao($('icao-dep').value);
  const arr = nettoyerIcao($('icao-arr').value);
  const noms = nomsPointsTournants(routeWaypoints);
  return {
    format: 'ccfp',
    version: 1,
    depart: dep || null,
    arrivee: arr || null,
    // Départ / arrivée hors-aéroport (ZZZY / ZZZZ) : on conserve les coordonnées.
    departPoint: (dep === 'ZZZY' && _lieuDepartLatLng)
      ? { lat: _lieuDepartLatLng.lat, lon: wrapLon(_lieuDepartLatLng.lng) } : null,
    arriveePoint: (arr === 'ZZZZ' && _lieuArriveeLatLng)
      ? { lat: _lieuArriveeLatLng.lat, lon: wrapLon(_lieuArriveeLatLng.lng) } : null,
    // Altitude planifiée du premier leg (au départ) ; celles des autres legs
    // sont portées par les points tournants ci-dessous.
    departAlt: Number.isFinite(_legAltDep) ? _legAltDep : null,
    // code = ICAO/ident si aimanté (sinon null) ; nom = code ou « WPn » ; alt = altitude du leg partant de ce point.
    pointsTournants: routeWaypoints.map((p, i) => ({
      lat: p.lat, lon: p.lon, code: p.code || null, nom: noms[i],
      alt: Number.isFinite(p.alt) ? p.alt : null,
    })),
    // Flanquements VOR : identité de la station et positions seulement. Radial
    // et distance sont recalculés à la lecture, la déclinaison ayant pu changer.
    flanquements: flanquementsEnregistrables(),
    cree: new Date().toISOString(),
  };
}

// Le plan n'est enregistrable que s'il a au moins un ICAO départ ET arrivée.
function planEnregistrable() {
  return !!nettoyerIcao($('icao-dep').value) && !!nettoyerIcao($('icao-arr').value);
}
function majBoutonsPlan() {
  $('btn-save-plan').disabled = !planEnregistrable();
}

$('btn-save-plan').addEventListener('click', async () => {
  if (!planEnregistrable()) return;   // garde-fou (le bouton est aussi désactivé)
  const dep = nettoyerIcao($('icao-dep').value);
  const arr = nettoyerIcao($('icao-arr').value);
  let res;
  try {
    res = await window.cap.sauverPlan({ nomSuggere: `${dep} - ${arr}`, titre: t('savePlanTitle'), plan: construirePlan() });
  } catch (err) {
    res = { ok: false, error: (err && err.message) || String(err) };
  }
  if (res && !res.ok && !res.canceled) {
    console.error(t('savePlanErr').replace('{err}', res.error || '?'));
  }
});

// --- Chargement d'un plan de vol (.ccfp) ---
// Restaure l'état (ICAO, point d'arrivée ZZZZ, points tournants avec leurs codes)
// puis redessine la route.
function appliquerPlan(plan) {
  if (!plan || typeof plan !== 'object') return;
  $('icao-dep').value = nettoyerIcao(plan.depart || '');
  $('icao-arr').value = nettoyerIcao(plan.arrivee || '');
  const dp = plan.departPoint, ap = plan.arriveePoint;
  _lieuDepartLatLng = (dp && Number.isFinite(dp.lat) && Number.isFinite(dp.lon))
    ? L.latLng(dp.lat, dp.lon) : null;
  _lieuArriveeLatLng = (ap && Number.isFinite(ap.lat) && Number.isFinite(ap.lon))
    ? L.latLng(ap.lat, ap.lon) : null;
  routeWaypoints = Array.isArray(plan.pointsTournants)
    ? plan.pointsTournants
        .filter((p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon))
        .map((p) => {
          const wp = { lat: p.lat, lon: p.lon, code: p.code || null };
          // Nom vraiment personnalisé (ni WPn auto, ni simple recopie du code) → restauré.
          if (p.nom && p.nom !== (p.code || '') && !/^WP\d+$/.test(p.nom)) wp.nom = p.nom;
          if (Number.isFinite(p.alt)) wp.alt = p.alt;   // altitude du leg partant de ce point
          return wp;
        })
    : [];
  _legAltDep = Number.isFinite(plan.departAlt) ? plan.departAlt : null;
  _legActif = 0;   // nouveau plan chargé → leg actif = premier
  majBoutonsPlan();
  majLigneRoute({ fit: true });   // re-résout les ICAO, redessine, recalcule la déclinaison, recadre sur le tracé
  chargerFlanquements(plan.flanquements);   // absent des plans antérieurs : la liste est alors vide
}

// Nouveau plan : réinitialise tout l'état (ICAO, points de dép./arr. cliqués,
// points tournants) et efface la route.
function reinitialiserPlan() {
  $('icao-dep').value = '';
  $('icao-arr').value = '';
  _lieuDepartLatLng = null;
  _lieuArriveeLatLng = null;
  routeWaypoints = [];
  _legAltDep = null;
  _legActif = 0;
  effacerCercles();   // comme NavXpressVFR : « Nouveau plan » efface aussi les cercles
  effacerTousFlanquements();   // les flanquements visent des points de CETTE route
  majBoutonsPlan();
  majLigneRoute();   // dép./arr. vides → la route est effacée
}

// Y a-t-il un plan en cours (qui mérite une confirmation avant d'être abandonné) ?
function planEnCours() {
  return !!nettoyerIcao($('icao-dep').value) || !!nettoyerIcao($('icao-arr').value)
    || routeWaypoints.length > 0;
}

$('btn-new-plan').addEventListener('click', () => {
  if (!planEnCours()) { reinitialiserPlan(); return; }   // rien à perdre → pas de confirmation
  $('newplan-overlay').hidden = false;
});
$('btn-newplan-cancel').addEventListener('click', () => { $('newplan-overlay').hidden = true; });
$('btn-newplan-ok').addEventListener('click', () => {
  $('newplan-overlay').hidden = true;
  reinitialiserPlan();
});

$('btn-open-plan').addEventListener('click', async () => {
  let res;
  try { res = await window.cap.ouvrirPlan({ titre: t('openPlanTitle') }); }
  catch (err) { res = { ok: false, error: (err && err.message) || String(err) }; }
  if (!res || res.canceled) return;
  if (!res.ok || !res.plan) { console.error(t('openPlanErr').replace('{err}', (res && res.error) || '?')); return; }
  appliquerPlan(res.plan);
});
