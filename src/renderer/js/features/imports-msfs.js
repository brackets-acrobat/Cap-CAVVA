/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// imports-msfs.js — import des aéroports, navaids et relief.
// Trois imports, trois modales de progression, un seul menu déroulant. Les
// extractions parlent à MSFS 2024 ; le relief se télécharge chez la NOAA.
// ============================================================

// ============================================================
// Import des aéroports MSFS 2024 (même processus que NavXpressVFR).
// ============================================================
let _msfsChecking = false;
let _msfsExtracting = false;
let _msfsUnsubProgress = null;

function fmtMsDuration(ms) {
  const s = Math.max(0, Math.round((ms || 0) / 1000));
  const m = Math.floor(s / 60);
  return `${m}m${String(s % 60).padStart(2, '0')}s`;
}

function openMsfsConfirm() {
  const st = $('msfs-check-status');
  st.hidden = true; st.className = 'modal-status';
  $('btn-msfs-confirm-ok').disabled = false;
  $('btn-msfs-confirm-cancel').disabled = false;
  $('msfs-confirm-overlay').hidden = false;
}
function closeMsfsConfirm() {
  if (_msfsChecking) return;   // pas de fermeture pendant la vérification
  $('msfs-confirm-overlay').hidden = true;
}

function openMsfsProgress() {
  $('msfs-progress-bar-fill').style.width = '0%';
  $('msfs-progress-count').textContent = '0 / 0';
  $('msfs-progress-stats').textContent = '';
  const sum = $('msfs-progress-summary');
  sum.hidden = true; sum.className = 'modal-status';
  $('msfs-progress-phase').textContent = t('msfsPhaseConnecting');
  $('btn-msfs-progress-close').disabled = true;
  $('msfs-progress-overlay').hidden = false;
}
function closeMsfsProgress() {
  if (_msfsExtracting) return;   // pas de fermeture pendant l'extraction
  $('msfs-progress-overlay').hidden = true;
}

function setMsfsBar(pct) {
  $('msfs-progress-bar-fill').style.width = Math.max(0, Math.min(100, pct)) + '%';
}

function handleMsfsProgress(p) {
  if (!p) return;
  if (p.phase === 'connect' || p.phase === 'connected') {
    $('msfs-progress-phase').textContent = t('msfsPhaseConnecting');
  } else if (p.phase === 'enumerate') {
    $('msfs-progress-phase').textContent = t('msfsPhaseEnumerate').replace('{n}', p.enumerated);
    if (p.totalPackets) setMsfsBar(Math.round((p.packet / p.totalPackets) * 100));
    $('msfs-progress-count').textContent = String(p.enumerated);
  } else if (p.phase === 'detail') {
    $('msfs-progress-phase').textContent = p.retry ? t('msfsPhaseRetry') : t('msfsPhaseDetail');
    if (p.target > 0) setMsfsBar(Math.round((p.treated / p.target) * 100));
    $('msfs-progress-count').textContent = `${p.treated} / ${p.target}`;
    $('msfs-progress-stats').textContent = t('msfsProgressStats')
      .replace('{rate}', Math.round(p.ratePerSec || 0))
      .replace('{eta}', fmtMsDuration(p.etaMs))
      .replace('{ok}', p.ok)
      .replace('{failed}', p.failed);
  } else if (p.phase === 'done') {
    setMsfsBar(100);
    $('msfs-progress-count').textContent = `${p.written} / ${p.enumerated}`;
  }
}

async function startMsfsExtraction() {
  if (_msfsExtracting) return;
  _msfsChecking = false;
  $('msfs-confirm-overlay').hidden = true;
  openMsfsProgress();

  _msfsExtracting = true;
  if (_msfsUnsubProgress) { try { _msfsUnsubProgress(); } catch (_) {} _msfsUnsubProgress = null; }
  _msfsUnsubProgress = window.cap.onMsfsExtractProgress(handleMsfsProgress);

  let result;
  try {
    result = await window.cap.msfsExtraireAeroports({ limit: 0 });
  } catch (err) {
    result = { ok: false, error: (err && err.message) || String(err) };
  }

  _msfsExtracting = false;
  if (_msfsUnsubProgress) { try { _msfsUnsubProgress(); } catch (_) {} _msfsUnsubProgress = null; }
  $('btn-msfs-progress-close').disabled = false;

  const sum = $('msfs-progress-summary');
  sum.hidden = false;
  if (result && result.ok && result.summary && result.summary.file) {
    sum.className = 'modal-status is-ok';
    sum.textContent = t('msfsExtractDone').replace('{n}', result.summary.written);
  } else if (result && result.ok && result.summary) {
    sum.className = 'modal-status is-warn';
    sum.textContent = t('msfsExtractEmpty');
  } else {
    sum.className = 'modal-status is-error';
    sum.textContent = t('msfsExtractError').replace('{msg}', (result && result.error) || '?');
  }
}

