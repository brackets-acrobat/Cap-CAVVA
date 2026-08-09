/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// sia-data.js — lecture du GeoJSON des espaces aériens converti.
//
// Contrairement aux bases MSFS (des dizaines de milliers d'aéroports, servies
// par bounding box), les espaces français tiennent en ~2 200 zones et 3,5 Mo :
// on les envoie EN UNE FOIS au renderer, qui les garde.
//
// Ce n'est pas de la paresse, c'est la condition du reste : savoir dans quelles
// zones se trouve un point — et surtout où l'avion sera dans 90 secondes —
// suppose d'interroger toute la géométrie à chaque image. Un aller-retour IPC
// par interrogation rendrait l'anticipation impossible.
//
// Chargement paresseux, cache invalidé par reload() après une conversion.
// ============================================================

const fs = require('fs');

const { cheminSortie, cheminPointsVfr } = require('./sia-convert');

let _cache = null;   // { meta, features } | null si absent
let _cacheVfr = null;

function charger() {
  if (_cache) return _cache;
  try {
    _cache = JSON.parse(fs.readFileSync(cheminSortie(), 'utf-8'));
  } catch (_) {
    _cache = null;   // pas encore converti : état légitime au premier lancement
  }
  return _cache;
}

// Les points de report VFR, dans leur propre fichier. Un export converti avant
// que cette fonctionnalité existe n'en a pas : absence légitime, pas une erreur.
function chargerPointsVfr() {
  if (_cacheVfr) return _cacheVfr;
  try {
    _cacheVfr = JSON.parse(fs.readFileSync(cheminPointsVfr(), 'utf-8'));
  } catch (_) {
    _cacheVfr = null;
  }
  return _cacheVfr;
}

function reload() { _cache = null; _cacheVfr = null; return charger(); }

// Y a-t-il des espaces disponibles, et de quel cycle ?
function etat() {
  const g = charger();
  if (!g || !Array.isArray(g.features)) return { present: false };
  return { present: true, meta: g.meta || null };
}

// La collection entière, ou null si rien n'a encore été converti.
function espaces() {
  const g = charger();
  return g && Array.isArray(g.features) ? g : null;
}

// Les points de report VFR (~1 100 repères, 200 Ko) : envoyés en une fois comme
// les espaces. Le filtrage par cadre se fait côté carte, à chaque déplacement —
// un aller-retour IPC par mouvement de souris coûterait plus que la collection.
function pointsVfr() {
  const g = chargerPointsVfr();
  return g && Array.isArray(g.features) ? g : null;
}

module.exports = { espaces, pointsVfr, etat, reload };
