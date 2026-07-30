/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// apropos.js — modale « À propos ».
// ============================================================

// ============================================================
// Modale « À propos » (bouton « ? » du header). Liens externes ouverts
// dans le navigateur par défaut via setWindowOpenHandler (main.js).
// ============================================================
$('btn-about').addEventListener('click', () => {
  const v = lastConfig && lastConfig.version;
  $('about-version').textContent = v ? 'v' + v : '';
  $('about-overlay').hidden = false;
});
$('btn-about-close').addEventListener('click', () => { $('about-overlay').hidden = true; });
$('about-overlay').addEventListener('click', (e) => {
  if (e.target === $('about-overlay')) $('about-overlay').hidden = true;   // clic sur le fond
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !$('about-overlay').hidden) $('about-overlay').hidden = true;
});

// Toggle FR / EN : change la langue puis ré-applique les textes dynamiques
// (les libellés statiques sont gérés par applyTranslations() dans setLanguage).
$('btn-lang-toggle').addEventListener('click', () => {
  setLanguage(currentLang === 'fr' ? 'en' : 'fr');
  renderStatus();
  renderApiHint();
  renderUpdateBanner();
});
