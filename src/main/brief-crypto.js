/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// brief-crypto.js — signature HMAC-SHA256 des briefs de séance.
//
// Un seul usage, contrairement à Tours qui signe aussi la progression : le
// briefs.json publié par CAVVA, accompagné de son briefs.json.sig.
//
// LIMITE ASSUMÉE, la même que dans Tours : l'application doit pouvoir vérifier
// SEULE, la clé est donc dérivée d'un secret présent dans le code. Cela empêche
// un serveur détourné (fichier hosts, proxy, point d'accès public) d'annoncer
// d'autres zones actives ; ce n'est PAS une protection contre quelqu'un qui
// déballerait l'archive asar pour y lire ce fichier.
//
// Côté CAVVA, la signature se calcule avec la MÊME clé dérivée. PHP n'a pas de
// scrypt en standard : `node outils/cle-signature.js` imprime la clé en
// hexadécimal, à déposer dans config.local.php (voir FORMAT-BRIEF.md).
// ============================================================

const crypto = require('crypto');

const SECRET = 'Cap-CAVVA/2026/Cyril-MILANI/brief-de-la-seance';
const SEL = 'cavva-brief';

// Sel fixe et clé mémorisée : une signature doit rester vérifiable d'une
// exécution à l'autre, et scrypt coûte trop cher pour être rejoué à chaque appel.
let _cle = null;
function cle() {
  if (!_cle) _cle = crypto.scryptSync(SECRET, SEL, 32);
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

// Vérification à temps constant.
function verifier(donnees, signature) {
  if (typeof signature !== 'string' || !/^[0-9a-f]{64}$/i.test(signature.trim())) return false;
  const attendue = Buffer.from(signer(donnees), 'hex');
  const fournie = Buffer.from(signature.trim().toLowerCase(), 'hex');
  return fournie.length === attendue.length && crypto.timingSafeEqual(attendue, fournie);
}

// La clé dérivée, en hexadécimal — pour le générateur côté serveur.
function cleHex() { return cle().toString('hex'); }

module.exports = { signer, verifier, cleHex };
