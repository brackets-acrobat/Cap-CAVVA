/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// renderer.js — orchestrateur du renderer.
//
// Ce fichier ne contient aucune fonctionnalité : il branche le bouton de
// connexion, écoute le flux du simulateur, et lance l'initialisation. Tout le
// reste vit dans js/features/, un fichier par fonctionnalité, chargés AVANT
// celui-ci (voir l'ordre des <script> dans index.html).
//
// Les scripts partagent la portée globale — pas de modules ES. C'est la
// convention de NavXpressVFR : l'ordre de chargement fait la dépendance.
//
// ── Rien ne démarre avant la clé ────────────────────────────────────────────
// demarrerApplication() n'est PAS appelée ici : c'est acces.js qui la déclenche,
// une fois la clé CAVVA acceptée. Tant qu'elle ne l'est pas, la carte Leaflet
// n'existe pas, aucune tuile n'est téléchargée et les 2 200 espaces aériens ne
// sont pas lus. Les écouteurs posés au chargement des fichiers de features, eux,
// sont inoffensifs : ils attendent des éléments qui ne bougeront pas.
// ============================================================

// --- Connexion au simulateur -------------------------------------------------

$('btn-connect').addEventListener('click', async () => {
  if (connecte) {
    await window.cap.disconnect();
  } else {
    setStatus('connecting');
    const res = await window.cap.connect();
    if (!res.ok && res.error) setStatus('disconnected', res.error);
  }
});

window.cap.onStatus((s) => {
  if (s.state) setStatus(s.state, s.app || s.error || s.warn);
});

window.cap.onScan((f) => majScan(f));

// Config rafraîchie par le main (après enregistrement de la clé).
window.cap.onConfig((cfg) => { lastConfig = cfg; renderApiHint(); });

// --- Initialisation ----------------------------------------------------------

// Appelée UNE SEULE FOIS par acces.js, après que la clé a été acceptée.
function demarrerApplication() {
  initMap();
  setStatus('disconnected');
  majBoutonsPlan();   // « sauvegarder » désactivé tant que départ et arrivée manquent

  // Espaces aériens : chargés depuis le GeoJSON converti, s'il y en a un. Au
  // premier lancement il n'y en a pas — la carte s'ouvre sans, et le menu
  // Importer explique où prendre le fichier du SIA.
  chargerEspaces();

  window.cap.getConfig().then((cfg) => {
    lastConfig = cfg;
    renderApiHint();
  });
}

// Les traductions d'abord : l'écran d'accueil parle avant que l'application
// existe. Puis le verrou, qui décide de la suite.
initI18n();
updateAccesLangue();
initAcces();
