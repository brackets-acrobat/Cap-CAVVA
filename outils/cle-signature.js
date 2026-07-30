/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// cle-signature.js — imprime la clé HMAC dérivée, en hexadécimal.
//
//   npm run brief:cle
//
// Le client dérive sa clé par scrypt à partir du secret (voir
// src/main/brief-crypto.js). PHP n'a pas de scrypt en standard : le côté CAVVA
// reçoit donc la clé DÉRIVÉE, une bonne fois, et se contente d'un hash_hmac.
//
//   config.local.php     'cap_cavva' => ['cle_brief' => '<la sortie de ce script>']
//   signature            hash_hmac('sha256', $octets, hex2bin(Config::get('cap_cavva.cle_brief')))
//
// Cette clé est un SECRET PARTAGÉ : elle n'a rien à faire dans un dépôt, ni dans
// un ticket, ni dans une capture d'écran. Elle ne protège de toute façon que
// d'un serveur détourné, pas de quelqu'un qui déballerait l'application (limite
// assumée, cf. l'entête de brief-crypto.js).
// ============================================================

const { cleHex, secretPresent } = require('../src/main/brief-crypto');

if (!secretPresent()) {
  console.error('Aucun secret de signature : la clé ne peut pas être dérivée.');
  console.error('  premier lancement  → npm run brief:secret');
  console.error('  secret sauvegardé  → poser CAP_CAVVA_BRIEF_SECRET, ou restaurer');
  console.error('                       src/main/brief-secret.js');
  process.exit(1);
}

console.log(cleHex());
