/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// sia-import.js — le dossier de dépôt des exports du SIA.
//
// L'application ne livre aucune donnée d'espace aérien : l'export du SIA est
// gratuit mais demande un compte, et le redistribuer engagerait sur sa
// fraîcheur. L'utilisateur télécharge le sien et le dépose dans :
//
//   Documents/Cap CAVVA/sia/
//
// Ce module y cherche le XML_SIA le plus récent, le compare au cycle déjà
// converti, et lance la conversion à la demande. Un fichier peut aussi être
// désigné directement par un dialogue natif — c'est le même chemin ensuite.
//
// Le cycle AIRAC dure 28 jours. On calcule la péremption pour pouvoir le dire,
// sans jamais refuser de tracer : une carte périmée annoncée reste plus utile
// qu'une carte vide.
// ============================================================

const fs = require('fs');
const path = require('path');
const { dialog, shell } = require('electron');

const { dossierSia } = require('./config');
const { convertir } = require('./sia-convert');
const siaData = require('./sia-data');

const CYCLE_JOURS = 28;
const MOTIF = /^XML_SIA_(\d{4}-\d{2}-\d{2})\.xml$/i;

function dossier() {
  const d = dossierSia();
  try { fs.mkdirSync(d, { recursive: true }); } catch (_) { /* repli silencieux */ }
  return d;
}

// Le XML_SIA le plus récent du dossier de dépôt, d'après la date de son nom
// (qui est la date d'entrée en vigueur du cycle, pas celle du téléchargement).
function fichierDepose() {
  let meilleur = null;
  let noms;
  try { noms = fs.readdirSync(dossier()); } catch (_) { return null; }

  for (const nom of noms) {
    const m = MOTIF.exec(nom);
    if (!m) continue;
    if (!meilleur || m[1] > meilleur.effDate) {
      meilleur = { effDate: m[1], nom, chemin: path.join(dossier(), nom) };
    }
  }
  return meilleur;
}

// Nombre de jours écoulés depuis l'entrée en vigueur (négatif = pas encore en
// vigueur, ce qui arrive : le SIA publie le cycle suivant à l'avance).
function joursDepuis(effDate) {
  const d = Date.parse(effDate + 'T00:00:00Z');
  if (!Number.isFinite(d)) return null;
  return Math.floor((Date.now() - d) / 86400000);
}

// Ce que l'interface a besoin de savoir pour décider quoi proposer.
function etat() {
  const converti = siaData.etat();
  const depose = fichierDepose();

  const cycleConverti = converti.present && converti.meta ? converti.meta.effDate : null;
  const age = cycleConverti ? joursDepuis(cycleConverti) : null;

  return {
    present: converti.present,
    meta: converti.meta || null,
    perime: age != null && age > CYCLE_JOURS,
    joursDepuisEffet: age,
    depose: depose ? { nom: depose.nom, effDate: depose.effDate } : null,
    // Un dépôt plus récent que ce qui est converti : il y a quelque chose à faire.
    depotPlusRecent: !!(depose && (!cycleConverti || depose.effDate > cycleConverti)),
    dossier: dossier(),
  };
}

function ouvrirDossier() {
  shell.openPath(dossier());
  return { ok: true, dossier: dossier() };
}

async function choisirFichier(fenetre) {
  const res = await dialog.showOpenDialog(fenetre, {
    title: 'Choisir un export XML du SIA',
    defaultPath: dossier(),
    properties: ['openFile'],
    filters: [{ name: 'Export XML du SIA', extensions: ['xml'] }],
  });
  if (res.canceled || !res.filePaths || !res.filePaths[0]) return { ok: false, canceled: true };
  return { ok: true, chemin: res.filePaths[0] };
}

let _enCours = false;

// Convertit `chemin`, ou à défaut le fichier déposé le plus récent.
async function importer(chemin, envoyer = () => {}) {
  if (_enCours) return { ok: false, error: 'Une conversion est déjà en cours.' };

  let source = chemin;
  if (!source) {
    const depose = fichierDepose();
    if (!depose) {
      return { ok: false, error: 'aucun-fichier', dossier: dossier() };
    }
    source = depose.chemin;
  }

  _enCours = true;
  try {
    const res = await convertir(source, envoyer);
    siaData.reload();
    return res;
  } catch (err) {
    const message = (err && err.message) || String(err);
    envoyer({ type: 'erreur', error: message });
    return { ok: false, error: message };
  } finally {
    _enCours = false;
  }
}

module.exports = { etat, importer, ouvrirDossier, choisirFichier, dossier, CYCLE_JOURS };
