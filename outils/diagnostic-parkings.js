/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// diagnostic-parkings.js — trancher la convention BIAS_X / BIAS_Z.
//
// LE PROBLÈME. Le nœud TAXI_PARKING de SimConnect ne porte ni latitude ni
// longitude : il donne BIAS_X et BIAS_Z, « bias from airport reference along the
// longitudinal / latitudinal axis in meters ». Le SDK ne dit ni quel décalage
// porte quel axe, ni dans quel sens. HUIT lectures sont donc possibles : quatre
// rotations et quatre symétries. Sept placeraient les avions n'importe où.
//
// UNE PREMIÈRE MESURE, ÉCARTÉE. Mesurer la distance d'une place à la piste la
// plus proche ne tranche RIEN, et l'expérience l'a montré : les huit conventions
// rendaient des médianes voisines (502 à 689 m). Deux raisons. D'abord une
// symétrie d'un plan d'aire plausible reste un plan plausible — les places
// entourent la référence à peu près symétriquement. Ensuite le seuil lui-même
// était mal posé : à Roissy, un poste est LÉGITIMEMENT à 500 m ou 1 km d'une
// piste, les terminaux étant entre deux doublets écartés de trois kilomètres.
//
// DEUX MESURES QUI TRANCHENT, et qui ne demandent aucune vérité extérieure :
//
//   A. CAP DE STATIONNEMENT CONTRE AXE DE RANGÉE. Une symétrie retourne la
//      géométrie mais laisse le cap intact — le simulateur le donne en absolu.
//      Or dans une rangée, les avions sont garés nez à la rangée ou le long :
//      l'angle entre l'axe de la rangée et le cap vaut 0 ou 90°, jamais 37°.
//      Cette relation ne survit qu'aux ROTATIONS. Elle élimine les symétries.
//
//   B. NUL AVION NE STATIONNE SUR LA PISTE. La part des places tombant DANS un
//      rectangle de piste doit être exactement nulle. Un quart ou un demi-tour
//      en fait tomber. Cette mesure élimine les rotations parasites.
//
//   Les deux ensemble épuisent les huit cas. Mesuré sur 1 229 places de dix
//   terrains français : la convention (X = est, Z = nord) donne 0,0 % de places
//   sur piste aux dix terrains, contre 1,5 à 3,2 % pour les autres rotations.
//
// L'extraction ne porte que sur les terrains demandés, mais l'énumération
// mondiale de la phase 1 reste due : compter une à deux minutes.
//
//   node outils/diagnostic-parkings.js
//   node outils/diagnostic-parkings.js --idents LFPG,LFMD --out D:/essai
//   node outils/diagnostic-parkings.js --fichier <chemin.jsonl>   (sans MSFS)
//
// Pré-requis : MSFS 2024 lancé, un vol en cours — sauf avec --fichier, qui
// rejoue l'analyse sur une extraction déjà faite.
// ============================================================

const fs = require('fs');
const os = require('os');
const path = require('path');

// Terrains d'épreuve : de la grande plate-forme au terrain de club, pour que la
// mesure ne repose pas sur un seul plan d'aire.
const IDENTS_DEFAUT = ['LFPG', 'LFPO', 'LFBO', 'LFML', 'LFMN', 'LFMD', 'LFLY', 'LFST', 'LFRS', 'LFQQ'];

