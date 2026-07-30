/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// declinaison.js — déclinaison magnétique locale (modèle WMM).
//
// Le renderer demande la déclinaison au milieu de chaque branche pour convertir
// le cap vrai (calculé en grand cercle) en cap magnétique affiché sur
// l'étiquette. Une seule ligne de calcul, mais elle vit dans le process
// principal : le paquet `geomagnetism` n'est pas chargeable côté renderer sous
// contextIsolation.
//
// Convention : decl > 0 = déclinaison Est. cap magnétique = cap vrai − decl.
// ============================================================

const geomagnetism = require('geomagnetism');

function en(lat, lon) {
  try {
    const info = geomagnetism.model().point([lat, lon]);
    return { ok: true, decl: info.decl };
  } catch (_) {
    return { ok: false, decl: 0 };
  }
}

module.exports = { en };