$('btn-msfs-confirm-cancel').addEventListener('click', closeMsfsConfirm);
$('btn-msfs-progress-close').addEventListener('click', closeMsfsProgress);
$('btn-msfs-confirm-ok').addEventListener('click', async () => {
  if (_msfsChecking) return;
  _msfsChecking = true;
  $('btn-msfs-confirm-ok').disabled = true;
  $('btn-msfs-confirm-cancel').disabled = true;
  const st = $('msfs-check-status');
  st.hidden = false; st.className = 'modal-status'; st.textContent = t('msfsCheckChecking');

  let res = { running: false };
  try { res = await window.cap.msfsVerifierLancement(); }
  catch (err) { res = { running: false, error: (err && err.message) || String(err) }; }

  _msfsChecking = false;
  $('btn-msfs-confirm-ok').disabled = false;
  $('btn-msfs-confirm-cancel').disabled = false;

  if (res && res.running) {
    st.className = 'modal-status is-ok';
    st.textContent = t('msfsCheckRunning').replace('{app}', res.app || 'MSFS');
    startMsfsExtraction();   // MSFS détecté → on enchaîne
  } else {
    st.className = 'modal-status is-error';
    st.textContent = t('msfsCheckNotRunning');
  }
});

// ============================================================
// Import des navaids MSFS 2024 (même processus que NavXpressVFR).
// Réutilise la vérification de lancement MSFS et la phase « connexion ».
// ============================================================
let _navaidsChecking = false;
let _navaidsExtracting = false;
let _navaidsUnsubProgress = null;

function openNavaidsConfirm() {
  const st = $('navaids-check-status');
  st.hidden = true; st.className = 'modal-status';
  $('btn-navaids-confirm-ok').disabled = false;
  $('btn-navaids-confirm-cancel').disabled = false;
  $('navaids-confirm-overlay').hidden = false;
}
function closeNavaidsConfirm() {
  if (_navaidsChecking) return;
  $('navaids-confirm-overlay').hidden = true;
}

function openNavaidsProgress() {
  $('navaids-progress-bar-fill').style.width = '0%';
  $('navaids-progress-count').textContent = '0 / 0';
  $('navaids-progress-stats').textContent = '';
  const sum = $('navaids-progress-summary');
  sum.hidden = true; sum.className = 'modal-status';
  $('navaids-progress-phase').textContent = t('msfsPhaseConnecting');
  $('btn-navaids-progress-close').disabled = true;
  $('navaids-progress-overlay').hidden = false;
}
function closeNavaidsProgress() {
  if (_navaidsExtracting) return;
  $('navaids-progress-overlay').hidden = true;
}

function setNavaidsBar(pct) {
  $('navaids-progress-bar-fill').style.width = Math.max(0, Math.min(100, pct)) + '%';
}

function handleNavaidsProgress(p) {
  if (!p) return;
  if (p.phase === 'connect' || p.phase === 'connected') {
    $('navaids-progress-phase').textContent = t('msfsPhaseConnecting');
  } else if (p.phase === 'enumerate') {
    $('navaids-progress-phase').textContent = t('navaidsPhaseEnumerate').replace('{n}', p.enumerated);
    if (p.total) setNavaidsBar(Math.round((p.packet / p.total) * 100));
    $('navaids-progress-count').textContent = String(p.enumerated);
  } else if (['seed', 'bfs', 'vor', 'ndb', 'disco'].includes(p.phase)) {
    const label = { seed: 'navaidsPhaseSeed', bfs: 'navaidsPhaseBfs', vor: 'navaidsPhaseVor', ndb: 'navaidsPhaseNdb', disco: 'navaidsPhaseDisco' }[p.phase];
    $('navaids-progress-phase').textContent = t(label);
    if (p.target > 0) setNavaidsBar(Math.round((p.treated / p.target) * 100));
    $('navaids-progress-count').textContent = `${p.treated} / ${p.target}`;
    $('navaids-progress-stats').textContent = t('navaidsProgressStats')
      .replace('{nav}', p.navaids || 0)
      .replace('{wpt}', p.seeds || 0);
  } else if (p.phase === 'done') {
    setNavaidsBar(100);
  }
}

