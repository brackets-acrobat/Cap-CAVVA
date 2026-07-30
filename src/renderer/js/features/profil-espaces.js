/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// profil-espaces.js — les espaces aériens DANS le profil vertical.
//
// Le profil montre le relief et l'altitude prévue ; il lui manquait ce qui
// décide vraiment d'une navigation VFR : à quel moment la route entre sous une
// TMA, traverse une zone R, ou passe sous un plancher qui descend.
//
// ── Comment les tranches sont trouvées ──────────────────────────────────────
// On échantillonne la route et on teste l'appartenance de chaque échantillon à
// chaque zone (même « point dans le polygone » que la sonde de la carte). Les
// échantillons consécutifs à l'intérieur d'une même zone forment une tranche.
// C'est de la force brute, mais chaque zone est d'abord écartée par sa boîte
// englobante : en pratique quelques millisecondes.
//
// ── Pourquoi les blocs ne sont pas des rectangles ────────────────────────────
// Une limite « 800 ft ASFC » suit le relief. La dessiner comme une ligne droite
// serait faux là où ça compte le plus — au-dessus d'un plateau, le plancher
// monte avec le sol. On a le profil du terrain sous la main : le bord du bloc
// le suit. Les limites AMSL et FL, elles, sont bien horizontales.
//
// Les niveaux de vol sont posés à FL × 100 pieds. C'est la convention de
// tracé ; le vrai jugement d'appartenance, lui, se fait sur l'altitude pression
// du simulateur (cf. espaces-obligations.js) et n'utilise pas cette conversion.
// ============================================================

const PROFIL_ECHANTILLONS = 360;   // le long de la route, tous zooms confondus
const PROFIL_BLOC_MIN_PX = 3;      // en deçà, la tranche n'est pas dessinable

let _profilEspacesSig = null;      // signature route + filtres (anti-recalcul)
let _profilEspacesBlocs = [];

// ------------------------------------------------------------
// Échantillonnage de la route
// ------------------------------------------------------------

// Interpolation LINÉAIRE en lat/lon, leg par leg — la même que côté main pour
// le relief, afin que les deux axes de distance se superposent exactement.
function echantillonnerRoute(wps) {
  const legNM = [];
  let totalNM = 0;
  for (let i = 1; i < wps.length; i++) {
    const d = distanceNM(wps[i - 1].lat, wps[i - 1].lon, wps[i].lat, wps[i].lon);
    legNM.push(d);
    totalNM += d;
  }
  if (!(totalNM > 0)) return { ech: [], totalNM: 0 };

  const ech = [];
  let cum = 0;
  for (let i = 1; i < wps.length; i++) {
    const a = wps[i - 1], b = wps[i], nm = legNM[i - 1];
    // Chaque leg reçoit un nombre d'échantillons proportionnel à sa longueur.
    const n = Math.max(2, Math.round(PROFIL_ECHANTILLONS * (nm / totalNM)));
    for (let s = (i === 1 ? 0 : 1); s <= n; s++) {
      const f = s / n;
      ech.push({
        d: cum + nm * f,
        lat: a.lat + (b.lat - a.lat) * f,
        lon: a.lon + (b.lon - a.lon) * f,
      });
    }
    cum += nm;
  }
  return { ech, totalNM };
}

// ------------------------------------------------------------
// Boîtes englobantes
// ------------------------------------------------------------

// Mémorisée sur la feature : elle ne change jamais, et sert à écarter d'emblée
// les zones que la route ne peut pas toucher.
function boiteZone(feature) {
  if (feature.__boite) return feature.__boite;
  let oMin = Infinity, oMax = -Infinity, aMin = Infinity, aMax = -Infinity;
  const visiter = (c) => {
    if (typeof c[0] === 'number') {
      if (c[0] < oMin) oMin = c[0];
      if (c[0] > oMax) oMax = c[0];
      if (c[1] < aMin) aMin = c[1];
      if (c[1] > aMax) aMax = c[1];
      return;
    }
    for (const s of c) visiter(s);
  };
  visiter(feature.geometry.coordinates);
  feature.__boite = { oMin, oMax, aMin, aMax };
  return feature.__boite;
}

function boitesSeCroisent(a, b) {
  return a.oMin <= b.oMax && a.oMax >= b.oMin && a.aMin <= b.aMax && a.aMax >= b.aMin;
}

// ------------------------------------------------------------
// Tranches de route à l'intérieur des zones
// ------------------------------------------------------------

