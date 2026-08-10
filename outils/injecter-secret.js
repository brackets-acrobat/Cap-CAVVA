/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// injecter-secret.js — assure que src/main/brief-secret.js est en place avant
// l'empaquetage.
//
//   node outils/injecter-secret.js            garde le fichier, ou l'écrit
//                                             depuis CAP_CAVVA_BRIEF_SECRET
//   node outils/injecter-secret.js --generer  fabrique un secret neuf
//
// ── Pourquoi le fichier existant suffit ─────────────────────────────────────
// Ce script a longtemps EXIGÉ CAP_CAVVA_BRIEF_SECRET, et sortait en erreur
// sans elle. Comme `dist` et `publish` l'enchaînent par `&&`, toute publication
// depuis un terminal neuf s'arrêtait là — et la variable n'est posée nulle part
// de durable, donc tout terminal est neuf. La publication de la 1.3.0 a buté
// exactement là.
//
// Or l'exigence était vide de sens : brief-crypto.js lit la variable OU le
// fichier, indifféremment, et le fichier était déjà là, gitignoré, avec le bon
// secret. Le script réclamait qu'on lui redonne ce qu'il avait déjà.
//
// D'où l'ordre suivant, du plus explicite au plus tacite :
//   1. --generer                  fabrique (refuse d'écraser)
//   2. CAP_CAVVA_BRIEF_SECRET     injecte — rotation, ou premier poste
//   3. le fichier déjà en place   gardé tel quel, empreinte affichée
//   4. rien de tout cela          échec, et c'est justifié : il n'y a rien à
//                                 embarquer
//
// Le cas 3 n'écrit pas : la date du fichier reste donc celle de la dernière
// vraie injection, et non celle du dernier empaquetage. C'est voulu.
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

// Les 12 premiers caractères du SHA-256 : de quoi comparer un poste et un
// serveur sans jamais montrer le secret, ni la clé qui en dérive.
function empreinteDe(s) {
  return crypto.createHash('sha256').update(s).digest('hex').slice(0, 12);
}

// Secret déjà présent dans le fichier généré, ou null. Un fichier illisible ou
// qui n'exporte pas une chaîne non vide compte comme absent : mieux vaut
// échouer que d'empaqueter une application incapable de vérifier un brief.
function secretDuFichier() {
  if (!fs.existsSync(CIBLE)) return null;
  try {
    const s = require(CIBLE);
    return (typeof s === 'string' && s.trim()) ? s.trim() : null;
  } catch (_) {
    return null;
  }
}

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
  // Cas ordinaire d'une publication : le fichier est là depuis la dernière
  // injection, et c'est exactement ce que l'empaquetage doit embarquer.
  const existant = secretDuFichier();
  if (existant) {
    // Date locale, et non toISOString() : c'est l'heure à laquelle on se
    // souvient d'avoir injecté qui parle, pas son équivalent UTC.
    const d = fs.statSync(CIBLE).mtime;
    const dd = (n) => String(n).padStart(2, '0');
    const quand = `${d.getFullYear()}-${dd(d.getMonth() + 1)}-${dd(d.getDate())} ${dd(d.getHours())}:${dd(d.getMinutes())}`;
    console.log(`Secret conservé ← src/main/brief-secret.js (inchangé depuis ${quand})`);
    console.log(`empreinte : ${empreinteDe(existant)}  (les 12 premiers caractères du SHA-256)`);
    process.exit(0);
  }
  console.error('Aucun secret de signature : ni CAP_CAVVA_BRIEF_SECRET, ni un');
  console.error('src/main/brief-secret.js exploitable.');
  console.error('  • premier poste          → `npm run brief:secret` en fabrique un neuf ;');
  console.error('  • secret déjà en service → restaurez votre sauvegarde de brief-secret.js,');
  console.error('    ou posez CAP_CAVVA_BRIEF_SECRET avant de relancer.');
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

console.log(`${generer ? 'Secret généré' : 'Secret injecté'} → src/main/brief-secret.js`);
console.log(`empreinte : ${empreinteDe(secret)}  (les 12 premiers caractères du SHA-256)`);
if (generer) {
  console.log('');
  console.log('À FAIRE MAINTENANT :');
  console.log('  1. sauvegarder src/main/brief-secret.js hors du dépôt (gestionnaire de mots de passe) ;');
  console.log('  2. `npm run brief:cle` donne la clé dérivée, à mettre dans le config.local.php du site ;');
  console.log('  3. tant que le serveur a l\'ancienne clé, l\'application refuse ses briefs.');
}