async function startNavaidsExtraction() {
  if (_navaidsExtracting) return;
  _navaidsChecking = false;
  $('navaids-confirm-overlay').hidden = true;
  openNavaidsProgress();

  _navaidsExtracting = true;
  if (_navaidsUnsubProgress) { try { _navaidsUnsubProgress(); } catch (_) {} _navaidsUnsubProgress = null; }
  _navaidsUnsubProgress = window.cap.onMsfsNavaidsProgress(handleNavaidsProgress);

  let result;
  try {
    result = await window.cap.msfsExtraireNavaids();
  } catch (err) {
    result = { ok: false, error: (err && err.message) || String(err) };
  }

  _navaidsExtracting = false;
  if (_navaidsUnsubProgress) { try { _navaidsUnsubProgress(); } catch (_) {} _navaidsUnsubProgress = null; }
  $('btn-navaids-progress-close').disabled = false;

  const sum = $('navaids-progress-summary');
  sum.hidden = false;
  if (result && result.ok && result.summary && result.summary.file) {
    sum.className = 'modal-status is-ok';
    sum.textContent = t('navaidsExtractDone').replace('{n}', result.summary.navaids);
  } else if (result && result.ok && result.summary) {
    sum.className = 'modal-status is-warn';
    sum.textContent = t('navaidsExtractEmpty');
  } else {
    sum.className = 'modal-status is-error';
    sum.textContent = t('navaidsExtractError').replace('{msg}', (result && result.error) || '?');
  }
}

$('btn-navaids-confirm-cancel').addEventListener('click', closeNavaidsConfirm);
$('btn-navaids-progress-close').addEventListener('click', closeNavaidsProgress);
$('btn-navaids-confirm-ok').addEventListener('click', async () => {
  if (_navaidsChecking) return;
  _navaidsChecking = true;
  $('btn-navaids-confirm-ok').disabled = true;
  $('btn-navaids-confirm-cancel').disabled = true;
  const st = $('navaids-check-status');
  st.hidden = false; st.className = 'modal-status'; st.textContent = t('msfsCheckChecking');

  let res = { running: false };
  try { res = await window.cap.msfsVerifierLancement(); }
  catch (err) { res = { running: false, error: (err && err.message) || String(err) }; }

  _navaidsChecking = false;
  $('btn-navaids-confirm-ok').disabled = false;
  $('btn-navaids-confirm-cancel').disabled = false;

  if (res && res.running) {
    st.className = 'modal-status is-ok';
    st.textContent = t('msfsCheckRunning').replace('{app}', res.app || 'MSFS');
    startNavaidsExtraction();
  } else {
    st.className = 'modal-status is-error';
    st.textContent = t('msfsCheckNotRunning');
  }
});

// ============================================================

// --- Bouton-icône d'import + menu déroulant (aéroports / navaids) ---
const importBtn = $('btn-import');
const importDropdown = $('import-dropdown');
function fermerImportMenu() {
  importDropdown.hidden = true;
  importBtn.setAttribute('aria-expanded', 'false');
}
importBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  const ouvrir = importDropdown.hidden;
  importDropdown.hidden = !ouvrir;
  importBtn.setAttribute('aria-expanded', String(ouvrir));
});
importDropdown.addEventListener('click', (e) => e.stopPropagation());   // clic dans le menu ne le ferme pas
document.addEventListener('click', () => { if (!importDropdown.hidden) fermerImportMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fermerImportMenu(); });
$('menu-import-airports').addEventListener('click', () => { fermerImportMenu(); openMsfsConfirm(); });
$('menu-import-navaids').addEventListener('click', () => { fermerImportMenu(); openNavaidsConfirm(); });
$('menu-import-elevation').addEventListener('click', () => { fermerImportMenu(); onElevImportClick(); });

// ============================================================
// Import des données d'élévation (GLOBE all10g.zip) — repris de NavXpressVFR.
// Téléchargement direct (pas de SimConnect) : clic → confirmation si déjà
// présent, sinon import ; modale de progression (download / extract / flatten).
// ============================================================
let _elevImporting = false;
let _elevUnsubProgress = null;

