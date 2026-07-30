/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// vent.js — indicateur de vent.
// ============================================================

// Indicateur de vent. Le TEXTE donne la direction d'où vient le vent, en
// MAGNÉTIQUE : la variation locale est dérivée des deux caps avion
// (mag = vrai + magvar, donc magvar = headingMag − headingTrue). La FLÈCHE,
// elle, reste orientée en VRAI (la carte est nord-vrai) et pointe vers où VA
// le vent (= direction d'où il vient + 180°).
// Rafraîchi au plus toutes les 5 s (le flux scan arrive ~2×/s).
let _ventLastUpdate = 0;
const VENT_THROTTLE_MS = 5000;
function majVent(f) {
  const ind = $('wind-indicator');
  if (!Number.isFinite(f.windDir) || !Number.isFinite(f.windKt)) { ind.hidden = true; _ventLastUpdate = 0; return; }
  const now = Date.now();
  if (_ventLastUpdate && now - _ventLastUpdate < VENT_THROTTLE_MS) return;
  _ventLastUpdate = now;
  const norm360 = (x) => ((Math.round(x) % 360) + 360) % 360;
  const norm180 = (x) => { const v = ((x % 360) + 360) % 360; return v > 180 ? v - 360 : v; };
  const magvar = (Number.isFinite(f.headingTrue) && Number.isFinite(f.headingMag))
    ? norm180(f.headingMag - f.headingTrue) : 0;
  const dirTrue = norm360(f.windDir);
  const dirMag = norm360(f.windDir + magvar);
  $('wind-text').textContent = `${String(dirMag).padStart(3, '0')}° ${Math.round(f.windKt)} kt`;
  $('wind-arrow').style.transform = `rotate(${dirTrue + 180}deg)`;
  ind.hidden = false;
}
