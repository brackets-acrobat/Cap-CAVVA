/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// main.js — process principal Electron.
//
// Ce fichier ne fait que trois choses : ouvrir les fenêtres, relayer le flux
// SimConnect vers le renderer, et câbler les canaux IPC. Tout le métier vit
// dans les modules voisins — un par fonctionnalité :
//
//   config.js       réglages et dossiers de travail
//   simconnect.js   connexion au simulateur, lecture des SimVars
//   msfs-import.js  import des aéroports et navaids depuis MSFS 2024
//   airports-data.js  lecture des bases extraites, requêtes par bbox
//   elevation.js    relief GLOBE et profil vertical
//   declinaison.js  déclinaison magnétique (WMM)
//   plan-io.js      sauvegarde et ouverture d'un plan de vol
//   updater.js      mise à jour automatique
//
// Si un handler ci-dessous dépasse trois lignes, c'est qu'il appartient à un
// module.
// ============================================================

const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');

const { chargerConfig, enregistrerCle, dossierBase } = require('./config');
const { SimConnectClient } = require('./simconnect');
const msfsImport = require('./msfs-import');
const airportsData = require('./airports-data');
const siaImport = require('./sia-import');
const siaData = require('./sia-data');
const elevation = require('./elevation');
const declinaison = require('./declinaison');
const planIo = require('./plan-io');
const { setupAutoUpdater, quitAndInstall } = require('./updater');

const TITRE = 'Cap CAVVA';
const FOND = '#12151a';
const SPLASH_MS = 4000;

// Centralise les données d'Electron (cache, localStorage, session…) dans un
// sous-dossier du dossier de travail au lieu d'AppData → tout au même endroit
// que data/, sia/ et settings.json. À faire AVANT que l'app soit « ready ».
try {
  const userData = path.join(dossierBase(), 'app-data');
  fs.mkdirSync(userData, { recursive: true });
  app.setPath('userData', userData);
} catch (_) { /* repli silencieux sur l'emplacement par défaut */ }

let fenetre = null;
let config = chargerConfig();
const sim = new SimConnectClient();

function diffuser(canal, charge) {
  BrowserWindow.getAllWindows().forEach((w) => {
    try { w.webContents.send(canal, charge); } catch (_) {}
  });
}

// Envoie la progression à la fenêtre qui a lancé l'opération (et pas aux
// autres) : c'est elle qui affiche la barre.
function versEmetteur(event, canal) {
  const wc = event.sender;
  return (p) => { if (wc && !wc.isDestroyed()) wc.send(canal, p); };
}

// --- Relais SimConnect -------------------------------------------------------
// 'scan' est déjà limité à ~2 Hz par simconnect.js : suffisant pour l'affichage
// de la position, et l'IPC ne se noie pas. 'frame' (chaque image) n'est pas
// relayé — personne ne le consomme tant que la validation du toucher n'est pas
// au programme.
sim.on('status', (s) => diffuser('sc-status', s));
sim.on('scan', (trame) => diffuser('sc-scan', trame));

// --- Fenêtres ----------------------------------------------------------------

