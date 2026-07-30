/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// force-electron.js — réinstallation manuelle du binaire Electron.
// Contourne l'échec silencieux d'extraction du binaire pendant
// « npm install » sous Windows (« Electron failed to install correctly »).
// Télécharge le zip officiel correspondant à la version installée, le
// ré-extrait dans node_modules/electron/dist et recrée path.txt.
// Usage : npm run force-electron
// ============================================================

const { downloadArtifact } = require('@electron/get');
const extract = require('extract-zip');
const path = require('path');
const fs = require('fs-extra');

async function main() {
  try {
    const version = require('electron/package.json').version;
    console.log(`1. Téléchargement du binaire Electron v${version} (win32-x64)…`);
    const zipPath = await downloadArtifact({
      version,
      platform: 'win32',
      arch: 'x64',
      artifactName: 'electron',
    });
    console.log(`   ZIP récupéré dans le cache : ${zipPath}`);

    const targetDir = path.join(__dirname, 'node_modules', 'electron', 'dist');
    console.log(`2. Nettoyage du dossier cible : ${targetDir}`);
    await fs.emptyDir(targetDir);

    console.log('3. Extraction du binaire…');
    await extract(zipPath, { dir: targetDir });

    const pathTxt = path.join(__dirname, 'node_modules', 'electron', 'path.txt');
    await fs.writeFile(pathTxt, 'electron.exe');

    console.log('Electron a été (ré)installé manuellement avec succès.');
  } catch (err) {
    console.error('Erreur lors de l\'installation forcée :', err);
    process.exit(1);
  }
}

main();
