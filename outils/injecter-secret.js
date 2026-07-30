/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// injecter-secret.js — écrit src/main/brief-secret.js avant l'empaquetage.
//
//   node outils/injecter-secret.js            depuis CAP_CAVVA_BRIEF_SECRET
//   node outils/injecter-secret.js --generer  fabrique un secret neuf
//
// Le secret dont dérive la clé de signature des briefs ne doit PAS être dans le
// dépôt : Cap-CAVVA est public, et un secret versionné est un secret lisible par
// tout le monde, sans même avoir à déballer l'application.
//
// Il vit donc dans un fichier généré, gitignoré, produit ici et embarqué dans
// l'archive au moment du `npm run dist`. La limite redevient celle qui est
// annoncée partout ailleurs : il faut déballer l'asar pour le lire.
//
// EN DÉVELOPPEMENT, la variable d'environnement CAP_CAVVA_BRIEF_SECRET suffit —
// brief-crypto.js la lit en priorité, sans qu'aucun fichier soit nécessaire.
//
// ── À conserver ─────────────────────────────────────────────────────────────
// Ce secret est la seule chose qui relie l'application au serveur. Le perdre
// oblige à en regénérer un ET à remettre la clé dérivée dans le config.local.php
// du site. À sauvegarder hors du dépôt (gestionnaire de mots de passe).
// ============================================================

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CIBLE = path.join(__dirname, '..', 'src', 'main', 'brief-secret.js');
const generer = process.argv.includes('--generer');

let secret = (process.env.CAP_CAVVA_BRIEF_SECRET || '').trim();

if (generer) {
  if (fs.existsSync(CIBLE)) {
    console.error('brief-secret.js existe déjà. Le regénérer invaliderait les briefs');
    console.error('déjà signés par le serveur : supprimer le fichier à la main si');
    console.error('c\'est vraiment ce que tu veux.');
    process.exit(1);
  }
  // 48 octets : bien au-delà de ce que scrypt en tire (32), et sans structure
  // devinable — contrairement à la phrase qui servait avant.
  secret = crypto.randomBytes(48).toString('base64');
} else if (!secret) {
  console.error('CAP_CAVVA_BRIEF_SECRET n\'est pas définie.');
  console.error('  posez-la avant `npm run dist`, ou lancez `npm run brief:secret`');
  console.error('  pour fabriquer un secret neuf la première fois.');
  process.exit(1);
}

const contenu = `/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// brief-secret.js — GÉNÉRÉ, NE PAS VERSIONNER, NE PAS MODIFIER À LA MAIN.
//
// Écrit par outils/injecter-secret.js avant l'empaquetage. Porte le secret dont
// brief-crypto.js dérive la clé de signature des briefs.
//
// Le regénérer change la clé : il faut alors remettre la nouvelle valeur
// (\`npm run brief:cle\`) dans le config.local.php du site, sinon l'application
// refuse les briefs de production.
// ============================================================

module.exports = ${JSON.stringify(secret)};
`;

fs.writeFileSync(CIBLE, contenu, 'utf8');

// L'empreinte permet de vérifier qu'un poste et un serveur parlent du même
// secret sans jamais l'afficher — ni lui, ni la clé qui en dérive.
const empreinte = crypto.createHash('sha256').update(secret).digest('hex').slice(0, 12);

console.log(`${generer ? 'Secret généré' : 'Secret injecté'} → src/main/brief-secret.js`);
console.log(`empreinte : ${empreinte}  (les 12 premiers caractères du SHA-256)`);
if (generer) {
  console.log('');
  console.log('À FAIRE MAINTENANT :');
  console.log('  1. sauvegarder src/main/brief-secret.js hors du dépôt (gestionnaire de mots de passe) ;');
  console.log('  2. `npm run brief:cle` donne la clé dérivée, à mettre dans le config.local.php du site ;');
  console.log('  3. tant que le serveur a l\'ancienne clé, l\'application refuse ses briefs.');
}