// Splash : fenêtre sans cadre à la taille de l'image, affichée pendant que la
// fenêtre principale se charge en arrière-plan. La version est injectée par
// executeJavaScript (pas de script inline : la CSP est stricte).
function creerSplash() {
  const splash = new BrowserWindow({
    width: 640,
    height: 435,
    frame: false,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    backgroundColor: FOND,
    title: TITRE,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  splash.removeMenu();
  splash.loadFile(path.join(__dirname, '..', 'renderer', 'splash.html'));
  splash.webContents.on('did-finish-load', () => {
    const v = JSON.stringify('v' + app.getVersion());
    splash.webContents.executeJavaScript(
      `document.getElementById('splash-version').textContent = ${v};`
    ).catch(() => {});
  });
  return splash;
}

function creerFenetre() {
  fenetre = new BrowserWindow({
    width: 1100,
    height: 720,
    backgroundColor: FOND,
    title: TITRE,
    show: false,   // révélée à la fin du splash (voir whenReady)
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  fenetre.removeMenu();
  fenetre.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  // Liens externes : navigateur par défaut, jamais une fenêtre Electron.
  fenetre.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // removeMenu() supprime Ctrl+R / F12 → on les rebranche à la main.
  fenetre.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const touche = (input.key || '').toLowerCase();
    if ((input.control && touche === 'r') || touche === 'f5') {
      fenetre.webContents.reload();
      event.preventDefault();
    }
    if ((input.control && input.shift && touche === 'i') || touche === 'f12') {
      fenetre.webContents.toggleDevTools();
      event.preventDefault();
    }
  });
}

// --- IPC ---------------------------------------------------------------------

function configPublique() {
  return {
    apiBaseUrl: config.apiBaseUrl,
    cleConfiguree: config._cleConfiguree,
    source: config._source,
    version: app.getVersion(),
  };
}

ipcMain.handle('app-config', async () => configPublique());

// Enregistre la clé CAVVA saisie dans l'UI, recharge la config et notifie.
ipcMain.handle('config-set-key', async (_e, { apiKey, apiBaseUrl } = {}) => {
  try {
    config = enregistrerCle(apiKey, apiBaseUrl);
  } catch (e) {
    return { ok: false, error: e && e.message };
  }
  const pub = configPublique();
  diffuser('app-config', pub);
  return { ok: true, ...pub };
});

// Simulateur
ipcMain.handle('sc-connect', async () => sim.connecter());
ipcMain.handle('sc-disconnect', async () => { await sim.deconnecter(); return { ok: true }; });

// Import MSFS 2024
ipcMain.handle('msfs-verifier-lancement', async () => msfsImport.verifierLancement());
ipcMain.handle('extraire-aeroports-msfs', async (e, options) =>
  msfsImport.extraireAeroports(options || {}, versEmetteur(e, 'msfs-extract-progress')));
ipcMain.handle('extraire-navaids-msfs', async (e) =>
  msfsImport.extraireNavaids(versEmetteur(e, 'msfs-navaids-progress')));

// Espaces aériens (export du SIA converti en GeoJSON)
ipcMain.handle('sia-etat', async () => siaImport.etat());
ipcMain.handle('sia-espaces', async () => siaData.espaces());
ipcMain.handle('sia-ouvrir-dossier', async () => siaImport.ouvrirDossier());
ipcMain.handle('sia-choisir-fichier', async () => siaImport.choisirFichier(fenetre));
ipcMain.handle('sia-importer', async (e, chemin) =>
  siaImport.importer(chemin, versEmetteur(e, 'sia-progress')));

// Relief
ipcMain.handle('elevation-existe', async () => elevation.tuilesPresentes());
ipcMain.handle('importer-elevation', async (e) =>
  elevation.importer(versEmetteur(e, 'elevation-progress')));
ipcMain.handle('profil-vertical', async (_e, charge) => elevation.profil(charge));

// Données carte
ipcMain.handle('aeroports-bbox', async (_e, bbox) => airportsData.aeroportsDansBbox(bbox));
ipcMain.handle('navaids-bbox', async (_e, bbox) => airportsData.navaidsDansBbox(bbox));
ipcMain.handle('aeroport-par-code', async (_e, code) => airportsData.aeroportParCode(code));
ipcMain.handle('feature-proche', async (_e, { lat, lon, rayonNm } = {}) =>
  airportsData.featureProche(lat, lon, rayonNm));

// Navigation
ipcMain.handle('declinaison', async (_e, { lat, lon } = {}) => declinaison.en(lat, lon));
ipcMain.handle('sauver-plan', async (_e, charge) => planIo.sauver(fenetre, charge));
ipcMain.handle('ouvrir-plan', async (_e, charge) => planIo.ouvrir(fenetre, charge));

// Mise à jour
ipcMain.handle('update-install', async () => { quitAndInstall(); return { ok: true }; });

// --- Cycle de vie ------------------------------------------------------------

app.whenReady().then(() => {
  const splash = creerSplash();
  creerFenetre();   // fenêtre principale masquée, chargée pendant le splash
  setTimeout(() => {
    if (splash && !splash.isDestroyed()) splash.close();
    if (fenetre && !fenetre.isDestroyed()) { fenetre.maximize(); fenetre.show(); fenetre.focus(); }
  }, SPLASH_MS);

  // Auto-update seulement en app packagée : en dev, electron-updater n'a pas de
  // dev-app-update.yml et lèverait une erreur inutile.
  if (app.isPackaged) setupAutoUpdater(diffuser, fenetre);
});

app.on('window-all-closed', () => {
  sim.deconnecter().finally(() => {
    if (process.platform !== 'darwin') app.quit();
  });
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    creerFenetre();                 // recréée masquée (show:false)…
    fenetre.once('ready-to-show', () => { fenetre.maximize(); fenetre.show(); });   // …puis révélée
  }
});
