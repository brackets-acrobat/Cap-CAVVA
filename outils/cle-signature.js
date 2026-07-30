/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// cle-signature.js — imprime la clé HMAC dérivée, en hexadécimal.
//
//   node outils/cle-signature.js
//
// Le client dérive sa clé par scrypt (voir src/main/brief-crypto.js). PHP n'a
// pas de scrypt en standard : le côté CAVVA reçoit donc la clé DÉRIVÉE, une
// bonne fois, et se contente d'un hash_hmac.
//
//   config.local.php     'cap_cavva' => ['cle_brief' => '<la sortie de ce script>']
//   signature            hash_hmac('sha256', $octets, hex2bin(Config::get('cap_cavva.cle_brief')))
//
// Cette clé est un SECRET PARTAGÉ : elle n'a rien à faire dans un dépôt, ni
// dans un ticket, ni dans une capture d'écran. Elle ne protège de toute façon
// que d'un serveur détourné, pas de quelqu'un qui déballerait l'application
// (limite assumée, cf. l'entête de brief-crypto.js).
// ============================================================

const { cleHex } = require('../src/main/brief-crypto');

console.log(cleHex());
