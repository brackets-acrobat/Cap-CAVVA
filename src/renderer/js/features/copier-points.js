/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// copier-points.js — points tournants → presse-papier.
//
// Repris de NavXpressVFR (nav-log.js). Copie les noms des points tournants en
// majuscules, séparés par un espace — départ et arrivée exclus, puisqu'ils sont
// déjà saisis en ICAO ailleurs.
//
// Les accents sont retirés (décomposition NFD puis suppression des marques
// diacritiques) : la destination de ce texte est une case de saisie de plan de
// vol ou un salon Discord, et tout le monde n'y digère pas les accents.
// ============================================================

const COPIE_RETOUR_MS = 1200;   // durée de la coche de confirmation

function sansAccents(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Noms des points tournants, prêts à coller. Chaîne vide s'il n'y en a aucun.
function pointsTournantsPourPressePapier() {
  return nomsPointsTournants(routeWaypoints)
    .map((n) => sansAccents(String(n || '').trim()).toUpperCase())
    .filter(Boolean)
    .join(' ');
}

const copieBtn = $('btn-copy-waypoints');

copieBtn.addEventListener('click', async () => {
  const texte = pointsTournantsPourPressePapier();
  if (!texte) return;

  try {
    await navigator.clipboard.writeText(texte);
  } catch (_) {
    return;   // presse-papier refusé : pas de retour visuel mensonger
  }

  // Retour visuel : coche pendant ~1,2 s, puis retour à l'icône.
  if (copieBtn._timer) clearTimeout(copieBtn._timer);
  copieBtn.innerHTML = '<i class="ph-light ph-check" aria-hidden="true"></i>';
  copieBtn.classList.add('is-active');
  copieBtn._timer = setTimeout(() => {
    copieBtn.innerHTML = '<i class="ph-light ph-clipboard" aria-hidden="true"></i>';
    copieBtn.classList.remove('is-active');
    copieBtn._timer = null;
  }, COPIE_RETOUR_MS);
});
