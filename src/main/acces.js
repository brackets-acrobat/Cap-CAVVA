/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// acces.js — l'application est-elle ouverte à cet utilisateur ?
//
// Cap CAVVA est réservée aux membres du CAVVA : tant que la clé du site n'a pas
// été acceptée au moins une fois, la fenêtre n'affiche qu'un écran d'accueil et
// rien n'est chargé — ni carte, ni espaces aériens, ni plan de vol.
//
// ── Vérifier, puis faire confiance ──────────────────────────────────────────
// Une clé enregistrée localement ne prouve rien : n'importe qui peut taper
// n'importe quoi. La PREMIÈRE ouverture demande donc l'avis du serveur. Ensuite,
// la date de cette validation est mémorisée (config.js), et une coupure réseau
// n'enferme plus personne dehors — on peut préparer un vol dans un train.
//
// Un refus EXPLICITE du serveur (401/403) reverrouille immédiatement et efface
// la trace : c'est ainsi qu'une clé révoquée coupe l'accès du poste qu'on ne
// possède plus. Un silence du réseau, lui, ne prouve rien et ne décide de rien.
//
// ── Ce que ce verrou est, et ce qu'il n'est pas ─────────────────────────────
// C'est une porte d'entrée, pas une barrière de sécurité. Cap CAVVA est sous
// GPL-3.0 : le code est public, et qui veut peut la retirer et recompiler. Le
// vrai contrôle d'accès est côté serveur — CleApi, qui garde les briefs — et
// lui reste efficace quoi qu'il arrive ici.
// ============================================================

const { chargerConfig, enregistrerValidation } = require('./config');
const briefSource = require('./brief-source');

// Verdicts renvoyés au renderer :
//   { ouvert: true,  raison: null | 'hors-ligne' }
//   { ouvert: false, raison: 'nokey' | 'unauthorized' | 'network' | 'secret' }
//
// 'hors-ligne' n'est pas un refus : l'application s'ouvre sur la foi d'une
// validation antérieure, et le dit.

function etatLocal(config) {
  return {
    cleConfiguree: !!config._cleConfiguree,
    valideeLe: config.cleValideeLe || null,
    apiBaseUrl: config.apiBaseUrl,
    urlCompte: String(config.apiBaseUrl || '').replace(/\/+$/, '') + '/compte',
  };
}

// Verdict SANS appel réseau : ce que l'on sait déjà en ouvrant la fenêtre.
// Sert à peindre l'écran d'accueil avant que la vérification n'aboutisse.
function etat() {
  const config = chargerConfig();
  const local = etatLocal(config);
  if (!local.cleConfiguree) return { ouvert: false, raison: 'nokey', ...local };
  if (local.valideeLe) return { ouvert: true, raison: null, ...local };
  return { ouvert: false, raison: 'network', ...local };
}

// Verdict APRÈS avoir demandé son avis au serveur. C'est celui qui fait foi.
async function verifier() {
  let config = chargerConfig();
  const local = etatLocal(config);

  if (!local.cleConfiguree) return { ouvert: false, raison: 'nokey', ...local };

  const verdict = await briefSource.verifierCle(config.apiKey, config.apiBaseUrl);

  // Accepté — y compris « aucune séance publiée » (404), qui dit bien que la
  // clé est passée. On horodate : c'est ce qui autorisera les prochains
  // lancements hors ligne.
  if (verdict.ok) {
    config = enregistrerValidation(new Date().toISOString());
    return { ouvert: true, raison: null, ...etatLocal(config) };
  }

  // Refus explicite : la clé est mauvaise, révoquée, ou le compte suspendu. On
  // efface la trace — sinon un poste dont la clé vient d'être révoquée
  // continuerait de s'ouvrir hors ligne indéfiniment.
  if (verdict.code === 'unauthorized') {
    config = enregistrerValidation(null);
    return { ouvert: false, raison: 'unauthorized', ...etatLocal(config) };
  }

  // Ni oui ni non : réseau muet, ou copie de l'application sans secret de
  // signature. On s'en remet à la validation antérieure, s'il y en a une.
  const raison = verdict.code === 'secret' ? 'secret' : 'network';
  if (local.valideeLe) return { ouvert: true, raison: 'hors-ligne', ...local };
  return { ouvert: false, raison, ...local };
}

module.exports = { etat, verifier };
