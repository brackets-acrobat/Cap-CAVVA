/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// vac.js — ouverture de la carte VAC (SIA) d'un aérodrome.
// ============================================================
//
// Entrée « Carte VAC » du menu contextuel d'un aéroport. Le PDF s'ouvre dans le
// navigateur par défaut ; tout le travail (cycle AIRAC, vérification que la
// carte existe) est fait côté processus principal — voir src/main/vac-sia.js.
//
// L'entrée n'apparaît que sur un code OACI métropolitain régulier, pour ne pas
// la proposer sur les ~1300 pistes ULM et terrains privés de la base MSFS, qui
// ne sont pas publiés au SIA. Le test est le même que côté principal ; il est
// répété ici parce que le menu se construit sans attendre le réseau.
// ============================================================

// Doit rester identique à estEligible() de src/main/vac-sia.js.
function vacEligible(code) {
  return /^LF[A-Z]{2}$/.test(String(code == null ? '' : code).trim().toUpperCase());
}

let _vacToast = null;
let _vacToastTimer = null;

// Message bref au-dessus de la carte. persistant=true tant qu'on attend le SIA.
function messageVac(texte, persistant) {
  if (_vacToastTimer) { clearTimeout(_vacToastTimer); _vacToastTimer = null; }
  if (!_vacToast) {
    _vacToast = document.createElement('div');
    _vacToast.className = 'vac-toast';
    document.body.appendChild(_vacToast);
  }
  _vacToast.textContent = texte;
  if (!persistant) _vacToastTimer = setTimeout(fermerMessageVac, 5000);
}

function fermerMessageVac() {
  if (_vacToastTimer) { clearTimeout(_vacToastTimer); _vacToastTimer = null; }
  if (_vacToast) { _vacToast.remove(); _vacToast = null; }
}

// Vérifie puis ouvre la carte VAC. Le SIA est interrogé à chaque fois : c'est le
// seul moyen de distinguer « cet aérodrome n'a pas de VAC » (LFPI, LFPV…) de
// « le serveur ne répond pas », et de ne jamais ouvrir un lien mort.
async function ouvrirCarteVac(code) {
  messageVac(t('vacRecherche').replace('{code}', code), true);
  let res;
  try {
    res = await window.cap.ouvrirVac(code);
  } catch (_) {
    res = { ok: false, raison: 'reseau' };
  }
  if (res && res.ok) { fermerMessageVac(); return; }
  const raison = (res && res.raison) || 'reseau';
  const cle = raison === 'absente' ? 'vacAbsente'
            : raison === 'non-eligible' ? 'vacNonEligible'
            : 'vacReseau';
  messageVac(t(cle).replace('{code}', code), false);
}
