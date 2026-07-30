/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// espaces-aeriens.js — tracé vectoriel des espaces aériens français.
//
// Les zones viennent de l'export du SIA converti (sia-convert.js côté main) et
// sont chargées EN UNE FOIS : ~2 200 polygones, 3,5 Mo. Elles restent en
// mémoire ici, parce que la suite en dépend — savoir dans quelles zones se
// trouve un point demande d'interroger toute la géométrie, et le brief de la
// séance devra le faire à chaque image.
//
// Deux partis pris de tracé :
//
//  • Rendu CANVAS. En SVG, 2 200 polygones font ramer le déplacement de carte.
//
//  • interactive:false sur les polygones. Sans ça, le premier polygone touché
//    avale le clic et masque toutes les zones situées dessous — or c'est
//    justement la superposition qu'on veut lire. Le clic va donc à la carte, et
//    c'est nous qui cherchons les zones contenant le point.
// ============================================================

let espacesLayer = null;          // groupe Leaflet, créé par initMap()
let _espacesData = null;          // FeatureCollection, ou null si rien de converti
let _espacesRenderer = null;      // canvas dédié
let _sondeMarqueur = null;
let _sondeListe = [];
let _zoneSurlignee = null;        // feature mise en évidence depuis le panneau

// Filtres, persistés d'une session à l'autre.
const espaceFiltres = {
  familles: {},
  plancherMaxFt: parseInt(localStorage.getItem('cap-esp-plancher') || '5000', 10),
};
ESPACE_FAMILLES.forEach((f) => {
  const v = localStorage.getItem('cap-esp-fam-' + f.id);
  espaceFiltres.familles[f.id] = v === null ? f.on : v === '1';
});

// ------------------------------------------------------------
// Hachures
// ------------------------------------------------------------

// Les zones R et P sont hachurées, comme sur la carte OACI. Une CanvasPattern
// passée en fillColor : Leaflet la donne telle quelle à ctx.fillStyle, qui
// l'accepte. Si l'environnement s'y refuse, on retombe sur un aplat — mieux
// vaut une zone pleine qu'une zone invisible.
const _hachures = new Map();

function hachure(couleur) {
  if (_hachures.has(couleur)) return _hachures.get(couleur);
  let motif = null;
  try {
    const tuile = document.createElement('canvas');
    tuile.width = tuile.height = 8;
    const c = tuile.getContext('2d');
    c.strokeStyle = couleur;
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(-2, 10); c.lineTo(10, -2);   // diagonale, débordante pour se raccorder
    c.moveTo(-2, 18); c.lineTo(18, -2);
    c.stroke();
    motif = document.createElement('canvas').getContext('2d').createPattern(tuile, 'repeat');
  } catch (_) {
    motif = null;
  }
  _hachures.set(couleur, motif);
  return motif;
}

// ------------------------------------------------------------
// Chargement
// ------------------------------------------------------------

async function chargerEspaces() {
  try {
    _espacesData = await window.cap.siaEspaces();
  } catch (_) {
    _espacesData = null;
  }
  tracerEspaces();
  majBandeauEspaces();
  return _espacesData;
}

function espacesCharges() {
  return !!(_espacesData && Array.isArray(_espacesData.features) && _espacesData.features.length);
}

// ------------------------------------------------------------
// Filtrage et tracé
// ------------------------------------------------------------

function zoneAffichable(p) {
  const f = familleDeZone(p);
  if (!f || !espaceFiltres.familles[f.id]) return false;
  const max = espaceFiltres.plancherMaxFt;
  if (Number.isFinite(max) && plancherApproxFt(p) > max) return false;
  return true;
}

function styleZone(p, famille) {
  const forte = (p.type === 'R' || p.type === 'P');
  const motif = forte ? hachure(famille.couleur) : null;
  return {
    renderer: _espacesRenderer,
    interactive: false,
    color: famille.couleur,
    weight: forte ? 2 : 1.2,
    opacity: 0.9,
    fillColor: motif || famille.couleur,
    fillOpacity: motif ? 0.55 : (forte ? 0.16 : 0.07),
  };
}

function tracerEspaces() {
  if (!espacesLayer) return;
  espacesLayer.clearLayers();
  _zoneSurlignee = null;   // les couches viennent d'être détruites
  if (!espacesCharges()) { majBandeauEspaces(); return; }

  let n = 0;
  for (const feature of _espacesData.features) {
    feature.__couche = null;   // référence de la passe précédente, désormais morte
    const p = feature.properties;
    if (!zoneAffichable(p)) continue;
    const famille = familleDeZone(p);
    // La couche est mémorisée SUR la feature : c'est ce qui permet ensuite de
    // relier une ligne du panneau au polygone correspondant sur la carte.
    feature.__couche = L.geoJSON(feature, { style: styleZone(p, famille) }).addTo(espacesLayer);
    n += 1;
  }
  majBandeauEspaces(n);
  if (_sondeMarqueur) sonderEspaces(_sondeMarqueur.getLatLng());
  // Le profil vertical trace les mêmes zones : il suit les mêmes filtres.
  mettreAJourProfilVertical();
}

