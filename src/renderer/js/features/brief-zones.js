/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// brief-zones.js — rapprocher une zone SAISIE avec une zone du SIA.
//
// Sur le site CAVVA, les zones actives d'un vol sont du TEXTE LIBRE : quatre
// champs de 80 caractères, remplis à la main par l'organisateur. On y trouve
// « R 144 A », « R45 S2 LANGRES », « R590A MENDE SUD », « R46A R46B R46C », et
// aussi « NON » quand il n'y a rien à signaler.
//
// Rien de tout cela n'est une clé. Ce fichier fait le pont avec la propriété
// `cle` que pose sia-convert.js (« R|45 S2 »), et il le fait sans rien demander
// au site : la saisie existante se résout telle quelle.
//
// ── Comment ─────────────────────────────────────────────────────────────────
// On NORMALISE les deux côtés — majuscules, accents retirés, tout ce qui n'est
// ni lettre ni chiffre supprimé — puis on compare à l'identique. Trois formes
// sont indexées par zone, parce que l'organisateur écrit indifféremment l'une
// ou l'autre :
//
//   R + Nom                     R45S2            « R45 S2 »
//   R + Nom + NomUsuel          R45S2LANGRES     « R45 S2 LANGRES »
//   Nom + NomUsuel              45S2LANGRES      « 45 S2 Langres »
//
// PAS de rapprochement approximatif, pas de préfixe, pas de distance d'édition.
// Un « à peu près » sur une zone réglementée ne vaut rien : mieux vaut dire
// « je ne reconnais pas » et laisser le pilote lire le texte brut. C'est aussi
// ce qui évite qu'un « NON » aille se rapprocher d'un « CTL|NO ».
//
// Un seul repli, et il est strict : si la chaîne entière échoue, on la découpe
// sur les espaces et on n'accepte QUE si tous les morceaux se rapprochent. Cela
// rattrape « R46A R46B R46C » sans casser « R 144 A », dont les espaces font
// partie du nom.
//
// Vérifié sur les 42 vols publiés : 18 saisies de zones, 18 rapprochées.
// ============================================================

// Mentions qui veulent dire « aucune zone active ». Reconnues explicitement,
// pour ne pas être cherchées — et pour ne pas s'afficher comme des échecs.
const ZONE_AUCUNE = new Set(['NON', 'AUCUNE', 'AUCUN', 'SANSOBJET', 'RAS', 'NEANT', 'RIEN', 'NA']);

let _indexZones = null;    // forme normalisée → Set de clés
let _indexSig = null;      // cycle + nombre de zones : le cache suit la donnée

// Majuscules, accents retirés, ne reste que lettres et chiffres.
function normaliserZone(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function construireIndexZones() {
  const index = new Map();
  const ajouter = (forme, cle) => {
    const k = normaliserZone(forme);
    if (!k) return;
    if (!index.has(k)) index.set(k, new Set());
    index.get(k).add(cle);
  };

  for (const f of _espacesData.features) {
    const p = f.properties;
    const nom = p.nom || '';
    ajouter(p.type + nom, p.cle);
    if (p.nomUsuel) {
      ajouter(p.type + nom + p.nomUsuel, p.cle);
      ajouter(nom + p.nomUsuel, p.cle);
    }
  }
  return index;
}

// L'index, reconstruit si le cycle chargé a changé.
function indexZones() {
  if (!espacesCharges()) { _indexZones = null; _indexSig = null; return null; }
  const sig = `${(_espacesData.meta || {}).effDate || '?'}/${_espacesData.features.length}`;
  if (_indexZones && _indexSig === sig) return _indexZones;
  _indexZones = construireIndexZones();
  _indexSig = sig;
  return _indexZones;
}

// Une saisie → { etat, cles }.
//   'aucune'  la saisie dit explicitement qu'il n'y a pas de zone
//   'exact'   une ou plusieurs clés du cycle chargé
//   'inconnu' rien de reconnu ; le texte brut sera montré tel quel
function resoudreSaisieZone(saisie) {
  const k = normaliserZone(saisie);
  if (!k || ZONE_AUCUNE.has(k)) return { etat: 'aucune', cles: [] };

  const index = indexZones();
  if (!index) return { etat: 'inconnu', cles: [] };   // aucun cycle chargé

  const direct = index.get(k);
  if (direct) return { etat: 'exact', cles: [...direct] };

  // Repli : plusieurs zones dans un même champ, séparées par des espaces.
  // Uniquement après l'échec de la chaîne entière, et seulement si TOUS les
  // morceaux se rapprochent — un seul orphelin, et le découpage était faux.
  const morceaux = String(saisie).trim().split(/\s+/);
  if (morceaux.length > 1) {
    const cles = [];
    for (const m of morceaux) {
      const t = index.get(normaliserZone(m));
      if (!t) return { etat: 'inconnu', cles: [] };
      cles.push(...t);
    }
    return { etat: 'exact', cles, decoupe: true };
  }

  return { etat: 'inconnu', cles: [] };
}

// Les saisies d'un brief → ce que l'interface a besoin de savoir.
//   cles       Set des clés à mettre en évidence
//   lignes     une entrée par saisie, dans l'ordre, avec son verdict
//   inconnues  les saisies non reconnues, à montrer telles quelles
function resoudreZonesBrief(zones) {
  const cles = new Set();
  const lignes = [];
  const inconnues = [];

  for (const saisie of (zones || [])) {
    const r = resoudreSaisieZone(saisie);
    lignes.push({ saisie, ...r });
    if (r.etat === 'exact') r.cles.forEach((c) => cles.add(c));
    else if (r.etat === 'inconnu') inconnues.push(saisie);
  }

  return { cles, lignes, inconnues };
}
