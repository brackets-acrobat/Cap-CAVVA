/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// brief-crypto.js — signature HMAC-SHA256 des briefs de séance.
//
// Un seul usage, contrairement à Tours qui signe aussi la progression : le
// briefs.json publié par CAVVA, accompagné de sa signature.
//
// ── Où est le secret ────────────────────────────────────────────────────────
// PAS ICI. Ce dépôt est public : un secret écrit dans ce fichier serait lisible
// par tout le monde, sans même avoir à déballer l'application — et la signature
// ne vaudrait plus rien. Il est résolu dans cet ordre :
//
//   1. CAP_CAVVA_BRIEF_SECRET       en développement, le temps d'un npm start
//   2. ./brief-secret.js            fichier généré, gitignoré, embarqué à
//                                   l'empaquetage par outils/injecter-secret.js
//
// Aucun des deux : l'application ne peut pas vérifier. Elle le DIT (code
// « secret » côté brief-source.js) au lieu de rejeter tous les briefs comme
// falsifiés — deux diagnostics qui n'ont rien à voir.
//
// LIMITE ASSUMÉE, la même que dans Tours : l'application doit pouvoir vérifier
// SEULE, le secret voyage donc dans le binaire. Cela empêche un serveur détourné
// (fichier hosts, proxy, point d'accès public) d'annoncer d'autres zones
// actives ; ce n'est PAS une protection contre quelqu'un qui déballerait
// l'archive asar.
//
// Côté CAVVA, la signature se calcule avec la MÊME clé dérivée. PHP n'a pas de
// scrypt en standard : `npm run brief:cle` imprime la clé en hexadécimal, à
// déposer dans config.local.php (voir FORMAT-BRIEF.md).
// ============================================================

const crypto = require('crypto');

const SEL = 'cavva-brief';

// Résolution du secret. Le require est sous try : le fichier n'existe pas dans
// un dépôt fraîchement cloné, et c'est un état légitime — pas une panne.
function secret() {
  const env = (process.env.CAP_CAVVA_BRIEF_SECRET || '').trim();
  if (env) return env;
  try {
    const s = require('./brief-secret');
    return (typeof s === 'string' && s.trim()) ? s.trim() : null;
  } catch (_) {
    return null;
  }
}

// L'application est-elle en mesure de vérifier quoi que ce soit ?
function secretPresent() { return secret() !== null; }

// Sel fixe et clé mémorisée : une signature doit rester vérifiable d'une
// exécution à l'autre, et scrypt coûte trop cher pour être rejoué à chaque appel.
let _cle = null;
function cle() {
  if (_cle) return _cle;
  const s = secret();
  if (s === null) throw new Error('secret de signature absent');
  _cle = crypto.scryptSync(s, SEL, 32);
  return _cle;
}

function versBuffer(donnees) {
  return Buffer.isBuffer(donnees) ? donnees : Buffer.from(String(donnees), 'utf8');
}

// Signature hexadécimale (64 caractères) d'un contenu — sur les OCTETS reçus,
// jamais sur un JSON re-sérialisé : deux sérialisations diffèrent par un espace
// et la signature ne collerait plus.
function signer(donnees) {
  return crypto.createHmac('sha256', cle()).update(versBuffer(donnees)).digest('hex');
}

// Vérification à temps constant. Renvoie false si le secret manque : l'appelant
// doit avoir vérifié secretPresent() avant, pour distinguer les deux cas.
function verifier(donnees, signature) {
  if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature.trim())) return false;
  if (!secretPresent()) return false;
  const attendue = Buffer.from(signer(donnees), 'hex');
  const fournie = Buffer.from(signature.trim().toLowerCase(), 'hex');
  return fournie.length === attendue.length && crypto.timingSafeEqual(attendue, fournie);
}

// La clé dérivée, en hexadécimal — pour le générateur côté serveur.
function cleHex() { return cle().toString('hex'); }

module.exports = { signer, verifier, cleHex, secretPresent };
