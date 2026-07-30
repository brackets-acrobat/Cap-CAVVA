/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// vac-sia.js — cartes VAC du SIA (Atlas VAC).
// ============================================================
//
// Ouvre dans le navigateur par défaut la carte VAC (PDF) d'un aérodrome de
// France métropolitaine, publiée par le SIA.
//
// FORME DE L'URL (vérifiée en direct, cycle du 09 JUL 2026) :
//   https://www.sia.aviation-civile.gouv.fr/media/dvd
//     /eAIP_09_JUL_2026/Atlas-VAC/PDF_AIPparSSection/VAC/AD/AD-2.LFPO.pdf
// Le segment « /media/ » est obligatoire : sans lui le serveur répond 404.
//
// LE CYCLE. L'eAIP est republié tous les 28 jours (cycle AIRAC) et le nom du
// dossier porte la date d'entrée en vigueur. On la calcule donc à partir d'une
// date d'ancrage, sans réseau. Mais le calendrier ne suffit pas : le jour d'une
// bascule, le dossier du nouveau cycle peut n'être pas encore en ligne — le
// 06 AUG 2026 répondait 404 alors que le 11 JUN 2026 (cycle précédent) répondait
// toujours 200. On confirme donc le cycle par une requête sur un aérodrome
// SENTINELLE, avec repli sur le cycle précédent, une fois par session.
//
// L'ÉLIGIBILITÉ. Seuls les codes « LF + deux lettres » sont de vrais codes OACI
// métropolitains ; les pistes ULM et terrains privés portent des codes du genre
// LF0121, LF01G, LF0A1, LF064 — non publiés au SIA. Le filtre par la forme du
// code ne suffit pourtant pas : LFPI (Issy, hélistation) et LFPV (Villacoublay,
// militaire) ont un code régulier mais ne figurent pas à l'Atlas VAC. Il n'y a
// pas de règle sur le code qui permette de le savoir : on vérifie l'existence du
// PDF avant d'ouvrir, et on le dit franchement quand il n'y en a pas.
// ============================================================

const { shell } = require('electron');

const BASE = 'https://www.sia.aviation-civile.gouv.fr/media/dvd';

// Date d'entrée en vigueur d'un cycle AIRAC connu, et période. Vérifiée en
// ligne : eAIP_09_JUL_2026 répond 200.
const ANCRAGE_AIRAC = Date.UTC(2026, 6, 9);
const PERIODE_MS = 28 * 24 * 60 * 60 * 1000;

// Aérodrome dont la carte VAC existe de façon certaine : sert à reconnaître le
// cycle en ligne. Un 404 sur lui signifie « ce dossier n'existe pas », jamais
// « cet aérodrome n'a pas de VAC ».
const SENTINELLE = 'LFPO';

const TIMEOUT_MS = 10000;

const MOIS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

// ------------------------------------------------------------
// Cycle
// ------------------------------------------------------------

// Nom de dossier « DD_MMM_YYYY » du cycle en vigueur à la date donnée.
function cycleAirac(quand) {
  const t = (quand instanceof Date ? quand : new Date()).getTime();
  const n = Math.floor((t - ANCRAGE_AIRAC) / PERIODE_MS);
  const d = new Date(ANCRAGE_AIRAC + n * PERIODE_MS);
  const jj = String(d.getUTCDate()).padStart(2, '0');
  return `${jj}_${MOIS[d.getUTCMonth()]}_${d.getUTCFullYear()}`;
}

// Cycle précédant celui-ci.
function cyclePrecedent(cycle) {
  const [jj, mmm, aaaa] = cycle.split('_');
  const t = Date.UTC(Number(aaaa), MOIS.indexOf(mmm), Number(jj));
  return cycleAirac(new Date(t - PERIODE_MS));
}

// ------------------------------------------------------------
// URL et éligibilité
// ------------------------------------------------------------

function urlVac(code, cycle) {
  return `${BASE}/eAIP_${cycle}/Atlas-VAC/PDF_AIPparSSection/VAC/AD/AD-2.${code}.pdf`;
}

// Normalise ce que porte le marqueur (code OACI, code GPS ou ident) en un
// candidat comparable.
function normaliser(code) {
  return String(code == null ? '' : code).trim().toUpperCase();
}

// « LF + deux lettres » : France métropolitaine, code OACI régulier. Exclut les
// pistes ULM et terrains privés (LF0121, LF01G, LF064…), qui ne sont pas au SIA.
function estEligible(code) {
  return /^LF[A-Z]{2}$/.test(normaliser(code));
}

// ------------------------------------------------------------
// Réseau
// ------------------------------------------------------------

// true / false selon que le PDF existe. Lève sur incident réseau, pour ne pas
// confondre « absent » et « injoignable ».
async function existe(url) {
  let res;
  try {
    res = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    const err = new Error(`${url} : ${e.message}`);
    err.raison = 'reseau';
    throw err;
  }
  if (res.status === 404) return false;
  if (!res.ok) {
    const err = new Error(`${url} : HTTP ${res.status}`);
    err.raison = 'reseau';
    throw err;
  }
  return true;
}

// Cycle confirmé en ligne, mémorisé pour la session. Réinvalidé dès que le
// calendrier change de cycle, pour que l'app suive une publication sans
// redémarrage.
let _cycleRetenu = null;   // { calcule, enLigne }

async function resoudreCycle() {
  const calcule = cycleAirac(new Date());
  if (_cycleRetenu && _cycleRetenu.calcule === calcule) return _cycleRetenu.enLigne;

  const candidats = [calcule, cyclePrecedent(calcule)];
  for (const c of candidats) {
    if (await existe(urlVac(SENTINELLE, c))) {
      _cycleRetenu = { calcule, enLigne: c };
      return c;
    }
  }
  const err = new Error(`aucun cycle en ligne (essayés : ${candidats.join(', ')})`);
  err.raison = 'reseau';
  throw err;
}

// ------------------------------------------------------------
// Point d'entrée
// ------------------------------------------------------------

// Ouvre la carte VAC de l'aérodrome dans le navigateur par défaut.
// Retourne { ok: true, url, cycle } ou { ok: false, raison } avec raison dans
// 'non-eligible' | 'absente' | 'reseau'.
async function ouvrirVac(code) {
  const c = normaliser(code);
  if (!estEligible(c)) return { ok: false, raison: 'non-eligible' };
  try {
    const cycle = await resoudreCycle();
    const url = urlVac(c, cycle);
    if (!await existe(url)) return { ok: false, raison: 'absente' };
    await shell.openExternal(url);
    return { ok: true, url, cycle };
  } catch (e) {
    return { ok: false, raison: e.raison || 'reseau', detail: e.message };
  }
}

module.exports = { ouvrirVac, estEligible, cycleAirac, cyclePrecedent, urlVac };
