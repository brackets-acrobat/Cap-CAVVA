/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// etat.js — état partagé et bandeau de connexion.
// Chargé en PREMIER : les autres fichiers s'appuient sur $, sur la config et
// sur l'état de connexion. Tous les scripts partagent la portée globale (pas de
// modules ES) — c'est la convention de NavXpressVFR, conservée telle quelle.
// ============================================================

const $ = (id) => document.getElementById(id);

let connecte = false;
let lastStatusState = 'disconnected';   // dernier état connu (pour re-rendu à la bascule de langue)
let lastStatusDetail = '';
let lastConfig = null;                   // dernière config API (pour re-rendu de l'indice)

// (Re)dessine le bouton de connexion : sa COULEUR porte l'état (rouge/orange/
// vert), son libellé et son infobulle de détail sont dans la langue courante.
function renderStatus() {
  const btn = $('btn-connect');
  btn.classList.remove('btn-state-off', 'btn-state-wait', 'btn-state-on');
  const detail = lastStatusDetail ? ` · ${lastStatusDetail}` : '';

  if (lastStatusState === 'connected') {
    btn.classList.add('btn-state-on');
    btn.innerHTML = '<i class="ph-light ph-plugs-connected"></i> ' + t('btnDisconnect');
    btn.title = t('statusConnected') + detail;
    connecte = true;
  } else if (lastStatusState === 'connecting') {
    btn.classList.add('btn-state-wait');
    btn.innerHTML = '<i class="ph-light ph-plugs"></i> ' + t('statusConnecting');
    btn.title = t('statusConnecting');
  } else {
    btn.classList.add('btn-state-off');
    btn.innerHTML = '<i class="ph-light ph-plugs"></i> ' + t('btnConnect');
    btn.title = t('statusDisconnected') + detail;
    connecte = false;
    viderScan();
  }
}

function setStatus(state, detail) {
  lastStatusState = state;
  lastStatusDetail = detail || '';
  renderStatus();
}

// (Re)dessine l'indice de configuration API dans la langue courante.
function renderApiHint() {
  if (!lastConfig) return;
  const key = lastConfig.cleConfiguree ? 'apiConfigured' : 'apiMissing';
  // `accesHorsLigne` (acces.js) : l'application s'est ouverte sur la foi d'une
  // validation antérieure, sans avoir pu joindre CAVVA. Ça se dit — sinon le
  // pilote croit sa clé vérifiée alors qu'elle ne l'a pas été aujourd'hui.
  const suffixe = (typeof accesHorsLigne !== 'undefined' && accesHorsLigne)
    ? ' · ' + t('accesOfflineHint') : '';
  $('api-hint').textContent = t(key).replace('{url}', lastConfig.apiBaseUrl) + suffixe;
}

function fmt(n, dec = 0) {
  return (typeof n === 'number' && isFinite(n)) ? n.toFixed(dec) : '—';
}
