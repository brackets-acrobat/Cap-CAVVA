/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// controles-carte.js — menus déroulants « couches » et « fond de carte ».
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

    // Ouverture/fermeture des deux menus (un seul ouvert à la fois)
    const dropdowns = [...div.querySelectorAll('.map-dropdown')];
    dropdowns.forEach((dd) => {
      const btn = dd.querySelector('.map-dd-btn');
      const panel = dd.querySelector('.map-dd-panel');
      btn.addEventListener('click', () => {
        const open = panel.hidden;
        dropdowns.forEach((o) => { o.querySelector('.map-dd-panel').hidden = true; o.querySelector('.map-dd-btn').setAttribute('aria-expanded', 'false'); });
        panel.hidden = !open;
        btn.setAttribute('aria-expanded', String(open));
      });
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