// ------------------------------------------------------------
// Surbrillance : relier une ligne du panneau à son polygone
// ------------------------------------------------------------

// Dix-huit zones peuvent se superposer au même endroit. Lire la liste ne dit pas
// LAQUELLE est laquelle sur la carte : cliquer une ligne met son polygone en
// évidence, et l'y laisse — un clignotement se manque quand on a les yeux sur le
// panneau. Recliquer la même ligne éteint.
const SURBRILLANCE = { color: '#ffffff', weight: 4, opacity: 1, fillOpacity: 0.4 };

function eteindreZone(feature) {
  if (!feature || !feature.__couche) return;
  const p = feature.properties;
  feature.__couche.setStyle(styleZone(p, familleDeZone(p)));
}

function surlignerZone(feature) {
  const meme = (_zoneSurlignee === feature);
  eteindreZone(_zoneSurlignee);
  _zoneSurlignee = null;

  if (!meme && feature && feature.__couche) {
    feature.__couche.setStyle(SURBRILLANCE);
    feature.__couche.bringToFront();   // sinon les zones plus basses la recouvrent
    _zoneSurlignee = feature;
  }
  marquerLigneActive();
  // Le profil vertical trace les mêmes zones : la sélection doit y désigner le
  // même volume. Le re-rendu part du cache, il ne recalcule aucune tranche.
  mettreAJourProfilVertical();
}

// Reflète la sélection sur la liste (la ligne active reprend le repère visuel).
function marquerLigneActive() {
  const corps = $('esp-sonde-corps');
  if (!corps) return;
  corps.querySelectorAll('.esp-zone').forEach((el) => {
    const f = _sondeListe[+el.dataset.i];
    el.classList.toggle('est-active', !!f && f === _zoneSurlignee);
  });
}

// ------------------------------------------------------------
// Sonde : quelles zones à cet endroit ?
// ------------------------------------------------------------

// Test d'appartenance à un anneau (lancer de rayon). pt = [lon, lat].
function pointDansAnneau(pt, anneau) {
  let dedans = false;
  for (let i = 0, j = anneau.length - 1; i < anneau.length; j = i++) {
    const xi = anneau[i][0], yi = anneau[i][1];
    const xj = anneau[j][0], yj = anneau[j][1];
    const coupe = ((yi > pt[1]) !== (yj > pt[1]))
      && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi);
    if (coupe) dedans = !dedans;
  }
  return dedans;
}

// Premier anneau = contour, les suivants = trous.
function pointDansPolygone(pt, poly) {
  if (!pointDansAnneau(pt, poly[0])) return false;
  for (let t = 1; t < poly.length; t++) if (pointDansAnneau(pt, poly[t])) return false;
  return true;
}

function pointDansGeometrie(pt, geom) {
  if (!geom) return false;
  if (geom.type === 'Polygon') return pointDansPolygone(pt, geom.coordinates);
  if (geom.type === 'MultiPolygon') return geom.coordinates.some((poly) => pointDansPolygone(pt, poly));
  return false;
}

// Toutes les zones affichées contenant ce point, de la plus basse à la plus haute.
function zonesAuPoint(lat, lon) {
  if (!espacesCharges()) return [];
  const pt = [wrapLon(lon), lat];
  return _espacesData.features
    .filter((f) => zoneAffichable(f.properties) && pointDansGeometrie(pt, f.geometry))
    .sort((a, b) => plancherApproxFt(a.properties) - plancherApproxFt(b.properties));
}

// Le contexte d'altitude : celui de l'avion s'il vole, sinon celui saisi à la
// main. Les trois références sont alors confondues — approximation assumée,
// signalée dans le panneau.
function contexteAltitude() {
  if (typeof derniereTrame === 'object' && derniereTrame
      && Number.isFinite(derniereTrame.amslFt)) {
    return {
      amslFt: derniereTrame.amslFt,
      aglFt: derniereTrame.aglFt,
      stdFt: derniereTrame.stdFt != null ? derniereTrame.stdFt : derniereTrame.amslFt,
      reel: true,
    };
  }
  const champ = $('esp-alt');   // créé avec les contrôles de carte
  const a = champ ? parseFloat(champ.value) : NaN;
  if (!Number.isFinite(a)) return null;
  return { amslFt: a, aglFt: a, stdFt: a, reel: false };
}

