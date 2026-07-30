/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// brief-source.js — téléchargement des briefs de séance.
//
// TOUS les briefs, pas seulement le prochain : le site publie le calendrier
// complet des vols d'aéroclub (une quarantaine de dates), et un pilote doit
// pouvoir préparer la séance du mois prochain aussi bien que celle de ce soir.
//
// Un seul fichier, une seule signature. À ~150 octets par vol, la collection
// entière tient dans quelques kilo-octets : un index à télécharger puis un
// fichier par date serait de la complexité sans contrepartie.
//
// Deux contrôles, qui répondent à deux questions différentes — même principe
// que tours-source.js dans Tours CAVVA :
//   • la CLÉ CAVVA accompagne chaque requête : le serveur répond 401/403 à qui
//     n'est pas inscrit sur le site ;
//   • la SIGNATURE publiée à côté du JSON (briefs.json.sig) doit correspondre :
//     un serveur détourné (fichier hosts, proxy, point d'accès public) ne peut
//     pas annoncer d'autres zones actives.
//
// La signature porte sur les OCTETS TÉLÉCHARGÉS, avant tout JSON.parse : elle
// est vérifiée d'abord, le contenu n'est interprété qu'ensuite.
//
// Rien n'est mis en cache : le calendrier bouge, une séance s'annule, une zone
// change. Un brief conservé serait un brief faux.
//
// ── Ce que ce module NE fait PAS ────────────────────────────────────────────
// Il ne cherche pas à comprendre les zones. Le champ `zones` du site est du
// TEXTE LIBRE saisi par l'organisateur (« R45 S2 LANGRES », « R46A R46B R46C »,
// « NON »). Le rapprochement avec l'export du SIA se fait côté renderer, où la
// géométrie est chargée — voir brief-zones.js.
//
// Il ne résout pas non plus les coordonnées : le brief ne porte qu'un code
// OACI d'arrivée, et l'application le retrouve dans sa base MSFS.
//
// Les erreurs sont typées (e.code) pour que l'interface distingue « clé
// refusée » de « hors ligne » de « rien de publié » :
//
//   nokey        aucune clé enregistrée
//   unauthorized clé refusée par le serveur (401 / 403)
//   absent       le serveur ne publie rien (404) — pas une panne
//   network      serveur injoignable, délai dépassé, autre code HTTP
//   signature    signature absente ou invalide → contenu rejeté
//   content      collection illisible, ou champ obligatoire manquant
//
// Le format attendu est spécifié dans FORMAT-BRIEF.md, à la racine du dépôt.
// ============================================================

const { verifier } = require('./brief-crypto');

// Version de format que ce client sait lire. Un numéro plus élevé est refusé
// plutôt qu'interprété de travers : mieux vaut « mettez à jour l'application »
// qu'un rayon lu dans la mauvaise unité.
const FORMAT_ATTENDU = 1;

const CHEMIN = '/cap-cavva/briefs.json';
const TIMEOUT_MS = 10000;

// Racine du site. CAVVA_BASE_URL prime sur la configuration : c'est ce qui
// permet de viser une instance locale le temps d'un essai (voir
// outils/serveur-brief-essai.js). La signature reste vérifiée dans tous les cas.
function racine(apiBaseUrl) {
  const brut = process.env.CAVVA_BASE_URL || apiBaseUrl || 'https://cavva.sixk.me';
  return String(brut).replace(/\/+$/, '');
}

function urlBriefs(apiBaseUrl) { return racine(apiBaseUrl) + CHEMIN; }

function echec(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

// La clé part dans deux en-têtes : « Authorization: Bearer » (usuel) et
// « X-API-Key » (accepté tel quel par la plupart des configurations Apache /
// nginx / PHP). Le serveur n'a qu'à lire celui qui l'arrange — c'est déjà ce que
// fait CleApi::exigerMembre() pour Tours.
function entetes(apiKey) {
  const h = { 'Cache-Control': 'no-cache', Accept: 'application/json, text/plain' };
  if (apiKey) {
    h.Authorization = `Bearer ${apiKey}`;
    h['X-API-Key'] = apiKey;
  }
  return h;
}

// En-tête par lequel le serveur peut livrer la signature AVEC le contenu, en une
// seule réponse. Voir SIGNATURE_EN_LIGNE plus bas.
const ENTETE_SIGNATURE = 'x-cap-signature';

async function telecharger(url, apiKey) {
  let res;
  try {
    res = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
      headers: entetes(apiKey),
    });
  } catch (e) {
    throw echec('network', `${url} : ${e.message}`);
  }
  if (res.status === 401 || res.status === 403) throw echec('unauthorized', `${url} : HTTP ${res.status}`);
  if (res.status === 404) throw echec('absent', `${url} : HTTP 404`);
  if (!res.ok) throw echec('network', `${url} : HTTP ${res.status}`);
  return {
    octets: Buffer.from(await res.arrayBuffer()),
    signature: res.headers.get(ENTETE_SIGNATURE),
  };
}

// ------------------------------------------------------------
// Lecture du contenu
// ------------------------------------------------------------
//
// Chaque champ manquant lève une erreur NOMMÉE, avec le rang du vol fautif.
// C'est volontaire : le seul moyen de savoir que le générateur côté CAVVA écrit
// bien ce que le client attend, c'est que le client le dise franchement quand
// ce n'est pas le cas.

function texte(v) {
  const s = (v == null) ? '' : String(v).trim();
  return s || null;
}

function entier(v) {
  const n = typeof v === 'number' ? v : parseInt(String(v == null ? '' : v).trim(), 10);
  return Number.isFinite(n) ? n : null;
}

