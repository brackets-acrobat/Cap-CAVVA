/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// acces.js — l'écran d'accueil, et le moment où l'application démarre.
//
// Tant que la clé CAVVA n'a pas été acceptée, seul #acces-gate est visible et
// RIEN n'est initialisé derrière : ni carte Leaflet, ni chargement des 2 200
// espaces aériens, ni tuiles téléchargées. C'est la différence avec un simple
// voile — il n'y a pas d'application qui tourne sous l'écran d'accueil.
//
// La règle est dans src/main/acces.js : le serveur donne son avis au premier
// lancement, puis sa validation est mémorisée et une coupure réseau n'enferme
// plus personne dehors. Un refus explicite (401) reverrouille tout de suite.
//
// `demarrerApplication()` est définie dans renderer.js, chargé APRÈS ce fichier :
// elle n'est appelée qu'ici, une fois le verdict rendu.
// ============================================================

let _accesDemarree = false;      // l'application a-t-elle été initialisée ?
let accesHorsLigne = false;      // ouverte sur une validation antérieure (lu par etat.js)

// Messages d'échec, par raison. Une clé refusée et un serveur muet ne se
// corrigent pas de la même manière — et « aucune clé » n'est pas un échec, c'est
// l'état normal du premier lancement.
const ACCES_MESSAGE = {
  unauthorized: 'accesRefused',
  network: 'accesNetwork',
  secret: 'accesSecret',
};

function accesAfficherMessage(cle, ton) {
  const el = $('acces-message');
  if (!el) return;
  if (!cle) { el.hidden = true; el.textContent = ''; return; }
  el.className = 'acces-message acces-' + (ton || 'erreur');
  el.textContent = t(cle);
  el.hidden = false;
}

function accesOccupe(occupe) {
  const saisir = $('acces-saisir');
  const reessayer = $('acces-reessayer');
  if (saisir) saisir.disabled = occupe;
  if (reessayer) reessayer.disabled = occupe;
}

// Déverrouille et lance l'application — une seule fois, quoi qu'il arrive.
function accesDeverrouiller(verdict) {
  document.body.classList.remove('est-verrouille');
  const gate = $('acces-gate');
  if (gate) gate.remove();   // retiré du DOM : plus rien à repeindre ni à traduire

  accesHorsLigne = (verdict && verdict.raison === 'hors-ligne');

  if (_accesDemarree) return;
  _accesDemarree = true;
  demarrerApplication();
}

// Peint l'écran d'accueil d'après un verdict, ou déverrouille s'il est favorable.
function accesAppliquer(verdict) {
  if (verdict && verdict.ouvert) { accesDeverrouiller(verdict); return; }

  const raison = (verdict && verdict.raison) || 'network';
  accesAfficherMessage(ACCES_MESSAGE[raison] || 'accesNetwork');
  // « Réessayer » n'a de sens que si une clé est déjà enregistrée : sinon il n'y
  // a rien à réessayer, il y a une clé à saisir.
  const reessayer = $('acces-reessayer');
  if (reessayer) reessayer.hidden = !(verdict && verdict.cleConfiguree);

  const lien = $('acces-lien-compte');
  if (lien && verdict && verdict.urlCompte) lien.href = verdict.urlCompte;
  if (verdict) lastConfig = { apiBaseUrl: verdict.apiBaseUrl, cleConfiguree: verdict.cleConfiguree };
}

// Demande son avis au serveur, puis applique le verdict.
async function accesVerifier() {
  accesOccupe(true);
  accesAfficherMessage('accesChecking', 'info');
  let verdict;
  try {
    verdict = await window.cap.accesVerifier();
  } catch (e) {
    verdict = { ouvert: false, raison: 'network' };
  }
  accesOccupe(false);
  accesAppliquer(verdict);
  return verdict;
}

// Point d'entrée, appelé par renderer.js. On peint d'abord l'état connu sans
// réseau (le lien vers le compte, le bouton « Réessayer »), puis on interroge
// le serveur : l'écran ne reste jamais vide pendant l'attente.
async function initAcces() {
  let local = null;
  try { local = await window.cap.accesEtat(); } catch (_) {}

  // `lastConfig` alimente la modale de saisie (elle y relit l'adresse du site).
  // Elle n'est normalement posée qu'au démarrage de l'application — trop tard
  // ici : sans ça, ouvrir la modale depuis l'écran d'accueil présenterait un
  // champ d'adresse vide, et l'enregistrer effacerait une adresse personnalisée.
  if (local) lastConfig = { apiBaseUrl: local.apiBaseUrl, cleConfiguree: local.cleConfiguree };

  const lien = $('acces-lien-compte');
  if (lien && local && local.urlCompte) lien.href = local.urlCompte;
  if (local && !local.cleConfiguree) {
    const reessayer = $('acces-reessayer');
    if (reessayer) reessayer.hidden = true;
  }

  await accesVerifier();
}

// --- Interface de l'écran d'accueil ------------------------------------------

// La saisie de la clé passe par la modale existante : un seul chemin pour cette
// opération, que l'on vienne de l'écran d'accueil ou de la barre du haut.
$('acces-saisir').addEventListener('click', () => $('btn-api-key').click());
$('acces-reessayer').addEventListener('click', () => accesVerifier());

// La bascule FR/EN de l'écran d'accueil double celle de la barre du haut, qui
// est masquée tant que l'application est verrouillée.
$('acces-lang').addEventListener('click', () => {
  setLanguage(currentLang === 'fr' ? 'en' : 'fr');
  updateAccesLangue();
});

// Le toggle de l'écran d'accueil n'est pas celui que updateToggleButton() connaît.
function updateAccesLangue() {
  const btn = $('acces-lang');
  if (!btn) return;
  const fr = btn.querySelector('.lang-fr');
  const en = btn.querySelector('.lang-en');
  if (fr) fr.classList.toggle('lang-active', currentLang === 'fr');
  if (en) en.classList.toggle('lang-active', currentLang === 'en');
}
