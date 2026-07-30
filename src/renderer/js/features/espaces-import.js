/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// espaces-import.js — import et mise à jour de l'export du SIA.
//
// Trois chemins vers la même conversion :
//   • le fichier déposé dans Documents/Cap CAVVA/sia/ (le cas courant) ;
//   • un fichier choisi à la main (dialogue natif) ;
//   • rien du tout, et alors la modale explique où le prendre.
//
// Au premier lancement la carte est vide d'espaces : c'est normal et c'est dit.
// Rien n'est livré avec l'application — l'export est gratuit mais demande un
// compte, et le redistribuer engagerait sur sa fraîcheur.
// ============================================================

let _espImportEnCours = false;
let _espDesabonner = null;
let _espCheminChoisi = null;   // fichier désigné à la main, sinon le dépôt

function ouvrirEspacesModale() {
  _espCheminChoisi = null;
  $('esp-import-status').hidden = true;
  $('btn-esp-import-ok').disabled = false;
  $('esp-import-overlay').hidden = false;
  majEspacesModale();
}

function fermerEspacesModale() { $('esp-import-overlay').hidden = true; }

// Décrit l'état courant : cycle converti, fichier déposé, péremption.
async function majEspacesModale() {
  const etat = await window.cap.siaEtat();
  const info = $('esp-import-etat');
  const lignes = [];

  if (etat.present && etat.meta) {
    lignes.push(t('espStateLoaded')
      .replace('{date}', etat.meta.effDate || '?')
      .replace('{n}', etat.meta.zones));
    if (etat.perime) lignes.push(t('espStateStale').replace('{j}', etat.joursDepuisEffet));
  } else {
    lignes.push(t('espStateEmpty'));
  }

  if (_espCheminChoisi) lignes.push(t('espStatePicked').replace('{f}', _espCheminChoisi));
  else if (etat.depose) {
    lignes.push(t('espStateDropped').replace('{f}', etat.depose.nom));
    if (!etat.depotPlusRecent && etat.present) lignes.push(t('espStateSameCycle'));
  } else {
    lignes.push(t('espStateNoFile').replace('{d}', etat.dossier));
  }

  info.innerHTML = lignes.map((l) => `<span>${escapeHtml(l)}</span>`).join('');
  $('btn-esp-import-ok').disabled = !(_espCheminChoisi || etat.depose);
}

// --- Progression -------------------------------------------------------------

function ouvrirEspProgress() {
  $('esp-progress-phase').textContent = t('espPhaseReading');
  $('esp-progress-bar-fill').style.width = '0%';
  $('esp-progress-summary').hidden = true;
  $('btn-esp-progress-close').disabled = true;
  $('esp-progress-overlay').hidden = false;
}

function fermerEspProgress() {
  $('esp-progress-overlay').hidden = true;
  if (_espDesabonner) { _espDesabonner(); _espDesabonner = null; }
}

function surEspProgress(p) {
  if (p.type === 'lecture') {
    $('esp-progress-phase').textContent = t('espPhaseReading');
    $('esp-progress-bar-fill').style.width = p.percent + '%';
  } else if (p.type === 'construction') {
    $('esp-progress-phase').textContent = t('espPhaseBuilding');
    $('esp-progress-bar-fill').style.width = '100%';
  }
}

// Compte-rendu final : ce qui a été retenu, et ce qui a été écarté. Les zones
// ponctuelles écartées sont dites explicitement — les taire donnerait à croire
// que la carte est complète alors qu'elle ne peut pas l'être.
function resumeEspaces(meta) {
  const el = $('esp-progress-summary');
  el.className = 'modal-status is-ok';
  el.hidden = false;
  const types = ['R', 'P', 'D', 'CTR', 'TMA', 'SIV']
    .map((k) => `${k} ${meta.parType[k] || 0}`).join(' · ');
  el.innerHTML = escapeHtml(t('espImportDone')
      .replace('{n}', meta.zones)
      .replace('{date}', meta.effDate || '?'))
    + `<br><small>${escapeHtml(types)}</small>`
    + `<br><small>${escapeHtml(t('espImportSkipped').replace('{n}', meta.ecartees.ponctuelles))}</small>`;
}

async function lancerEspacesImport() {
  if (_espImportEnCours) return;
  _espImportEnCours = true;
  fermerEspacesModale();
  ouvrirEspProgress();
  _espDesabonner = window.cap.onSiaProgress(surEspProgress);

  try {
    const res = await window.cap.siaImporter(_espCheminChoisi || undefined);
    if (res && res.ok) {
      resumeEspaces(res.meta);
      await chargerEspaces();   // recharge la couche avec le cycle fraîchement converti
    } else {
      const el = $('esp-progress-summary');
      el.className = 'modal-status is-error';
      el.hidden = false;
      el.textContent = t('espImportError').replace('{err}', (res && res.error) || '?');
    }
  } finally {
    _espImportEnCours = false;
    $('btn-esp-progress-close').disabled = false;
  }
}

// --- Câblage -----------------------------------------------------------------

$('menu-import-espaces').addEventListener('click', () => { fermerImportMenu(); ouvrirEspacesModale(); });
$('btn-esp-import-cancel').addEventListener('click', fermerEspacesModale);
$('btn-esp-import-ok').addEventListener('click', lancerEspacesImport);
$('btn-esp-progress-close').addEventListener('click', fermerEspProgress);

$('btn-esp-dossier').addEventListener('click', async () => {
  await window.cap.siaOuvrirDossier();
});

$('btn-esp-fichier').addEventListener('click', async () => {
  const res = await window.cap.siaChoisirFichier();
  if (res && res.ok) { _espCheminChoisi = res.chemin; majEspacesModale(); }
});
