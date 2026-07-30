/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// msfs-import.js — import des aéroports et des navaids depuis MSFS 2024.
//
// Le simulateur est la source : ce sont SES terrains qui comptent, pas ceux
// d'une base tierce. On lui parle en SunRise (protocole des facilities), sur
// une connexion DÉDIÉE et éphémère — distincte de la connexion de suivi en
// FSX_SP2 (simconnect.js), qui elle reste ouverte pendant tout le vol.
//
// Les deux extracteurs viennent de NavXpressVFR sans changement de méthode.
// Ce module ne fait que les lancer, garantir qu'un seul tourne à la fois, et
// recharger la base une fois le fichier écrit.
// ============================================================

const { open: scOpen, Protocol: SCProtocol } = require('node-simconnect');

const { dossierDonnees } = require('./config');
const { runExtraction: extraireAeroportsMsfs } = require('./extract-airports-msfs');
const { runExtraction: extraireNavaidsMsfs } = require('./extract-navaids-msfs');
const airportsData = require('./airports-data');

const DELAI_VERIF_MS = 8000;

// Le simulateur répond-il ? Ouverture SunRise éphémère, refermée aussitôt.
// Une promesse résolue une seule fois : le timeout et la réponse courent
// ensemble, le premier arrivé tranche.
function verifierLancement() {
  return new Promise((resolve) => {
    let repondu = false;
    let minuteur = null;

    const finir = (resultat) => {
      if (repondu) return;
      repondu = true;
      if (minuteur) { clearTimeout(minuteur); minuteur = null; }
      resolve(resultat);
    };

    minuteur = setTimeout(
      () => finir({ running: false, error: `timeout (aucune réponse du simulateur en ${DELAI_VERIF_MS / 1000} s)` }),
      DELAI_VERIF_MS
    );

    let ouverture;
    try {
      ouverture = scOpen('CapCAVVA-Check', SCProtocol.SunRise);
    } catch (err) {
      finir({ running: false, error: 'scOpen a échoué : ' + (err && err.message) });
      return;
    }

    ouverture.then((res) => {
      try { res.handle.close(); } catch (_) {}
      finir({ running: true, app: (res.recvOpen && res.recvOpen.applicationName) || 'MSFS' });
    }).catch((err) => {
      finir({ running: false, error: (err && err.message) || 'connexion refusée' });
    });
  });
}

let _aeroportsEnCours = false;
let _navaidsEnCours = false;

async function extraireAeroports(options = {}, envoyer = () => {}) {
  if (_aeroportsEnCours) return { ok: false, error: 'Une extraction est déjà en cours.' };
  _aeroportsEnCours = true;
  try {
    const resume = await extraireAeroportsMsfs({
      outDir: dossierDonnees(),
      window: 100,
      limit: Number.isFinite(options.limit) ? options.limit : 0,
      appName: 'CapCAVVA-Extract',
      onProgress: envoyer,
    });
    if (resume && resume.file) airportsData.reload();   // recharge la base fraîche
    return { ok: true, summary: resume };
  } catch (err) {
    return { ok: false, error: (err && err.message) || 'extraction échouée' };
  } finally {
    _aeroportsEnCours = false;
  }
}

async function extraireNavaids(envoyer = () => {}) {
  if (_navaidsEnCours) return { ok: false, error: 'Une extraction est déjà en cours.' };
  _navaidsEnCours = true;
  try {
    const resume = await extraireNavaidsMsfs({
      outDir: dossierDonnees(),
      window: 80,
      onProgress: envoyer,
    });
    if (resume && resume.file) airportsData.reload();
    return { ok: true, summary: resume };
  } catch (err) {
    return { ok: false, error: (err && err.message) || 'extraction échouée' };
  } finally {
    _navaidsEnCours = false;
  }
}

module.exports = { verifierLancement, extraireAeroports, extraireNavaids };
