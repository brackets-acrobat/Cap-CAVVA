/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// serveur-brief-essai.js — un CAVVA de laboratoire, le temps d'un essai.
//
// Le site ne publie pas encore /cap-cavva/briefs.json : ce serveur en sert un,
// signé pour de bon, afin que le client soit éprouvé AVANT que le générateur
// existe. Le jeu d'essai (outils/briefs-exemple.json) est la copie des 42 vols
// réellement publiés, zones recopiées telles qu'elles ont été saisies — y
// compris « NON », « R46A R46B R46C » et les séances américaines.
//
// Il sait aussi jouer les cas qui fâchent, et c'est là qu'est son intérêt : une
// vérification de signature ne vaut que si on l'a vue refuser quelque chose.
//
//   node outils/serveur-brief-essai.js [--port=8787] [--cle=…] [--cas=ok]
//
//   --cas=ok         collection valide, signée (défaut)
//   --cas=falsifie   contenu modifié APRÈS signature → le client doit répondre
//                    « signature des briefs invalide » et ne rien afficher
//   --cas=absent     404 → « aucune séance publiée », qui n'est pas une panne
//   --cas=refuse     401 → « clé CAVVA refusée »
//   --cas=malforme   signé, mais une date hors format → le client doit nommer
//                    le rang fautif
//   --cas=futur      signé, format 2 → le client doit refuser d'interpréter
//   --cas=entete     signature livrée dans l'en-tête X-Cap-Signature, et AUCUN
//                    fichier .sig publié (404) → c'est le mode recommandé pour
//                    un serveur qui compose le JSON à la volée
//
// Puis, dans un autre terminal :
//
//   CAVVA_BASE_URL=http://127.0.0.1:8787 npm start        (bash)
//   $env:CAVVA_BASE_URL='http://127.0.0.1:8787'; npm start (PowerShell)
//
// N'importe quelle clé CAVVA fait l'affaire côté application tant que --cle
// n'est pas posé ; il en faut simplement une d'enregistrée, sinon le client
// s'arrête avant la requête (code « nokey »).
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');

const { signer } = require('../src/main/brief-crypto');

const args = Object.fromEntries(
  process.argv.slice(2)
    .filter((a) => a.startsWith('--'))
    .map((a) => { const [k, v] = a.slice(2).split('='); return [k, v === undefined ? true : v]; })
);

const PORT = parseInt(args.port, 10) || 8787;
const CAS = args.cas || 'ok';
const CLE_EXIGEE = typeof args.cle === 'string' ? args.cle : null;
const CHEMIN = '/cap-cavva/briefs.json';

const CAS_CONNUS = ['ok', 'falsifie', 'absent', 'refuse', 'malforme', 'futur', 'entete'];
if (!CAS_CONNUS.includes(CAS)) {
  console.error(`--cas=${CAS} inconnu. Attendu : ${CAS_CONNUS.join(', ')}`);
  process.exit(2);
}

// ------------------------------------------------------------
// Le corps servi, et sa signature
// ------------------------------------------------------------

const source = fs.readFileSync(path.join(__dirname, 'briefs-exemple.json'));
const enJson = (o) => Buffer.from(JSON.stringify(o, null, 2) + '\n', 'utf8');

// Ce qui est SIGNÉ puis ce qui est SERVI, dans cet ordre — c'est justement leur
// désaccord qu'on veut pouvoir provoquer.
let aSigner = source;
if (CAS === 'malforme') {
  const o = JSON.parse(source.toString('utf8'));
  o.briefs[3].date = '17/02/2027';   // pas le format AAAA-MM-JJ du site
  aSigner = enJson(o);
} else if (CAS === 'futur') {
  const o = JSON.parse(source.toString('utf8'));
  o.format = 2;
  aSigner = enJson(o);
}

const SIGNATURE = signer(aSigner);

let servi = aSigner;
if (CAS === 'falsifie') {
  // Une zone active ajoutée après coup sur la prochaine séance : exactement ce
  // qu'un serveur détourné tenterait, et ce que la signature doit empêcher.
  const o = JSON.parse(source.toString('utf8'));
  o.briefs[0].zones = ['P23'];
  servi = enJson(o);
}

// ------------------------------------------------------------

function cleDeLaRequete(req) {
  const auth = req.headers.authorization || '';
  const bearer = /^Bearer\s+(.+)$/i.exec(auth);
  return (bearer ? bearer[1] : req.headers['x-api-key'] || '').trim();
}

function repondre(res, code, corps, type, entetesSup) {
  res.writeHead(code, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(corps),
    'Cache-Control': 'no-store',
    ...(entetesSup || {}),
  });
  res.end(corps);
}

const serveur = http.createServer((req, res) => {
  const url = (req.url || '').split('?')[0];
  const cle = cleDeLaRequete(req);
  const trace = (etat) => console.log(`  ${req.method} ${url} → ${etat}${cle ? ` (clé « ${cle.slice(0, 8)}… »)` : ' (sans clé)'}`);

  if (url !== CHEMIN && url !== CHEMIN + '.sig') {
    trace(404);
    return repondre(res, 404, 'not found');
  }

  if (CAS === 'refuse' || !cle || (CLE_EXIGEE && cle !== CLE_EXIGEE)) {
    trace(401);
    return repondre(res, 401, 'unauthorized');
  }

  if (CAS === 'absent') {
    trace(404);
    return repondre(res, 404, 'aucune séance publiée');
  }

  if (url.endsWith('.sig')) {
    // En mode « entête », le fichier .sig n'existe pas : le client doit se
    // contenter de l'en-tête, et ne jamais réclamer ce second fichier.
    if (CAS === 'entete') {
      trace('404 (.sig non publié — signature en en-tête)');
      return repondre(res, 404, 'pas de fichier de signature');
    }
    trace('200 sig');
    return repondre(res, 200, SIGNATURE + '\n');
  }

  const sup = (CAS === 'entete') ? { 'X-Cap-Signature': SIGNATURE } : undefined;
  trace(`200 ${servi.length} o${sup ? ' + X-Cap-Signature' : ''}`);
  return repondre(res, 200, servi, 'application/json; charset=utf-8', sup);
});

serveur.listen(PORT, '127.0.0.1', () => {
  const base = `http://127.0.0.1:${PORT}`;
  const n = JSON.parse(source.toString('utf8')).briefs.length;
  console.log(`Serveur de briefs d'essai — cas « ${CAS} », ${n} séances`);
  console.log(`  ${base}${CHEMIN}`);
  console.log(`  ${base}${CHEMIN}.sig  → ${SIGNATURE}`);
  console.log(`  clé exigée : ${CLE_EXIGEE ? `« ${CLE_EXIGEE} »` : 'n\'importe laquelle, mais non vide'}`);
  console.log('');
  console.log(`  CAVVA_BASE_URL=${base} npm start`);
  console.log('');
});