// Renvoie [{ feature, d0, d1 }] — une entrée par passage continu dans une zone.
// Une même zone peut donc apparaître plusieurs fois si la route en sort et y
// rentre (contournement, zone en U).
function tranchesEspaces(ech) {
  if (!ech.length || !espacesCharges()) return [];

  const boiteRoute = ech.reduce((b, p) => ({
    oMin: Math.min(b.oMin, p.lon), oMax: Math.max(b.oMax, p.lon),
    aMin: Math.min(b.aMin, p.lat), aMax: Math.max(b.aMax, p.lat),
  }), { oMin: Infinity, oMax: -Infinity, aMin: Infinity, aMax: -Infinity });

  const tranches = [];
  for (const feature of _espacesData.features) {
    if (!zoneAffichable(feature.properties)) continue;
    const boite = boiteZone(feature);
    if (!boitesSeCroisent(boite, boiteRoute)) continue;

    let debut = null, dernier = null;
    for (const p of ech) {
      const dedans = p.lon >= boite.oMin && p.lon <= boite.oMax
        && p.lat >= boite.aMin && p.lat <= boite.aMax
        && pointDansGeometrie([p.lon, p.lat], feature.geometry);
      if (dedans) {
        if (debut === null) debut = p.d;
        dernier = p.d;
      } else if (debut !== null) {
        tranches.push({ feature, d0: debut, d1: dernier });
        debut = null;
      }
    }
    if (debut !== null) tranches.push({ feature, d0: debut, d1: dernier });
  }

  // Les planchers les plus hauts dessinés en premier : les zones basses, qui
  // concernent le vol, restent lisibles par-dessus.
  tranches.sort((a, b) => plancherApproxFt(b.feature.properties) - plancherApproxFt(a.feature.properties));
  return tranches;
}

// Recalcule si la route ou les filtres ont bougé, sinon rend le cache.
function calculerEspacesProfil(wps) {
  const sig = JSON.stringify({
    w: wps.map((p) => [p.lat, p.lon]),
    f: espaceFiltres.familles,
    p: espaceFiltres.plancherMaxFt,
    c: espacesCharges() ? (_espacesData.meta || {}).effDate : null,
    // Les zones actives échappent aux filtres : charger un brief change donc la
    // liste des tranches, et doit invalider le cache au même titre qu'un filtre.
    a: (typeof _clesActives !== 'undefined') ? [..._clesActives].sort() : null,
  });
  if (sig === _profilEspacesSig) return _profilEspacesBlocs;

  const { ech } = echantillonnerRoute(wps);
  _profilEspacesBlocs = tranchesEspaces(ech);
  _profilEspacesSig = sig;
  return _profilEspacesBlocs;
}

// ------------------------------------------------------------
// Tracé
// ------------------------------------------------------------

// Altitude en pieds d'une limite, à la distance d. `sol(d)` donne le relief.
// null = limite absente (à traiter comme le bord du graphe).
function altitudeLimite(valeur, ref, d, sol) {
  if (valeur == null) return null;
  if (ref === 'FL') return valeur * 100;
  if (ref === 'ASFC') return (sol(d) || 0) + valeur;
  return valeur;   // AMSL
}

// Une tranche devient un polygone : bord bas puis bord haut en sens inverse.
// Les bords qui suivent le relief sont échantillonnés, les autres sont droits.
function polygoneTranche(bloc, X, Y, sol, yMax) {
  const p = bloc.feature.properties;
  const suitSolBas = p.plancherRef === 'ASFC';
  const suitSolHaut = p.plafondRef === 'ASFC';
  const PAS = 12;   // échantillons le long d'un bord qui suit le relief

  const bas = [], haut = [];
  const n = (suitSolBas || suitSolHaut) ? PAS : 1;
  for (let i = 0; i <= n; i++) {
    const d = bloc.d0 + (bloc.d1 - bloc.d0) * (i / n);
    const b = altitudeLimite(p.plancher, p.plancherRef, d, sol);
    const h = altitudeLimite(p.plafond, p.plafondRef, d, sol);
    bas.push([X(d), Y(b == null ? 0 : b)]);
    haut.push([X(d), Y(h == null ? yMax : Math.min(h, yMax))]);
  }

  const pts = bas.concat(haut.reverse());
  return 'M ' + pts.map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join(' L ') + ' Z';
}

