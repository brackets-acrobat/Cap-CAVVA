/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// signer-brief.js — signe un briefs.json et écrit son briefs.json.sig.
//
//   node outils/signer-brief.js chemin/vers/briefs.json
//
// Équivalent de build/sign-data.js dans Tours CAVVA. Utile pour publier la
// collection à la main, ou pour vérifier ce que le générateur du site devra
// produire.
//
// La signature porte sur les OCTETS DU FICHIER, tels qu'ils seront servis. Ne
// jamais re-sérialiser le JSON entre la signature et la publication : un espace
// de différence, et le client rejette tout — c'est précisément son rôle.
// ============================================================

const fs = require('fs');
const path = require('path');

const { signer } = require('../src/main/brief-crypto');

const cible = process.argv[2];
if (!cible) {
  console.error('Usage : node outils/signer-brief.js <briefs.json>');
  process.exit(2);
}

const chemin = path.resolve(cible);
let octets;
try {
  octets = fs.readFileSync(chemin);
} catch (e) {
  console.error(`Lecture impossible : ${e.message}`);
  process.exit(1);
}

// Un brief illisible ne se signe pas : autant le dire ici plutôt que de laisser
// le client répondre « JSON illisible » après une signature pourtant valide.
try {
  JSON.parse(octets.toString('utf8'));
} catch (e) {
  console.error(`Ce n'est pas du JSON valide : ${e.message}`);
  process.exit(1);
}

const signature = signer(octets);
const sortie = chemin + '.sig';
fs.writeFileSync(sortie, signature + '\n', 'utf8');

console.log(`${path.basename(chemin)} : ${octets.length} octets`);
console.log(`signature  : ${signature}`);
console.log(`écrite     : ${sortie}`);
