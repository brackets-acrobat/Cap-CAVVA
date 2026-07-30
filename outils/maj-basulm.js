/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// outils/maj-basulm.js — régénère l'index des terrains ULM (BASULM / FFPLUM).
// ============================================================
//
//   npm run basulm:maj
//
// Écrit src/main/bundled-data/basulm-index.csv.gz : code, latitude, longitude,
// toponyme. Cet index sert à retrouver la fiche d'un terrain à partir de ses
// COORDONNÉES, parce que les codes des terrains ULM dans MSFS sont souvent faux
// (LFIJ dans le simulateur contre LF0125 chez BASULM, pour le même terrain de
// Lavours à 89 m près) — voir src/main/fiche-ulm.js.
//
// À relancer de temps en temps : la base FFPLUM vit, des terrains y entrent et
// leurs fiches changent. Sans mise à jour, un terrain récent n'aura pas de
// fiche dans l'app — jamais une fiche fausse, l'ouverture étant vérifiée.
//
// Données © FFPLUM (basulm.ffplum.fr), réutilisées en citant la source.
// ============================================================

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ACCUEIL = 'https://basulm.ffplum.fr/';
const DONNEES = 'https://basulm.ffplum.fr/x_load_terrains_carto.php';
const SORTIE = path.join(__dirname, '..', 'src', 'main', 'bundled-data', 'basulm-index.csv.gz');

// Le point d'entrée des données refuse de répondre sans session : il faut
// d'abord visiter l'accueil pour obtenir le cookie PHPSESSID.
async function session() {
  const r = await fetch(ACCUEIL, { redirect: 'follow' });
  if (!r.ok) throw new Error(`accueil : HTTP ${r.status}`);
  const brut = r.headers.getSetCookie ? r.headers.getSetCookie() : [];
  const cookies = brut.map((c) => c.split(';')[0]).join('; ');
  if (!cookies) throw new Error('aucun cookie de session reçu');
  return cookies;
}

async function terrains(cookies) {
  const r = await fetch(DONNEES, {
    method: 'POST',
    headers: { Cookie: cookies, 'X-Requested-With': 'XMLHttpRequest', Referer: ACCUEIL },
  });
  if (!r.ok) throw new Error(`données : HTTP ${r.status}`);
  const type = r.headers.get('content-type') || '';
  if (!/json/i.test(type)) throw new Error(`données : réponse ${type} au lieu de JSON (session refusée ?)`);
  return r.json();
}

// Un toponyme ne doit ni casser le CSV ni gonfler le fichier.
function propre(s) {
  return String(s == null ? '' : s).replace(/[;\r\n]+/g, ' ').trim().slice(0, 60);
}

(async () => {
  console.log('Session BASULM…');
  const cookies = await session();
  console.log('Téléchargement de l\'inventaire…');
  const brut = await terrains(cookies);
  if (!Array.isArray(brut) || !brut.length) throw new Error('inventaire vide');

  const lignes = [];
  let ignores = 0;
  for (const t of brut) {
    const code = String(t.codeterrain || '').trim().toUpperCase();
    const lat = Number(t.lat), lon = Number(t.lon);
    if (!code || !Number.isFinite(lat) || !Number.isFinite(lon)) { ignores++; continue; }
    // 5 décimales ≈ 1 m : bien au-delà de ce que le rapprochement exige.
    lignes.push(`${code};${lat.toFixed(5)};${lon.toFixed(5)};${propre(t.toponyme)}`);
  }
  lignes.sort();

  const csv = `# BASULM — terrains ULM, © FFPLUM (basulm.ffplum.fr)\n# ${new Date().toISOString()} — ${lignes.length} terrains\n# code;lat;lon;toponyme\n${lignes.join('\n')}\n`;
  fs.mkdirSync(path.dirname(SORTIE), { recursive: true });
  fs.writeFileSync(SORTIE, zlib.gzipSync(Buffer.from(csv, 'utf8'), { level: 9 }));

  console.log(`${lignes.length} terrains écrits${ignores ? ` (${ignores} ignorés, coordonnées ou code manquants)` : ''}`);
  console.log(`${SORTIE} — ${(fs.statSync(SORTIE).size / 1024).toFixed(1)} Ko compressés`);
})().catch((e) => {
  console.error(`Échec : ${e.message}`);
  process.exit(1);
});