// SVG des tranches, à insérer sous les tracés du relief et de l'altitude prévue.
//
// La zone mise en évidence depuis le panneau de sonde (_zoneSurlignee, cf.
// espaces-aeriens.js) est traitée à part : dessinée EN DERNIER pour passer
// au-dessus des autres, bordée de blanc pour se détacher du fond clair, et
// étiquetée même si son bloc est étroit. Cliquer une ligne de la liste doit
// désigner sans ambiguïté le même volume sur la carte ET dans le profil.
function rendreEspacesProfil(blocs, X, Y, sol, yMax) {
  let formes = '', etiquettes = '', surligne = '';

  for (const bloc of blocs) {
    const p = bloc.feature.properties;
    const fam = familleDeZone(p);
    if (!fam) continue;

    const x0 = X(bloc.d0), x1 = X(bloc.d1);
    const vedette = (typeof _zoneSurlignee !== 'undefined' && bloc.feature === _zoneSurlignee);
    const active = (typeof estZoneActive === 'function' && estZoneActive(p));
    if (x1 - x0 < PROFIL_BLOC_MIN_PX && !vedette && !active) continue;

    // Une zone entièrement au-dessus du graphe n'a rien à y montrer.
    const dMil = (bloc.d0 + bloc.d1) / 2;
    const basFt = altitudeLimite(p.plancher, p.plancherRef, dMil, sol);
    if (basFt != null && basFt > yMax) continue;

    const forme = polygoneTranche(bloc, X, Y, sol, yMax);
    const forte = (p.type === 'R' || p.type === 'P');
    const hautFt = altitudeLimite(p.plafond, p.plafondRef, dMil, sol);
    const yb = Y(basFt == null ? 0 : basFt);
    const yh = Y(hautFt == null ? yMax : Math.min(hautFt, yMax));
    const nom = `${p.type} ${p.nom || ''}`.trim();

    if (vedette) {
      // Liseré blanc dessous, contour de famille dessus — même procédé que la
      // route sur la carte, seul lisible sur un fond clair.
      surligne += `<path d="${forme}" fill="${fam.couleur}" fill-opacity="0.42" `
        + `stroke="#ffffff" stroke-width="5"/>`
        + `<path d="${forme}" fill="none" stroke="${fam.couleur}" stroke-width="2.5"/>`
        + `<text x="${((x0 + x1) / 2).toFixed(1)}" y="${((yb + yh) / 2 + 3).toFixed(1)}" `
        + `text-anchor="middle" font-size="9.5" font-weight="700" fill="${fam.couleur}" `
        + `style="paint-order:stroke;stroke:#ffffff;stroke-width:3px">${escapeHtml(nom.slice(0, 16))}</text>`;
      continue;
    }

    // Zone annoncée active par le brief : le même halo ambre que sur la carte,
    // posé sous le bloc. Les deux vues désignent alors le même volume de la même
    // manière — c'est tout l'intérêt de les regarder ensemble.
    if (active) {
      formes += `<path d="${forme}" fill="none" stroke="#f59e0b" stroke-width="5" stroke-opacity="0.75"/>`;
    }

    formes += `<path d="${forme}" fill="${fam.couleur}" `
      + `fill-opacity="${active ? 0.34 : (forte ? 0.26 : 0.13)}" stroke="${fam.couleur}" `
      + `stroke-width="${active ? 1.8 : (forte ? 1.4 : 1)}" stroke-opacity="0.85"/>`;

    // Étiquette seulement s'il y a la place : sinon le survol renseigne. Une zone
    // active est étiquetée dès qu'elle est dessinable.
    if ((active && x1 - x0 > 18) || (x1 - x0 > 34 && yb - yh > 13)) {
      etiquettes += `<text x="${((x0 + x1) / 2).toFixed(1)}" y="${((yb + yh) / 2 + 3).toFixed(1)}" `
        + `text-anchor="middle" font-size="9" fill="${fam.couleur}" `
        + `style="paint-order:stroke;stroke:#f8fafc;stroke-width:2.5px">${escapeHtml(nom.slice(0, 14))}</text>`;
    }
  }
  return formes + etiquettes + surligne;
}

// Zones traversées à la distance d, pour l'infobulle de survol. `alt` est
// l'ordonnée survolée en pieds : on ne cite que les zones qui l'englobent.
function espacesAuSurvol(d, alt, sol) {
  const out = [];
  for (const bloc of _profilEspacesBlocs) {
    if (d < bloc.d0 || d > bloc.d1) continue;
    const p = bloc.feature.properties;
    const bas = altitudeLimite(p.plancher, p.plancherRef, d, sol);
    const haut = altitudeLimite(p.plafond, p.plafondRef, d, sol);
    if (bas != null && alt < bas) continue;
    if (haut != null && alt > haut) continue;
    out.push({ p, fam: familleDeZone(p) });
  }
  return out;
}
