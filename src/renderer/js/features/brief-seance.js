/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// brief-seance.js — les briefs de séance publiés par CAVVA.
//
// C'est la raison d'être de l'application : la carte sait déjà tout des espaces
// aériens français, mais elle ne sait pas lesquels seront actifs le soir du vol.
// Cela, ce n'est pas dans l'export du SIA — c'est l'organisateur qui le saisit
// sur le site, et les briefs le rapportent ici.
//
// ── TOUS les briefs ─────────────────────────────────────────────────────────
// Le site publie le calendrier complet (une quarantaine de dates, du plus
// ancien au plus récent). On les télécharge tous d'un coup, et le panneau laisse
// choisir la séance : préparer celle du mois prochain vaut autant que consulter
// celle de ce soir. À l'ouverture, la prochaine à venir est sélectionnée.
//
// ── Ce qu'une séance change à l'écran ───────────────────────────────────────
//   • ses zones actives sont tracées MÊME SI les filtres les excluent (une zone
//     annoncée active ne doit jamais disparaître derrière un réglage) et
//     reçoivent un halo ambre, sur la carte comme dans le profil vertical ;
//   • le rayon de départ devient un cercle autour de l'aérodrome d'ARRIVÉE :
//     c'est de là qu'il se mesure — on peut partir de n'importe quel terrain
//     situé dedans ;
//   • l'arrivée est marquée.
//
// Le brief ne porte aucune coordonnée, seulement un code OACI : l'aérodrome est
// retrouvé dans la base MSFS importée. Sans cette base, la séance s'affiche mais
// ne se trace pas — et c'est dit.
//
// Le texte libre des zones est rapproché du SIA par brief-zones.js. Le
// téléchargement, la clé et la signature sont dans src/main/brief-source.js.
// ============================================================

const BRIEF_AMBRE = '#f59e0b';
// Cercle du rayon de départ : bleu pur, distinct du magenta des legs à venir, du
// rouge du leg actif et de l'ambre des zones actives.
const BRIEF_CERCLE = '#0000ff';

let _briefs = [];                 // toutes les séances, du plus ancien au plus récent
let _briefChoisi = null;          // la séance sélectionnée, ou null
let _briefResolu = null;          // { cles, lignes, inconnues } de la séance choisie
let _clesActives = new Set();     // clés à mettre en évidence (test O(1) au tracé)
let _briefArrivee = null;         // { code, name, lat, lon } | null
let _briefErreur = null;          // dernier échec de chargement
let _briefLayer = null;           // créé par initMap()

// ------------------------------------------------------------
// Ce que les autres fichiers demandent
// ------------------------------------------------------------

// Appelée par espaces-aeriens.js (tracé, filtres) et profil-espaces.js.
// Toujours sous garde `typeof estZoneActive === 'function'` là-bas : ce fichier
// est chargé APRÈS eux.
function estZoneActive(p) {
  return !!p && _clesActives.has(p.cle);
}

// Toutes les parties d'une zone : un même espace du SIA peut être découpé en
// plusieurs volumes, donc en plusieurs features partageant la même clé.
function featuresDeCle(cle) {
  if (!espacesCharges()) return [];
  return _espacesData.features.filter((f) => f.properties.cle === cle);
}

// ------------------------------------------------------------
// Dates
// ------------------------------------------------------------

function aujourdhuiIso() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