function fmtMo(bytes) { return (bytes / (1024 * 1024)).toFixed(1) + ' Mo'; }

function openElevProgress() {
  $('elev-progress-bar-fill').style.width = '0%';
  $('elev-progress-size').textContent = '—';
  const sum = $('elev-progress-summary');
  sum.hidden = true; sum.className = 'modal-status'; sum.textContent = '';
  $('elev-progress-phase').textContent = t('elevPhaseStarting');
  $('btn-elev-progress-close').disabled = true;
  $('elev-progress-overlay').hidden = false;
}
function closeElevProgress() {
  if (_elevImporting) return;   // pas de fermeture pendant l'import
  $('elev-progress-overlay').hidden = true;
}

function handleElevProgress(p) {
  if (!p) return;
  const fill = $('elev-progress-bar-fill');
  const size = $('elev-progress-size');
  if (p.type === 'start') {
    $('elev-progress-phase').textContent = t('elevPhaseStarting');
    fill.style.width = '0%';
  } else if (p.type === 'download') {
    $('elev-progress-phase').textContent = t('elevPhaseDownloading');
    if (p.total) {
      const pct = Math.round((p.received / p.total) * 100);
      fill.style.width = pct + '%';
      size.textContent = `${fmtMo(p.received)} / ${fmtMo(p.total)} (${pct} %)`;
    } else {
      fill.style.width = '100%';
      size.textContent = fmtMo(p.received);
    }
  } else if (p.type === 'extract') {
    $('elev-progress-phase').textContent = t('elevPhaseExtracting');
    fill.style.width = '100%';
    size.textContent = '';
  } else if (p.type === 'flatten') {
    $('elev-progress-phase').textContent = t('elevPhaseFlattening');
    fill.style.width = '100%';
  } else if (p.type === 'done') {
    $('elev-progress-phase').textContent = '';
    fill.style.width = '100%';
    const sum = $('elev-progress-summary');
    sum.hidden = false;
    sum.className = 'modal-status ' + (p.ok ? 'is-ok' : 'is-warn');
    sum.textContent = t('elevProgressDone') + ' ' + t('elevProgressDoneDir').replace('{dir}', p.dir || '');
    $('btn-elev-progress-close').disabled = false;
  } else if (p.type === 'error') {
    $('elev-progress-phase').textContent = '';
    const sum = $('elev-progress-summary');
    sum.hidden = false;
    sum.className = 'modal-status is-error';
    sum.textContent = t('elevProgressError') + ' — ' + (p.error || '');
    $('btn-elev-progress-close').disabled = false;
  }
}

async function startElevImport() {
  if (_elevImporting) return;
  _elevImporting = true;
  openElevProgress();
  if (_elevUnsubProgress) { try { _elevUnsubProgress(); } catch (_) {} _elevUnsubProgress = null; }
  _elevUnsubProgress = window.cap.onElevationProgress(handleElevProgress);
  let res;
  try { res = await window.cap.importerElevation(); }
  catch (err) { res = { ok: false, error: (err && err.message) || String(err) }; }
  _elevImporting = false;
  if (_elevUnsubProgress) { try { _elevUnsubProgress(); } catch (_) {} _elevUnsubProgress = null; }
  $('btn-elev-progress-close').disabled = false;
  // Filet de sécurité si aucun event 'done'/'error' n'a été reçu.
  const sum = $('elev-progress-summary');
  if (sum.hidden && res && !res.ok) {
    sum.hidden = false; sum.className = 'modal-status is-error';
    sum.textContent = t('elevProgressError') + ' — ' + (res.error || '');
  }
}

async function onElevImportClick() {
  let existe = false;
  try { existe = await window.cap.elevationExiste(); } catch (_) {}
  if (existe) $('elev-confirm-overlay').hidden = false;   // déjà présent → confirmer le ré-import
  else startElevImport();
}

$('btn-elev-confirm-cancel').addEventListener('click', () => { $('elev-confirm-overlay').hidden = true; });
$('btn-elev-confirm-ok').addEventListener('click', () => { $('elev-confirm-overlay').hidden = true; startElevImport(); });
$('btn-elev-progress-close').addEventListener('click', closeElevProgress);