// AAAA-MM-JJ, et une vraie date — pas seulement une chaîne bien formée.
// Même exigence que VolValidateur::dateValide() côté site.
function dateIso(v) {
  const s = texte(v);
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + 'T00:00:00Z');
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
}

// Les zones telles que l'organisateur les a tapées. Le site en stocke de 0 à 4,
// chacune ≤ 80 caractères ; on accepte aussi une chaîne unique, par tolérance.
// AUCUNE interprétation ici : « NON » est conservé tel quel et c'est
// brief-zones.js, côté renderer, qui reconnaîtra que ça veut dire « aucune ».
function zonesSaisies(v, ou) {
  if (v == null) return [];
  const liste = Array.isArray(v) ? v : [v];
  const out = [];
  for (const brut of liste) {
    const s = texte(brut);
    if (!s) continue;
    if (s.length > 200) throw echec('content', `${ou} : saisie de zone démesurée (${s.length} caractères)`);
    out.push(s);
  }
  return out;
}

function unBrief(o, i) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) {
    throw echec('content', `briefs[${i}] : ce n'est pas un objet`);
  }
  const ou = `briefs[${i}]`;

  const date = dateIso(o.date);
  if (!date) throw echec('content', `${ou} : « date » manquante ou hors format AAAA-MM-JJ`);

  const rayonNm = entier(o.rayonNm);
  if (rayonNm != null && (rayonNm <= 0 || rayonNm > 5000)) {
    throw echec('content', `${ou} : rayonNm hors bornes (${rayonNm})`);
  }

  return {
    id: texte(o.id),
    date,
    // Type de vol : chaîne libre, affichée telle quelle. Le site la borne à
    // trois valeurs, mais sa colonne est un VARCHAR précisément pour qu'un
    // quatrième type n'oblige à rien ici — on ne referme pas ce qu'il a laissé
    // ouvert.
    typeVol: texte(o.typeVol),
    rayonNm,
    icaoArrivee: texte(o.icaoArrivee),
    zones: zonesSaisies(o.zones, ou),
    notes: texte(o.notes),
    // Nom du fichier joint sur le site, à titre indicatif : son
    // téléchargement passe par une session web, pas par la clé d'API.
    fichier: texte(o.fichier),
  };
}

function normaliser(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    throw echec('content', 'la collection n\'est pas un objet JSON');
  }

  const format = entier(obj.format);
  if (format == null) throw echec('content', '« format » manquant');
  if (format > FORMAT_ATTENDU) {
    throw echec('content', `format ${format} : ces briefs demandent une version plus récente de Cap CAVVA`);
  }

  const liste = obj.briefs;
  if (!Array.isArray(liste)) throw echec('content', '« briefs » doit être un tableau (vide si aucune séance)');

  const briefs = liste.map(unBrief);
  // Du plus ancien au plus récent, comme la liste du site. L'ordre vient d'ici
  // et non du serveur : l'interface n'a pas à s'en soucier.
  briefs.sort((a, b) => a.date.localeCompare(b.date));

  return {
    format,
    genere: texte(obj.genere),
    briefs,
  };
}

// ------------------------------------------------------------

// Deux façons pour le serveur de livrer la signature, et la première est
// meilleure :
//
//   EN LIGNE  l'en-tête X-Cap-Signature accompagne le JSON dans la MÊME réponse ;
//   À CÔTÉ    un second fichier, briefs.json.sig — la façon de Tours.
//
// La différence n'est pas cosmétique. Si le serveur compose le JSON à la volée
// depuis sa base, deux requêtes séparées peuvent tomber de part et d'autre d'une
// modification : le contenu ne correspond alors plus à la signature, et le
// client crie à la falsification alors que personne n'a rien falsifié.
// L'en-tête supprime la fenêtre — et une requête au lieu de deux.
async function resoudreBriefs(apiKey, apiBaseUrl) {
  if (!apiKey) throw echec('nokey', 'aucune clé CAVVA enregistrée');

  const url = urlBriefs(apiBaseUrl);
  const rep = await telecharger(url, apiKey);

  let signature = rep.signature;
  if (!signature) {
    const sig = await telecharger(url + '.sig', apiKey);
    // Tolère « <sig>  briefs.json », la forme que produit sha256sum.
    signature = sig.octets.toString('utf8');
  }
  signature = String(signature).trim().split(/\s+/)[0];

  if (!verifier(rep.octets, signature)) throw echec('signature', 'signature des briefs invalide');

  let obj;
  try {
    obj = JSON.parse(rep.octets.toString('utf8'));
  } catch (e) {
    throw echec('content', `JSON illisible : ${e.message}`);
  }

  return { ...normaliser(obj), url };
}

// Vérifie une clé auprès du serveur, sans rien interpréter du contenu.
//
// On interroge la COLLECTION et non briefs.json.sig, malgré sa taille : un
// serveur qui livre sa signature en en-tête n'a aucune raison de publier le
// fichier .sig, et son 404 se lirait alors « aucune séance publiée » alors qu'il
// y en a quarante. La collection entière pèse quelques kilo-octets — le prix
// d'une réponse sans ambiguïté.
//
// Un 404 dit « clé bonne, rien de publié ». Seul 401/403 met la clé en cause.
async function verifierCle(apiKey, apiBaseUrl) {
  if (!apiKey) return { ok: false, code: 'nokey' };
  try {
    await telecharger(urlBriefs(apiBaseUrl), apiKey);
    return { ok: true };
  } catch (e) {
    if (e.code === 'absent') return { ok: true, code: 'absent' };
    return { ok: false, code: e.code || 'network' };
  }
}

module.exports = { resoudreBriefs, verifierCle, urlBriefs, FORMAT_ATTENDU };
