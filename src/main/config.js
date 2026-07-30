/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// config.js — chargement de la configuration locale.
//
// Priorité de lecture : settings.json (inscriptible — la clé CAVVA saisie dans
// l'UI y est écrite) > config.json (racine, gitignoré) > config.example.json >
// défauts. settings.json est le SEUL fichier écrit ici ; il est centralisé
// dans le dossier de travail « Documents/Cap CAVVA », aux côtés de data/
// (bases MSFS + espaces convertis) et de sia/ (dépôt des exports du SIA) — et
// non dans l'arborescence du code, pour fonctionner aussi en app packagée où
// l'asar est en lecture seule.
// ============================================================

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const ROOT = path.join(__dirname, '..', '..');

// Dossier de travail commun (data/, sia/, settings.json).
// Déterminé par dossierTravail (config.json/example) sinon « Documents/Cap
// CAVVA ». NB : on ignore ici settings.json (qui s'y trouve) pour éviter toute
// dépendance circulaire — l'emplacement du dossier ne s'auto-déplace pas.
function dossierBase() {
  const exemple = lireFichier(path.join(ROOT, 'config.example.json'));
  const local = lireFichier(path.join(ROOT, 'config.json'));
  const choisi = ((local && local.dossierTravail) || (exemple && exemple.dossierTravail) || '').trim();
  return choisi || path.join(app.getPath('documents'), 'Cap CAVVA');
}

// Sous-dossiers de travail, créés à la demande.
function dossierDonnees() { return path.join(dossierBase(), 'data'); }
function dossierSia() { return path.join(dossierBase(), 'sia'); }

// Réglages inscriptibles (clé CAVVA saisie dans l'UI), dans le dossier de travail.
function cheminSettings() {
  return path.join(dossierBase(), 'settings.json');
}

const DEFAULTS = {
  // Défaut de l'app distribuée : la prod. En dev, un config.json local
  // (gitignoré, non packagé) peut pointer ailleurs — la signature du brief
  // reste vérifiée quelle que soit l'origine.
  apiBaseUrl: 'https://cavva.sixk.me',
  apiKey: '',
  dossierTravail: '',
};

function lireFichier(p) {
  try {
    const brut = fs.readFileSync(p, 'utf-8');
    const obj = JSON.parse(brut);
    // On ignore les clés de commentaire (préfixe _).
    return Object.fromEntries(Object.entries(obj).filter(([k]) => !k.startsWith('_')));
  } catch (_) {
    return null;
  }
}

// Charge la config effective.
// Priorité : CAVVA_API_KEY > settings.json > config.json > config.example.json > défauts.
//
// CAVVA_API_KEY est le pendant de CAVVA_BASE_URL (cf. brief-source.js) : viser une
// instance locale ne sert à rien si la clé enregistrée n'y est pas connue, et la
// remplacer dans l'UI ferait perdre celle de production — la modale ne réaffiche
// jamais le secret stocké. La variable ne touche donc à aucun fichier : le temps
// d'un `npm start`, et c'est tout.
function chargerConfig() {
  const exemple = lireFichier(path.join(ROOT, 'config.example.json'));
  const local = lireFichier(path.join(ROOT, 'config.json'));
  const reglages = lireFichier(cheminSettings());
  const cfg = { ...DEFAULTS, ...(exemple || {}), ...(local || {}), ...(reglages || {}) };

  const cleEnv = (process.env.CAVVA_API_KEY || '').trim();
  if (cleEnv) cfg.apiKey = cleEnv;

  const cleConfiguree = !!cfg.apiKey && cfg.apiKey !== 'REMPLACE-MOI-PAR-TA-CLE-CAVVA';

  const source = cleEnv ? 'CAVVA_API_KEY'
    : (reglages && reglages.apiKey) ? 'paramètres'
    : (local ? 'config.json' : (exemple ? 'config.example.json' : 'défauts'));

  return { ...cfg, _source: source, _cleConfiguree: cleConfiguree };
}

// Persiste la clé CAVVA (et éventuellement l'URL du site) dans settings.json,
// puis renvoie la config rechargée. Une clé vide efface le réglage stocké.
function enregistrerCle(apiKey, apiBaseUrl) {
  const p = cheminSettings();
  const courant = lireFichier(p) || {};

  const cle = (apiKey || '').trim();
  if (cle) courant.apiKey = cle; else delete courant.apiKey;

  if (typeof apiBaseUrl === 'string') {
    const url = apiBaseUrl.trim();
    if (url) courant.apiBaseUrl = url; else delete courant.apiBaseUrl;
  }

  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(courant, null, 2), 'utf-8');
  return chargerConfig();
}

module.exports = {
  chargerConfig, enregistrerCle,
  dossierBase, dossierDonnees, dossierSia,
  DEFAULTS,
};
