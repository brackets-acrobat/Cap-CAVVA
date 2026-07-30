/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// cle-api.js — saisie de la clé CAVVA.
// ============================================================

// ============================================================
// Clé API — saisie dynamique (bouton + modale).
// ============================================================
$('btn-api-key').addEventListener('click', () => {
  const st = $('apikey-status');
  st.hidden = true; st.className = 'modal-status';
  $('apikey-input').value = '';   // on ne ré-affiche jamais le secret stocké
  $('apiurl-input').value = (lastConfig && lastConfig.apiBaseUrl) || '';
  $('btn-apikey-save').disabled = false;
  $('apikey-overlay').hidden = false;
  $('apikey-input').focus();
});

$('btn-apikey-cancel').addEventListener('click', () => { $('apikey-overlay').hidden = true; });

$('btn-apikey-save').addEventListener('click', async () => {
  const key = $('apikey-input').value.trim();
  const url = $('apiurl-input').value.trim();
  const st = $('apikey-status');
  $('btn-apikey-save').disabled = true;
  const res = await window.cap.setApiKey(key, url);
  if (res.ok) {
    lastConfig = { apiBaseUrl: res.apiBaseUrl, cleConfiguree: res.cleConfiguree, source: res.source };
    renderApiHint();
    st.className = 'modal-status is-ok';
    st.textContent = res.cleConfiguree ? t('apiKeySaved') : t('apiKeyCleared');
    st.hidden = false;

    // Enregistrée ne veut pas dire acceptée. Le serveur a le dernier mot, et le
    // savoir maintenant vaut mieux que le découvrir mercredi soir : on interroge
    // la seule signature du brief (64 octets), pas le brief entier.
    if (res.cleConfiguree) {
      const verdict = await window.cap.briefVerifierCle();
      if (verdict.ok) {
        st.textContent = t(verdict.code === 'absent' ? 'apiKeyOkNoBrief' : 'apiKeyOk');
      } else {
        st.className = 'modal-status is-warn';
        st.textContent = t(verdict.code === 'unauthorized' ? 'apiKeyRefused' : 'apiKeyUnreachable');
      }
    }
    setTimeout(() => { $('apikey-overlay').hidden = true; }, 2200);
  } else {
    st.className = 'modal-status is-error';
    st.textContent = t('apiKeyErr').replace('{err}', res.error || '?');
    st.hidden = false;
    $('btn-apikey-save').disabled = false;
  }
});