// « Mercredi 2 septembre 2026 » — la forme du site, dans la langue courante.
function dateLongue(iso) {
  try {
    const d = new Date(iso + 'T12:00:00');
    const s = d.toLocaleDateString(currentLang === 'en' ? 'en-GB' : 'fr-FR',
      { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  } catch (_) {
    return iso;
  }
}

// La prochaine séance à venir, sinon la dernière passée. Même règle que
// VolAeroclub::idProchainAVenir() côté site.
function briefParDefaut() {
  if (!_briefs.length) return null;
  const jour = aujourdhuiIso();
  return _briefs.find((b) => b.date >= jour) || _briefs[_briefs.length - 1];
}

// ------------------------------------------------------------
// Tracé sur la carte
// ------------------------------------------------------------

function effacerTraceBrief() {
  if (_briefLayer) _briefLayer.clearLayers();
}

// Cercle du rayon + repère d'arrivée. Le cercle est bleu pointillé, le repère
// ambre comme le reste de ce qui vient du brief : ni le magenta des cercles de
// portée, ni les couleurs de la route — des objets qui ne viennent pas du pilote.
function tracerBrief() {
  effacerTraceBrief();
  if (!_briefLayer || !_briefChoisi || !_briefArrivee) return [];

  const c = [_briefArrivee.lat, _briefArrivee.lon];
  const points = [c];

  L.circleMarker(c, {
    radius: 7, color: BRIEF_AMBRE, weight: 3, fillColor: '#fff', fillOpacity: 1, interactive: false,
  }).addTo(_briefLayer);

  if (_briefChoisi.rayonNm > 0) {
    const cercle = L.circle(c, {
      radius: _briefChoisi.rayonNm * 1852,
      color: BRIEF_CERCLE, weight: 2.5, opacity: 1, dashArray: '8 6',
      fill: false, interactive: false,
    }).addTo(_briefLayer);
    const b = cercle.getBounds();
    points.push(b.getNorthWest(), b.getSouthEast());
  }

  return points;
}

// Cadre la carte sur ce que la séance décrit — le cercle, et les zones actives
// retrouvées. Fait au moment du choix : ensuite la carte appartient de nouveau à
// l'utilisateur.
function cadrerSurBrief(pointsTrace) {
  const pts = (pointsTrace || []).slice();
  for (const cle of _clesActives) {
    for (const f of featuresDeCle(cle)) {
      const b = boiteZone(f);
      pts.push([b.aMin, b.oMin], [b.aMax, b.oMax]);
    }
  }
  if (pts.length < 2) return;
  try { map.fitBounds(L.latLngBounds(pts).pad(0.12)); } catch (_) {}
}

// ------------------------------------------------------------
// Rendu : la liste des séances
// ------------------------------------------------------------

function rendreListeBriefs() {
  const jour = aujourdhuiIso();
  return `<div class="brief-liste">` + _briefs.map((b, i) => {
    const passe = b.date < jour;
    const choisi = (b === _briefChoisi);
    return `<button type="button" class="brief-carte${choisi ? ' est-choisie' : ''}${passe ? ' est-passee' : ''}" data-i="${i}">
      <span class="brief-carte-date">${escapeHtml(dateLongue(b.date))}</span>
      <span class="brief-carte-infos">
        <span class="brief-etiquette">${escapeHtml(b.typeVol || '—')}</span>
        <span>→ <strong>${escapeHtml(b.icaoArrivee || '—')}</strong></span>
        <span>${b.rayonNm != null ? b.rayonNm + ' NM' : '—'}</span>
      </span>
    </button>`;
  }).join('') + `</div>`;
}

// ------------------------------------------------------------
// Rendu : le détail de la séance choisie
// ------------------------------------------------------------

function ligneInfo(libelle, valeur) {
  if (!valeur) return '';
  return `<div class="brief-ligne"><span class="brief-lbl">${escapeHtml(libelle)}</span>`
    + `<span class="brief-val">${escapeHtml(valeur)}</span></div>`;
}

function texteArrivee(b) {
  if (!b.icaoArrivee) return '—';
  if (_briefArrivee && _briefArrivee.name) return `${b.icaoArrivee} — ${_briefArrivee.name}`;
  return b.icaoArrivee;
}

// Une zone reconnue, avec ce qu'elle impose. Cliquable : elle cadre la carte.
function rendreZoneReconnue(cle, saisie) {
  const parties = featuresDeCle(cle);
  if (!parties.length) return '';
  const p = parties[0].properties;
  const fam = familleDeZone(p);
  const titre = p.nomUsuel ? `${p.nom || ''} — ${p.nomUsuel}` : (p.nom || cle);
  const badges = obligationsZone(p)
    .map((o) => `<span class="esp-badge esp-${tonObligation(o.t)}" title="${escapeHtml(o.d)}">${o.t}</span>`)
    .join('');

  return `<div class="brief-zone" data-cle="${escapeHtml(cle)}" title="${escapeHtml(t('briefZoneShow'))}">
    <div class="brief-zone-nom"><span class="esp-pastille" style="background:${fam ? fam.couleur : '#888'}"></span>${escapeHtml(titre)}</div>
    <div class="brief-zone-meta">${escapeHtml(ESPACE_LIBELLES[p.type] || p.type)}${parties.length > 1 ? ` · ${parties.length} parties` : ''}</div>
    <div class="brief-zone-meta">${escapeHtml(limiteTexte(p.plancher, p.plancherRef))} → ${escapeHtml(limiteTexte(p.plafond, p.plafondRef))}</div>
    ${badges ? `<div class="esp-badges">${badges}</div>` : ''}
    ${p.horTxt ? `<div class="brief-zone-hor">${escapeHtml(p.horTxt.replace(/#/g, ' · '))}</div>` : ''}
    <div class="brief-zone-saisie">${escapeHtml(t('briefZoneAsTyped').replace('{txt}', saisie))}</div>
  </div>`;
}

function rendreZonesBrief() {
  if (!espacesCharges()) {
    return `<p class="brief-avert">${escapeHtml(t('briefNoCycle'))}</p>`;
  }

  const lignes = _briefResolu.lignes;
  const reconnues = lignes.filter((l) => l.etat === 'exact');
  const inconnues = lignes.filter((l) => l.etat === 'inconnu');

  if (!reconnues.length && !inconnues.length) {
    return `<p class="brief-vide">${escapeHtml(t('briefNoZone'))}</p>`;
  }

  let html = '';
  for (const l of reconnues) {
    html += l.cles.map((cle) => rendreZoneReconnue(cle, l.saisie)).join('');
  }
  // Une saisie non reconnue est montrée TELLE QUELLE. L'application ne sait pas
  // de quelle zone il s'agit ; le pilote, lui, saura probablement la lire.
  for (const l of inconnues) {
    html += `<div class="brief-zone brief-zone-inconnue">
      <div class="brief-zone-nom"><i class="ph-light ph-warning"></i> ${escapeHtml(l.saisie)}</div>
      <div class="brief-zone-meta">${escapeHtml(t('briefZoneUnknown'))}</div>
    </div>`;
  }
  return html;
}

function rendreDetailBrief() {
  const b = _briefChoisi;
  if (!b) return '';

  const entete = [
    `<h4 class="brief-titre">${escapeHtml(dateLongue(b.date))}</h4>`,
    ligneInfo(t('briefFlightType'), b.typeVol),
    ligneInfo(t('briefArr'), texteArrivee(b)),
    ligneInfo(t('briefRadius'), b.rayonNm != null ? `${b.rayonNm} NM ${t('briefRadiusAround')}` : ''),
    ligneInfo(t('briefFile'), b.fichier),
  ].join('');

  // Le cercle a besoin des coordonnées de l'arrivée : sans base MSFS, ou pour un
  // code introuvable (terrain hors base, saisie incomplète), on le dit plutôt
  // que de ne rien tracer en silence.
  const avertArrivee = (b.icaoArrivee && !_briefArrivee)
    ? `<p class="brief-avert">${escapeHtml(t('briefIcaoUnknown').replace('{icao}', b.icaoArrivee))}</p>`
    : '';

  const notes = b.notes ? `<p class="brief-consignes">${escapeHtml(b.notes)}</p>` : '';

  const nbZones = _briefResolu ? _briefResolu.cles.size : 0;
  const nbInconnues = _briefResolu ? _briefResolu.inconnues.length : 0;
  const compte = nbInconnues
    ? t('briefZonesCountUnknown').replace('{n}', nbZones).replace('{k}', nbInconnues)
    : t('briefZonesCount').replace('{n}', nbZones);

  return `<div class="brief-bloc">${entete}${notes}</div>`
    + avertArrivee
    + `<div class="brief-sous-titre">${escapeHtml(compte)}</div>`
    + rendreZonesBrief();
}

function rendreBrief() {
  const corps = $('brief-corps');
  if (!corps) return;

  if (_briefErreur) { rendreErreurBrief(_briefErreur); return; }

  if (!_briefs.length) {
    corps.innerHTML = `<p class="brief-vide">${escapeHtml(t('briefErrAbsent'))}</p>`;
    return;
  }

  corps.innerHTML = rendreDetailBrief() + rendreListeBriefs();
  $('brief-etat').textContent = t('briefCount').replace('{n}', _briefs.length);
}

// Le message d'erreur dépend du code : « clé refusée » et « hors ligne » ne se
// corrigent pas de la même manière, et « rien de publié » n'est pas une panne.
const BRIEF_MESSAGE = {
  nokey: 'briefErrNoKey',
  unauthorized: 'briefErrUnauthorized',
  absent: 'briefErrAbsent',
  network: 'briefErrNetwork',
  signature: 'briefErrSignature',
  content: 'briefErrContent',
};

function rendreErreurBrief(res) {
  const corps = $('brief-corps');
  if (!corps) return;
  const cle = BRIEF_MESSAGE[res.code] || 'briefErrNetwork';
  const detail = (res.code === 'content' || res.code === 'network') && res.message ? res.message : '';
  const action = (res.code === 'nokey' || res.code === 'unauthorized')
    ? `<button id="brief-vers-cle" class="btn btn-accent"><i class="ph-light ph-key"></i> <span>${escapeHtml(t('apiKeyTitle'))}</span></button>`
    : '';

  corps.innerHTML = `<div class="brief-erreur brief-erreur-${escapeHtml(res.code || 'network')}">
      <p class="brief-erreur-txt">${escapeHtml(t(cle))}</p>
      ${detail ? `<p class="brief-erreur-detail">${escapeHtml(detail)}</p>` : ''}
      ${action ? `<div class="brief-erreur-actions">${action}</div>` : ''}
    </div>`;
  $('brief-etat').textContent = res.url || '';

  const bouton = $('brief-vers-cle');
  if (bouton) bouton.addEventListener('click', () => $('btn-api-key').click());
}

// ------------------------------------------------------------
// Choix d'une séance
// ------------------------------------------------------------

async function choisirBrief(b, cadrer) {
  _briefChoisi = b || null;
  _briefResolu = _briefChoisi ? resoudreZonesBrief(_briefChoisi.zones) : null;
  _clesActives = _briefResolu ? _briefResolu.cles : new Set();
  _briefArrivee = null;

  // L'aérodrome d'arrivée vient de la base MSFS, pas du brief.
  if (_briefChoisi && _briefChoisi.icaoArrivee) {
    try {
      const res = await window.cap.aeroportParCode(_briefChoisi.icaoArrivee);
      if (res && res.ok) _briefArrivee = res.airport;
    } catch (_) { /* base absente : signalé dans le panneau */ }
  }

  // Le tracé des espaces doit repasser : les zones actives échappent aux filtres
  // et prennent leur halo. Le profil vertical suit (tracerEspaces le rafraîchit).
  tracerEspaces();
  const points = tracerBrief();
  rendreBrief();
  if (cadrer) cadrerSurBrief(points);
}

function oublierBriefs() {
  _briefs = [];
  _briefChoisi = null;
  _briefResolu = null;
  _clesActives = new Set();
  _briefArrivee = null;
  effacerTraceBrief();
  tracerEspaces();   // retire halos et zones forcées à l'affichage
}

// ------------------------------------------------------------
// Chargement
// ------------------------------------------------------------

async function chargerBriefs() {
  const bouton = $('btn-brief');
  const corps = $('brief-corps');
  if (corps) corps.innerHTML = `<p class="brief-vide">${escapeHtml(t('briefLoading'))}</p>`;
  if (bouton) bouton.disabled = true;

  let res;
  try {
    res = await window.cap.briefsCharger();
  } catch (e) {
    res = { ok: false, code: 'network', message: e && e.message };
  }
  if (bouton) bouton.disabled = false;

  if (!res || !res.ok) {
    oublierBriefs();
    _briefErreur = res || { code: 'network' };
    rendreErreurBrief(_briefErreur);
    return;
  }

  _briefErreur = null;
  _briefs = res.briefs || [];
  await choisirBrief(briefParDefaut(), true);
}

// ------------------------------------------------------------
// Interface
// ------------------------------------------------------------

function ouvrirFermerBrief(ouvrir) {
  const panneau = $('brief-panel');
  if (!panneau) return;
  panneau.hidden = !ouvrir;
  $('btn-brief').classList.toggle('is-active', ouvrir);
  $('btn-brief').setAttribute('aria-pressed', ouvrir ? 'true' : 'false');
  document.querySelector('main').classList.toggle('brief-open', ouvrir);
  // Deux panneaux sur le tiers droit ne peuvent pas coexister.
  if (ouvrir && typeof ouvrirFermerLegs === 'function' && !$('legs-panel').hidden) ouvrirFermerLegs(false);
  mettreAJourProfilVertical();   // la largeur de la bande profil change avec ce panneau
}

function fermerBrief() { ouvrirFermerBrief(false); }

$('btn-brief').addEventListener('click', () => {
  const ouvrir = $('brief-panel').hidden;
  ouvrirFermerBrief(ouvrir);
  // Premier affichage : on va chercher le calendrier. Ensuite c'est le bouton
  // « actualiser » qui le refait — rouvrir un panneau ne doit pas retélécharger.
  if (ouvrir && !_briefs.length) chargerBriefs();
});

$('brief-close').addEventListener('click', () => ouvrirFermerBrief(false));
$('brief-refresh').addEventListener('click', () => chargerBriefs());

// Un seul écouteur sur le corps du panneau : il survit au re-rendu, qu'on
// clique une séance de la liste ou une zone du détail.
$('brief-corps').addEventListener('click', (e) => {
  const carte = e.target.closest('.brief-carte');
  if (carte) {
    const b = _briefs[+carte.dataset.i];
    if (b && b !== _briefChoisi) choisirBrief(b, true);
    return;
  }

  const zone = e.target.closest('.brief-zone');
  if (!zone || !zone.dataset.cle) return;
  const parties = featuresDeCle(zone.dataset.cle);
  if (!parties.length) return;

  // Mise en évidence sur la carte ET dans le profil — même mécanisme que la
  // liste de sonde — puis cadrage sur toutes les parties de la zone.
  surlignerZone(parties[0]);
  const pts = [];
  for (const f of parties) {
    const b = boiteZone(f);
    pts.push([b.aMin, b.oMin], [b.aMax, b.oMax]);
  }
  try { map.fitBounds(L.latLngBounds(pts).pad(0.25)); } catch (_) {}
});