function argVal(nom, def) {
  const i = process.argv.indexOf(nom);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

// --- Géométrie plane locale (quelques kilomètres : l'approximation est exacte) ---
function metresParDegre(latDeg) {
  const f = latDeg * Math.PI / 180;
  return {
    lat: 111132.92 - 559.82 * Math.cos(2 * f) + 1.175 * Math.cos(4 * f) - 0.0023 * Math.cos(6 * f),
    lon: 111412.84 * Math.cos(f) - 93.5 * Math.cos(3 * f) + 0.118 * Math.cos(5 * f),
  };
}
const mediane = (v) => { if (!v.length) return NaN; const s = v.slice().sort((a, b) => a - b); return s[s.length >> 1]; };

// Écart à la grille des quarts de tour : 0 pour un angle parallèle OU
// perpendiculaire, 45 pour le pire cas.
function ecartAuQuartDeTour(a) {
  const d = ((a % 90) + 90) % 90;
  return d > 45 ? 90 - d : d;
}

// Le point P tombe-t-il dans le rectangle de la piste (longueur × largeur) ?
function dansLaPiste(P, A, B, largeurM) {
  const vx = B.x - A.x, vy = B.y - A.y;
  const l = Math.hypot(vx, vy) || 1;
  const ux = vx / l, uy = vy / l;
  const wx = P.x - A.x, wy = P.y - A.y;
  const along = wx * ux + wy * uy;
  const across = Math.abs(-wx * uy + wy * ux);
  return along >= 0 && along <= l && across <= largeurM / 2;
}

// Les huit lectures possibles du couple (BIAS_X, BIAS_Z), en (est, nord).
const CONVENTIONS = [
  { nom: 'X = est,   Z = nord', rot: true, f: (x, z) => ({ e: x, n: z }) },
  { nom: 'X = nord,  Z = ouest', rot: true, f: (x, z) => ({ e: -z, n: x }) },
  { nom: 'X = ouest, Z = sud', rot: true, f: (x, z) => ({ e: -x, n: -z }) },
  { nom: 'X = sud,   Z = est', rot: true, f: (x, z) => ({ e: z, n: -x }) },
  { nom: 'X = est,   Z = sud', rot: false, f: (x, z) => ({ e: x, n: -z }) },
  { nom: 'X = ouest, Z = nord', rot: false, f: (x, z) => ({ e: -x, n: z }) },
  { nom: 'X = nord,  Z = est', rot: false, f: (x, z) => ({ e: z, n: x }) },
  { nom: 'X = sud,   Z = ouest', rot: false, f: (x, z) => ({ e: -z, n: -x }) },
];
const RETENUE = CONVENTIONS[0].nom;   // celle que positionParking() applique

// Décalages bruts d'une place, retrouvés depuis la position que le fichier
// porte — celle-ci ayant été composée avec la convention retenue.
function decalages(t, p, m) {
  return {
    x: (p.longitude_deg - t.longitude_deg) * m.lon,
    z: (p.latitude_deg - t.latitude_deg) * m.lat,
  };
}

// A. Écarts entre l'axe d'une rangée et le cap de ses places.
function ecartsCap(t, convertir) {
  const m = metresParDegre(t.latitude_deg);
  const rangees = new Map();
  for (const p of (t.parkings || [])) {
    if (!Number.isFinite(p.headingDegT)) continue;
    const prefixe = String(p.ident).replace(/\s*\d+$/, '');
    if (!rangees.has(prefixe)) rangees.set(prefixe, []);
    rangees.get(prefixe).push(p);
  }
  const out = [];
  for (const [, liste] of rangees) {
    liste.sort((a, b) => a.number - b.number);
    for (let i = 1; i < liste.length; i++) {
      const A = liste[i - 1], B = liste[i];
      if (B.number !== A.number + 1) continue;
      // Deux places qui ne regardent pas dans le même sens ne forment pas une
      // rangée : ce sont deux rangées dos à dos aux numéros entremêlés.
      // L'expression vaut 0 pour deux caps identiques et 180 pour deux caps
      // opposés — on garde donc les PREMIERS.
      const dCap = Math.abs(((A.headingDegT - B.headingDegT + 540) % 360) - 180);
      if (dCap > 5) continue;
      const a = convertir(...Object.values(decalages(t, A, m)));
      const b = convertir(...Object.values(decalages(t, B, m)));
      const dx = b.e - a.e, dy = b.n - a.n;
      const d = Math.hypot(dx, dy);
      if (d < 5 || d > 200) continue;   // axe indéfini, ou ce n'est plus une rangée
      const axe = (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360;
      out.push(ecartAuQuartDeTour(axe - A.headingDegT));
    }
  }
  return out;
}

// B. Places tombant sur une piste.
function partSurPiste(t, convertir) {
  const m = metresParDegre(t.latitude_deg);
  const versXY = (lat, lon) => ({ x: (lon - t.longitude_deg) * m.lon, y: (lat - t.latitude_deg) * m.lat });
  const pistes = (t.runways || [])
    .filter((r) => Number.isFinite(r.le_latitude_deg) && Number.isFinite(r.he_latitude_deg))
    .map((r) => ({
      A: versXY(r.le_latitude_deg, r.le_longitude_deg),
      B: versXY(r.he_latitude_deg, r.he_longitude_deg),
      w: (r.width_ft || 150) * 0.3048,
    }));
  if (!pistes.length) return null;
  let dedans = 0, total = 0;
  for (const p of (t.parkings || [])) {
    const b = decalages(t, p, m);
    const c = convertir(b.x, b.z);
    const P = { x: c.e, y: c.n };
    total += 1;
    if (pistes.some((r) => dansLaPiste(P, r.A, r.B, r.w))) dedans += 1;
  }
  return { dedans, total };
}

function lireTerrains(fichier) {
  const out = [];
  for (const ligne of fs.readFileSync(fichier, 'utf-8').split('\n')) {
    const t = ligne.trim();
    if (!t) continue;
    let o; try { o = JSON.parse(t); } catch (_) { continue; }
    if (o && !o.__meta) out.push(o);
  }
  return out;
}

function analyser(terrains) {
  console.log('\n══════════════════════════════════════════════════');
  console.log('  PLACES DE STATIONNEMENT — CE QUI EST REMONTÉ');
  console.log('══════════════════════════════════════════════════');
  let total = 0;
  for (const t of terrains) {
    const n = (t.parkings || []).length;
    total += n;
    console.log(`  ${String(t.ident).padEnd(6)} ${String(n).padStart(4)} places · ${(t.runways || []).length} pistes · ${t.name}`);
  }
  console.log(`  ${'TOTAL'.padEnd(6)} ${String(total).padStart(4)} places`);

  if (total === 0) {
    console.log('\nAUCUNE place remontée. Deux causes possibles :');
    console.log('  · le nœud TAXI_PARKING n\'a pas été accepté par SimConnect ;');
    console.log('  · ces terrains n\'en déclarent pas (peu probable sur LFPG).');
    return 1;
  }

  console.log('\n──────────────────────────────────────────────────');
  console.log('  IDENTIFIANTS — échantillon');
  console.log('──────────────────────────────────────────────────');
  const vus = new Set();
  for (const t of terrains) {
    for (const p of (t.parkings || [])) {
      const cle = p.ident + ' | ' + p.type;
      if (vus.has(cle) || vus.size >= 20) continue;
      vus.add(cle);
      console.log(`  ${String(p.ident).padEnd(18)} ${String(p.type).padEnd(16)} rayon ${p.radius_m} m`);
    }
  }

  // Contrôle indépendant de toute orientation : les rangées se tiennent-elles ?
  // Il ne juge que le décodage du nœud et l'échelle.
  const ecartsRangee = [];
  for (const t of terrains) {
    const m = metresParDegre(t.latitude_deg);
    const rangees = new Map();
    for (const p of (t.parkings || [])) {
      const prefixe = String(p.ident).replace(/\s*\d+$/, '');
      if (!rangees.has(prefixe)) rangees.set(prefixe, []);
      rangees.get(prefixe).push(p);
    }
    for (const [, liste] of rangees) {
      liste.sort((a, b) => a.number - b.number);
      for (let i = 1; i < liste.length; i++) {
        if (liste[i].number !== liste[i - 1].number + 1) continue;
        const dx = (liste[i].longitude_deg - liste[i - 1].longitude_deg) * m.lon;
        const dy = (liste[i].latitude_deg - liste[i - 1].latitude_deg) * m.lat;
        ecartsRangee.push(Math.hypot(dx, dy));
      }
    }
  }
  console.log('\n──────────────────────────────────────────────────');
  console.log('  DÉCODAGE ET ÉCHELLE (indépendant de l\'orientation)');
  console.log('──────────────────────────────────────────────────');
  console.log(`  ${ecartsRangee.length} places consécutives d'une même rangée`);
  console.log(`  Écart médian entre voisines : ${Math.round(mediane(ecartsRangee))} m`);
  console.log('  Une vingtaine à quelques dizaines de mètres = rangées régulières,');
  console.log('  donc nœud décodé dans le bon ordre et échelle juste.');

  // --- A. Symétrie ou rotation ? ---
  console.log('\n──────────────────────────────────────────────────');
  console.log('  A. CAP DE STATIONNEMENT CONTRE AXE DE RANGÉE');
  console.log('     0° = cohérent · 45° = hasard. Élimine les symétries.');
  console.log('──────────────────────────────────────────────────');
  const scoreA = new Map();
  for (const c of CONVENTIONS) {
    let tous = [];
    for (const t of terrains) tous = tous.concat(ecartsCap(t, c.f));
    const med = mediane(tous);
    scoreA.set(c.nom, med);
    console.log(`  ${c.nom.padEnd(20)} ${med.toFixed(1).padStart(5)}°` + (c.nom === RETENUE ? '   (retenue)' : ''));
  }

  // --- B. Des avions sur la piste ? ---
  console.log('\n──────────────────────────────────────────────────');
  console.log('  B. PART DES PLACES TOMBANT SUR UNE PISTE');
  console.log('     Doit être nulle. Élimine les rotations parasites.');
  console.log('──────────────────────────────────────────────────');
  const scoreB = new Map();
  for (const c of CONVENTIONS) {
    let dedans = 0, tot = 0;
    for (const t of terrains) {
      const r = partSurPiste(t, c.f);
      if (r) { dedans += r.dedans; tot += r.total; }
    }
    const part = tot ? dedans / tot : 1;
    scoreB.set(c.nom, part);
    console.log(`  ${c.nom.padEnd(20)} ${(part * 100).toFixed(1).padStart(5)} %` + (c.nom === RETENUE ? '   (retenue)' : ''));
  }

  // --- Verdict ---
  // La bonne convention est celle qui tient les DEUX : rangées cohérentes avec
  // les caps, et aucune place sur une piste.
  const recevables = CONVENTIONS.filter((c) => scoreA.get(c.nom) < 12 && scoreB.get(c.nom) < 0.002);
  console.log('\n══════════════════════════════════════════════════');
  if (recevables.length === 1) {
    const gagnante = recevables[0];
    if (gagnante.nom === RETENUE) {
      console.log('  TRANCHÉ : ' + gagnante.nom);
      console.log('  C\'est la convention en place. Rien à changer —');
      console.log('  le réimport complet peut être lancé.');
      console.log('══════════════════════════════════════════════════');
      return 0;
    }
    console.log('  TRANCHÉ : ' + gagnante.nom);
    console.log('  Ce N\'EST PAS la convention en place (' + RETENUE + ').');
    console.log('  Corriger positionParking() dans');
    console.log('  src/main/extract-airports-msfs.js AVANT de réimporter.');
    console.log('══════════════════════════════════════════════════');
    return 2;
  }
  if (recevables.length === 0) {
    console.log('  NON TRANCHÉ : aucune convention ne tient les deux mesures.');
    console.log('  Les décalages ne sont donc pas ce que la documentation');
    console.log('  laisse entendre. À reprendre AVANT tout réimport.');
  } else {
    console.log('  NON TRANCHÉ : ' + recevables.length + ' conventions tiennent les deux');
    console.log('  mesures — ' + recevables.map((c) => c.nom).join(' · '));
    console.log('  L\'échantillon est trop maigre ou trop symétrique. Reprendre');
    console.log('  avec davantage de terrains, aux pistes non cardinales.');
  }
  console.log('══════════════════════════════════════════════════');
  return 3;
}

async function principal() {
  const fichierDonne = argVal('--fichier', '');
  if (fichierDonne) {
    console.log('Analyse d\'une extraction existante : ' + fichierDonne);
    console.log('(aucune connexion au simulateur)');
    process.exit(analyser(lireTerrains(fichierDonne)));
  }

  const { runExtraction } = require('../src/main/extract-airports-msfs');
  const idents = argVal('--idents', IDENTS_DEFAUT.join(',')).split(',').map((x) => x.trim()).filter(Boolean);
  const outDir = argVal('--out', path.join(os.tmpdir(), 'cap-cavva-diagnostic-parkings'));
  fs.mkdirSync(outDir, { recursive: true });

  console.log('Terrains demandés : ' + idents.join(', '));
  console.log('Sortie            : ' + outDir);
  console.log('\nL\'énumération mondiale de la phase 1 reste due : une à deux minutes.\n');

  await runExtraction({
    window: 20,
    idents,
    outDir,
    onProgress: (p) => {
      if (p.phase === 'connected') console.log('Connecté à : ' + p.sim);
      else if (p.phase === 'enumerate') process.stdout.write(`\r[énumération] ${p.enumerated}   `);
      else if (p.phase === 'detail') process.stdout.write(`\r[détail] ${p.treated}/${p.target}   `);
    },
  });
  console.log('\n');
  process.exit(analyser(lireTerrains(path.join(outDir, 'airports-msfs.jsonl'))));
}

principal().catch((e) => {
  console.error('\nÉchec du diagnostic : ' + ((e && e.message) || e));
  process.exit(1);
});
