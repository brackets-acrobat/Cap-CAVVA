/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// plan-io.js — sauvegarde et ouverture d'un plan de vol.
//
// Format : JSON dans un fichier .ccfp, écrit par des dialogues natifs. Le
// contenu du plan est construit côté renderer (route.js) ; ce module ne fait
// que le poser sur le disque et le relire.
// ============================================================

const fs = require('fs');
const path = require('path');
const { app, dialog } = require('electron');

const EXTENSION = 'ccfp';
const LIBELLE = 'Plan de vol Cap CAVVA';

// Dossier des plans de vol, créé si absent.
function dossierPlans() {
  const dir = path.join(app.getPath('documents'), 'Cap CAVVA', 'plans de vol');
  try { fs.mkdirSync(dir, { recursive: true }); } catch (_) { /* repli silencieux */ }
  return dir;
}

async function sauver(fenetre, { nomSuggere, titre, plan } = {}) {
  try {
    // Nettoie le nom des caractères interdits dans un nom de fichier Windows.
    let nom = String(nomSuggere || '').replace(/[\\/:*?"<>|]/g, '').trim();
    if (!nom) nom = 'plan-de-vol';
    if (!nom.toLowerCase().endsWith('.' + EXTENSION)) nom += '.' + EXTENSION;

    const res = await dialog.showSaveDialog(fenetre, {
      title: titre || 'Sauvegarder le plan de vol',
      defaultPath: path.join(dossierPlans(), nom),
      filters: [{ name: LIBELLE, extensions: [EXTENSION] }],
    });
    if (res.canceled || !res.filePath) return { ok: false, canceled: true };

    fs.writeFileSync(res.filePath, JSON.stringify(plan, null, 2), 'utf-8');
    return { ok: true, filePath: res.filePath };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

async function ouvrir(fenetre, { titre } = {}) {
  try {
    const res = await dialog.showOpenDialog(fenetre, {
      title: titre || 'Ouvrir un plan de vol',
      defaultPath: dossierPlans(),
      properties: ['openFile'],
      filters: [{ name: LIBELLE, extensions: [EXTENSION] }],
    });
    if (res.canceled || !res.filePaths || !res.filePaths[0]) return { ok: false, canceled: true };

    const plan = JSON.parse(fs.readFileSync(res.filePaths[0], 'utf-8'));
    return { ok: true, plan, filePath: res.filePaths[0] };
  } catch (e) {
    return { ok: false, error: (e && e.message) || String(e) };
  }
}

module.exports = { sauver, ouvrir, dossierPlans, EXTENSION };
