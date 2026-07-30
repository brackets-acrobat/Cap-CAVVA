/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// controles-carte.js — menus déroulants de la carte : couches MSFS, fond de
// carte, espaces aériens.
//
// Ils s'ouvrent au SURVOL et se replient quand la souris s'en éloigne : sur une
// carte, un menu qui demande un clic pour s'ouvrir et un autre pour se fermer
// coûte deux gestes là où le regard suffit.
// ============================================================

// Contrôles déroulants (haut-droite) : couches MSFS + fond de carte, côte à côte.
function ajouterControlesCarte() {
  const ctl = L.control({ position: 'topright' });
  ctl.onAdd = function () {
    const div = L.DomUtil.create('div', 'map-controls');
    div.innerHTML =
      // Widget 1 — couches (cases à cocher)
      `<div class="map-dropdown" id="ctl-couches">` +
        `<button class="map-dd-btn" type="button" data-i18n-title="layersTitle" title="${t('layersTitle')}" aria-haspopup="true" aria-expanded="false"><i class="ph-light ph-stack"></i></button>` +
        `<div class="map-dd-panel" hidden>` +
          `<label><input type="checkbox" data-layer="airports"> <span data-i18n="layerAirports">${t('layerAirports')}</span></label>` +
          `<label><input type="checkbox" data-layer="heliports"> <span data-i18n="layerHeliports">${t('layerHeliports')}</span></label>` +
          `<label><input type="checkbox" data-layer="seaplanes"> <span data-i18n="layerSeaplanes">${t('layerSeaplanes')}</span></label>` +
          `<label><input type="checkbox" data-layer="navaids"> <span data-i18n="layerNavaids">${t('layerNavaids')}</span></label>` +
        `</div>` +
      `</div>` +
      // Widget 2 — fond de carte (boutons radio)
      `<div class="map-dropdown" id="ctl-fond">` +
        `<button class="map-dd-btn" type="button" data-i18n-title="basemapTitle" title="${t('basemapTitle')}" aria-haspopup="true" aria-expanded="false"><i class="ph-light ph-map-trifold"></i></button>` +
        `<div class="map-dd-panel" hidden>` +
          `<label><input type="radio" name="basemap" data-base="opentopomap"> OpenTopoMap</label>` +
          `<label><input type="radio" name="basemap" data-base="openstreetmap"> OpenStreetMap</label>` +
          `<label><input type="radio" name="basemap" data-base="darkmatter"> Dark Matter</label>` +
          `<label><input type="radio" name="basemap" data-base="positron"> Positron</label>` +
        `</div>` +
      `</div>` +
      // Widget 3 — espaces aériens (familles + plancher maximal)
      `<div class="map-dropdown" id="ctl-espaces">` +
        `<button class="map-dd-btn" type="button" data-i18n-title="espTitle" title="${t('espTitle')}" aria-haspopup="true" aria-expanded="false"><i class="ph-light ph-polygon"></i></button>` +
        `<div class="map-dd-panel" hidden>` +
          ESPACE_FAMILLES.map((f) =>
            `<label><input type="checkbox" data-espace="${f.id}">` +
            `<span class="esp-pastille" style="background:${f.couleur}"></span>${f.nom}</label>`).join('') +
          `<hr class="map-dd-sep">` +
          `<label class="map-dd-champ"><span data-i18n="espFloorMax">${t('espFloorMax')}</span>` +
            `<input id="esp-plancher" type="number" min="0" step="500" value="${espaceFiltres.plancherMaxFt}"></label>` +
          `<label class="map-dd-champ"><span data-i18n="espTestAlt">${t('espTestAlt')}</span>` +
            `<input id="esp-alt" type="number" step="500" value="2000"></label>` +
          `<p class="map-dd-note" id="esp-cycle">—</p>` +
        `</div>` +
      `</div>`;
    L.DomEvent.disableClickPropagation(div);
    L.DomEvent.disableScrollPropagation(div);

    // ------------------------------------------------------------
    // Ouverture au SURVOL, repli quand on s'en éloigne. Un seul menu ouvert.
    //
    // Le repli est DIFFÉRÉ, et ce n'est pas du confort : le panneau est posé
    // 6 px sous son bouton (top: calc(100% + 6px)), et ces 6 px n'appartiennent
    // à aucun des deux. Sans délai, le simple fait de descendre vers le menu le
    // referait disparaître — et il ne se rouvrirait pas, puisqu'il n'y aurait
    // plus rien à survoler.
    //
    // Le survol ne suffit pas non plus tout seul : le panneau des espaces
    // contient deux champs de saisie. Si la souris s'écarte pendant qu'on tape
    // un plancher, le menu doit rester ouvert — d'où le contrôle sur l'élément
    // qui a le focus. C'est aussi ce qui rend les menus atteignables au clavier.
    // ------------------------------------------------------------
    const DELAI_REPLI_MS = 220;
    const dropdowns = [...div.querySelectorAll('.map-dropdown')];
    let replier = null;

    function basculer(dd, ouvert) {
      dd.querySelector('.map-dd-panel').hidden = !ouvert;
      dd.querySelector('.map-dd-btn').setAttribute('aria-expanded', String(ouvert));
    }

    function ouvrir(dd) {
      clearTimeout(replier);
      replier = null;
      dropdowns.forEach((o) => basculer(o, o === dd));
    }

    function programmerRepli() {
      clearTimeout(replier);
      replier = setTimeout(() => {
        dropdowns.forEach((o) => {
          if (!o.contains(document.activeElement)) basculer(o, false);
        });
      }, DELAI_REPLI_MS);
    }

    dropdowns.forEach((dd) => {
      dd.addEventListener('mouseenter', () => ouvrir(dd));
      dd.addEventListener('mouseleave', programmerRepli);
      // Clavier : tabuler jusqu'au bouton ouvre le menu, en sortir le referme.
      // Un clic passe par là aussi, puisqu'il donne le focus au bouton.
      dd.addEventListener('focusin', () => ouvrir(dd));
      dd.addEventListener('focusout', programmerRepli);
    });

    // Couches
    div.querySelectorAll('input[data-layer]').forEach((cb) => {
      cb.checked = !!layerState[cb.dataset.layer];
      cb.addEventListener('change', () => {
        layerState[cb.dataset.layer] = cb.checked;
        localStorage.setItem('cap-layer-' + cb.dataset.layer, cb.checked ? '1' : '0');
        rafraichirCouches();
      });
    });

    // Familles d'espaces aériens
    div.querySelectorAll('input[data-espace]').forEach((cb) => {
      cb.checked = !!espaceFiltres.familles[cb.dataset.espace];
      cb.addEventListener('change', () => {
        espaceFiltres.familles[cb.dataset.espace] = cb.checked;
        localStorage.setItem('cap-esp-fam-' + cb.dataset.espace, cb.checked ? '1' : '0');
        tracerEspaces();
      });
    });
    div.querySelector('#esp-plancher').addEventListener('change', (e) =>
      appliquerPlancherMax(parseInt(e.target.value, 10)));
    div.querySelector('#esp-alt').addEventListener('change', rafraichirSondeEspaces);

    // Fond de carte
    const fondActuel = localStorage.getItem('cap-basemap') || 'opentopomap';
    div.querySelectorAll('input[data-base]').forEach((rb) => {
      rb.checked = (rb.dataset.base === fondActuel);
      rb.addEventListener('change', () => { if (rb.checked) appliquerFond(rb.dataset.base); });
    });
    return div;
  };
  ctl.addTo(map);
}