function sonderEspaces(latlng) {
  const zones = zonesAuPoint(latlng.lat, latlng.lng);
  _sondeListe = zones;
  const ctx = contexteAltitude();
  const corps = $('esp-sonde-corps');
  const panneau = $('esp-sonde');

  $('esp-sonde-pos').textContent =
    `${latlng.lat.toFixed(4)}, ${wrapLon(latlng.lng).toFixed(4)}`;

  if (!zones.length) {
    corps.innerHTML = `<p class="esp-vide">${t('espNoZone')}</p>`;
    panneau.hidden = false;
    return;
  }

  const traversees = zones.filter((f) => traverseZone(f.properties, ctx)).length;
  $('esp-sonde-compte').textContent = ctx
    ? t('espCountAlt').replace('{n}', zones.length).replace('{k}', traversees)
    : t('espCount').replace('{n}', zones.length);

  corps.innerHTML = zones.map((f, i) => {
    const p = f.properties;
    const fam = familleDeZone(p);
    const dedans = traverseZone(p, ctx);
    const titre = p.nomUsuel ? `${p.nom || ''} — ${p.nomUsuel}` : (p.nom || '(sans nom)');
    const badges = obligationsZone(p)
      .map((o) => `<span class="esp-badge esp-${tonObligation(o.t)}" title="${escapeHtml(o.d)}">${o.t}</span>`)
      .join('');
    return `<div class="esp-zone${dedans ? '' : ' esp-hors'}" data-i="${i}" title="${escapeHtml(t('espHighlight'))}">
      <div class="esp-nom"><span class="esp-pastille" style="background:${fam.couleur}"></span>${escapeHtml(titre)}</div>
      <div class="esp-meta">${escapeHtml(ESPACE_LIBELLES[p.type] || p.type)}${p.classe ? ' · classe ' + p.classe : ''}</div>
      <div class="esp-meta">${limiteTexte(p.plancher, p.plancherRef)} → ${limiteTexte(p.plafond, p.plafondRef)}</div>
      ${badges ? `<div class="esp-badges">${badges}</div>` : ''}
      ${p.horTxt ? `<div class="esp-hor">${escapeHtml(p.horTxt.replace(/#/g, ' · '))}</div>` : ''}
    </div>`;
  }).join('');

  // Chaque ligne renvoie à son polygone. Délégation sur le corps du panneau :
  // un seul écouteur, qui survit au re-rendu de la liste.
  marquerLigneActive();
  panneau.hidden = false;
}

// ------------------------------------------------------------
// Bandeau d'état (cycle AIRAC, nombre de zones tracées)
// ------------------------------------------------------------

async function majBandeauEspaces(nAffichees) {
  const el = $('esp-cycle');
  if (!el) return;
  if (!espacesCharges()) { el.textContent = t('espNone'); return; }
  const m = _espacesData.meta || {};
  const n = Number.isFinite(nAffichees) ? nAffichees : '—';
  el.textContent = t('espCycle')
    .replace('{date}', m.effDate || '?')
    .replace('{n}', n)
    .replace('{total}', m.zones || _espacesData.features.length);
}

// ------------------------------------------------------------
// Interface
// ------------------------------------------------------------

$('esp-sonde-close').addEventListener('click', () => {
  $('esp-sonde').hidden = true;
  surlignerZone(null);   // fermer le panneau éteint la surbrillance
  if (_sondeMarqueur) { map.removeLayer(_sondeMarqueur); _sondeMarqueur = null; }
});

$('esp-sonde-corps').addEventListener('click', (e) => {
  const ligne = e.target.closest('.esp-zone');
  if (!ligne) return;
  surlignerZone(_sondeListe[+ligne.dataset.i] || null);
});

// Rejoue la sonde au même endroit (après un changement de filtre ou d'altitude).
function rafraichirSondeEspaces() {
  if (_sondeMarqueur) sonderEspaces(_sondeMarqueur.getLatLng());
}

// Plancher maximal des zones affichées. Les champs qui l'appellent sont créés
// avec les contrôles de carte (controles-carte.js), donc APRÈS le chargement de
// ce fichier : c'est là-bas que les écouteurs sont posés, pas ici.
function appliquerPlancherMax(v) {
  espaceFiltres.plancherMaxFt = Number.isFinite(v) ? v : Infinity;
  localStorage.setItem('cap-esp-plancher', String(espaceFiltres.plancherMaxFt));
  tracerEspaces();
}

// Pose la sonde au point cliqué. Le clic gauche sur le fond de carte ne servait
// à rien jusqu'ici ; il sert maintenant à lire l'empilement des espaces.
function brancherSondeEspaces() {
  map.on('click', (e) => {
    if (!espacesCharges()) return;
    if (_sondeMarqueur) map.removeLayer(_sondeMarqueur);
    _sondeMarqueur = L.circleMarker(e.latlng, {
      radius: 6, color: '#fff', weight: 2, fillColor: '#4da3ff', fillOpacity: 1,
    }).addTo(map);
    sonderEspaces(e.latlng);
  });
}
