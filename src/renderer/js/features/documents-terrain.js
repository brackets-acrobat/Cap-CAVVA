/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// documents-terrain.js — documents publiés d'un terrain, au menu contextuel.
// ============================================================
//
//   • « Carte VAC (SIA) »        → aérodromes de France métropolitaine.
//   • « Fiche terrain (FFPLUM) » → terrains ULM de la base BASULM.
//
// Les deux ouvrent un PDF dans le navigateur par défaut ; tout le travail est
// fait côté processus principal (src/main/vac-sia.js et src/main/fiche-ulm.js).
//
// Les deux entrées se décident SANS RÉSEAU, parce que le menu doit s'afficher
// immédiatement — mais pas de la même façon, et c'est voulu :
//   • la VAC se décide sur la forme du code (LF + deux lettres) ;
//   • la fiche ULM se décide sur les coordonnées, le processus principal ayant
//     déjà rapproché chaque aéroport de la base BASULM (champ ficheUlm). Les
//     codes ULM de MSFS sont trop souvent faux pour qu'on s'y fie.
// ============================================================

// Doit rester identique à estEligible() de src/main/vac-sia.js.
function vacEligible(code) {
  return /^LF[A-Z]{2}$/.test(String(code == null ? '' : code).trim().toUpperCase());
}

let _docToast = null;
let _docToastTimer = null;

// Message bref au-dessus de la carte. persistant=true tant qu'on attend.
function messageDoc(texte, persistant) {
  if (_docToastTimer) { clearTimeout(_docToastTimer); _docToastTimer = null; }
  if (!_docToast) {
    _docToast = document.createElement('div');
    _docToast.className = 'doc-toast';
    document.body.appendChild(_docToast);
  }
  _docToast.textContent = texte;
  if (!persistant) _docToastTimer = setTimeout(fermerMessageDoc, 5000);
}

function fermerMessageDoc() {
  if (_docToastTimer) { clearTimeout(_docToastTimer); _docToastTimer = null; }
  if (_docToast) { _docToast.remove(); _docToast = null; }
}

// Attend une promesse d'ouverture, en affichant l'attente puis l'échec s'il y a
// lieu. `cles` associe chaque raison d'échec à son message déjà traduit.
async function ouvrirDocument(promesse, attente, cles) {
  messageDoc(attente, true);
  let res;
  try {
    res = await promesse;
  } catch (_) {
    res = null;
  }
  if (res && res.ok) { fermerMessageDoc(); return res; }
  const raison = (res && res.raison) || 'reseau';
  messageDoc(cles[raison] || cles.reseau, false);
  return res;
}

// Carte VAC du SIA. Le PDF est vérifié avant ouverture : le SIA publie par
// cycle de 28 jours, et tous les codes réguliers n'ont pas de carte.
async function ouvrirCarteVac(code) {
  await ouvrirDocument(
    window.cap.ouvrirVac(code),
    t('vacRecherche').replace('{code}', code),
    {
      absente: t('vacAbsente').replace('{code}', code),
      'non-eligible': t('vacNonEligible').replace('{code}', code),
      reseau: t('vacReseau').replace('{code}', code),
    }
  );
}

// Fiche terrain BASULM. On envoie les COORDONNÉES, pas le code : c'est le
// rapprochement géographique qui identifie le terrain côté principal.
async function ouvrirFicheTerrain(airport) {
  const etiquette = airport.ficheUlm || (airport.code || airport.ident || '');
  const res = await ouvrirDocument(
    window.cap.ouvrirFicheUlm(airport.lat, airport.lon),
    t('ficheRecherche').replace('{code}', etiquette),
    {
      absente: t('ficheAbsente').replace('{code}', etiquette),
      'hors-base': t('ficheHorsBase'),
      reseau: t('ficheReseau').replace('{code}', etiquette),
    }
  );
  // La fiche ouverte peut porter un code différent de celui affiché par MSFS —
  // c'est le cas de 74 terrains. On le dit, sinon l'écart passerait pour une
  // erreur de l'application.
  if (res && res.ok && res.code && res.code !== String(airport.code || '').toUpperCase()) {
    messageDoc(t('ficheAutreCode').replace('{code}', res.code).replace('{nom}', res.nom || ''), false);
  }
}
