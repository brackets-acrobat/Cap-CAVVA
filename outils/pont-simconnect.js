/*
 * L'appli du mercredi soir — pont SimConnect
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// pont-simconnect.js — sert la carte et lui pousse la position réelle.
//
// But de ce script : lever la dernière inconnue du projet. La donnée openAIP
// est acquise ; reste à savoir si le vol réel s'y branche proprement. Trois
// questions, et une seule réponse :
//
//   « les planchers GND se convertissent-ils avec le relief ? »
//   « les niveaux de vol se convertissent-ils avec le QNH ? »
//
// Il n'y a rien à convertir. Une limite openAIP se lit dans l'une de trois
// références, et le simulateur fournit les trois telles quelles :
//
//   referenceDatum 0 (GND)  → PLANE ALT ABOVE GROUND   hauteur-sol
//   referenceDatum 1 (MSL)  → PLANE ALTITUDE           altitude vraie
//   referenceDatum 2 / FL   → PRESSURE ALTITUDE        altitude pression (1013)
//
// PRESSURE ALTITUDE est déjà l'altitude au calage standard : comparer un FL
// revient à comparer deux nombres, sans jamais toucher au QNH. Le calage
// pilote et le QNH ne sont lus que pour être AFFICHÉS — l'écart entre les deux
// est la faute d'altimétrie du pilote, pas un terme de calcul.
//
// La troisième question — l'anticipation — se règle côté carte : le pont
// fournit route-sol et vitesse-sol, la carte projette le point à +90 s et
// interroge la géométrie là-bas. C'est le même « point dans le volume », joué
// en avance.
//
// Transport : Server-Sent Events. Un flux, un sens, reconnexion automatique
// par le navigateur, zéro dépendance hors node-simconnect. Le serveur sert
// aussi la page, ce qui met tout sur la même origine.
//
//   node pont-simconnect.js     puis     http://127.0.0.1:8787/
// ============================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const {
  open: scOpen,
  Protocol: SCProtocol,
  SimConnectDataType: SCDataType,
  SimConnectPeriod: SCPeriod,
  SimConnectConstants: SCConst,
} = require('node-simconnect');

const PORT = 8787;
const DEF_ID = 1;
const REQ_ID = 1;
const CADENCE_MS = 250;   // 4 Hz : large pour une anticipation à 90 s
const RETENTE_MS = 5000;  // le simulateur n'est pas toujours lancé le premier

// ------------------------------------------------------------
// Serveur : la page, puis le flux
// ------------------------------------------------------------

const clients = new Set();
let dernier = null;
let etatSim = { connecte: false, detail: 'jamais connecté' };

const serveur = http.createServer((req, res) => {
  const chemin = req.url.split('?')[0];

  if (chemin === '/flux') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    });
    // Un premier envoi immédiat : la carte connaît l'état sans attendre l'image
    // suivante, et l'utilisateur voit tout de suite si le simulateur répond.
    res.write('retry: 2000\n\n');
    envoyer(res, 'etat', etatSim);
    if (dernier) envoyer(res, 'position', dernier);
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (chemin === '/' || chemin === '/carte-espaces-france.html') {
    const f = path.join(__dirname, 'carte-espaces-france.html');
    fs.readFile(f, (err, buf) => {
      if (err) { res.writeHead(500); res.end('carte-espaces-france.html introuvable'); return; }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(buf);
    });
    return;
  }

  res.writeHead(404);
  res.end('404');
});

function envoyer(res, type, charge) {
  res.write(`event: ${type}\ndata: ${JSON.stringify(charge)}\n\n`);
}

function diffuser(type, charge) {
  for (const c of clients) {
    try { envoyer(c, type, charge); } catch (_) { clients.delete(c); }
  }
}

function majEtat(connecte, detail) {
  etatSim = { connecte, detail };
  diffuser('etat', etatSim);
  console.log(`[sim] ${detail}`);
}

// ------------------------------------------------------------
// SimConnect
// ------------------------------------------------------------

// L'ORDRE des addToDataDefinition fixe l'ordre de lecture plus bas.
function definir(handle) {
  const v = (nom, unite, type) => handle.addToDataDefinition(DEF_ID, nom, unite, type);
  v('PLANE LATITUDE',           'degrees',    SCDataType.FLOAT64);
  v('PLANE LONGITUDE',          'degrees',    SCDataType.FLOAT64);
  v('PLANE ALTITUDE',           'feet',       SCDataType.FLOAT64); // vraie, MSL
  v('PLANE ALT ABOVE GROUND',   'feet',       SCDataType.FLOAT64); // hauteur-sol
  v('GROUND ALTITUDE',          'feet',       SCDataType.FLOAT64); // relief
  v('PRESSURE ALTITUDE',        'feet',       SCDataType.FLOAT64); // calage 1013
  v('KOHLSMAN SETTING MB',      'millibars',  SCDataType.FLOAT64); // calage affiché
  v('SEA LEVEL PRESSURE',       'millibars',  SCDataType.FLOAT64); // QNH réel
  v('GPS GROUND TRUE TRACK',    'degrees',    SCDataType.FLOAT64); // route sol vraie
  v('GROUND VELOCITY',          'knots',      SCDataType.FLOAT64);
  v('VERTICAL SPEED',           'feet/minute', SCDataType.FLOAT64);
  v('PLANE HEADING DEGREES MAGNETIC', 'degrees', SCDataType.FLOAT64);
  v('MAGVAR',                   'degrees',    SCDataType.FLOAT64);
  v('TITLE',                    null,         SCDataType.STRING256);

  handle.requestDataOnSimObject(
    REQ_ID, DEF_ID, SCConst.OBJECT_ID_USER,
    SCPeriod.SIM_FRAME, 0, 0, 0, 0
  );
}

let derniereEmission = 0;

function brancher(handle) {
  handle.on('simObjectData', (data) => {
    if (data.requestID !== REQ_ID) return;
    // Lecture dans l'ordre EXACT de la définition ci-dessus.
    let t;
    try {
      t = {
        lat:        data.data.readFloat64(),
        lon:        data.data.readFloat64(),
        amslFt:     data.data.readFloat64(),
        aglFt:      data.data.readFloat64(),
        solFt:      data.data.readFloat64(),
        stdFt:      data.data.readFloat64(),
        calageHpa:  data.data.readFloat64(),
        qnhHpa:     data.data.readFloat64(),
        routeVraie: data.data.readFloat64(),
        solKt:      data.data.readFloat64(),
        vzFtMin:    data.data.readFloat64(),
        capMag:     data.data.readFloat64(),
        declinaison: data.data.readFloat64(),
        aeronef:    data.data.readString256(),
      };
    } catch (err) {
      majEtat(true, 'lecture illisible : ' + (err && err.message));
      return;
    }

    t.t = Date.now();
    dernier = t;
    if (t.t - derniereEmission < CADENCE_MS) return;
    derniereEmission = t.t;
    diffuser('position', t);
  });

  handle.on('exception', (ex) => {
    console.log('[sim] exception ' + JSON.stringify(ex));
  });

  const perdu = () => {
    majEtat(false, 'simulateur fermé — nouvelle tentative dans 5 s');
    dernier = null;
    setTimeout(connecter, RETENTE_MS);
  };
  handle.on('quit', perdu);
  handle.on('close', perdu);
}

async function connecter() {
  try {
    const { recvOpen, handle } = await scOpen('CapCAVVA', SCProtocol.FSX_SP2);
    majEtat(true, 'connecté à ' + recvOpen.applicationName);
    definir(handle);
    brancher(handle);
  } catch (err) {
    majEtat(false, 'simulateur absent — nouvelle tentative dans 5 s');
    setTimeout(connecter, RETENTE_MS);
  }
}

// ------------------------------------------------------------

serveur.listen(PORT, '127.0.0.1', () => {
  console.log(`Carte  : http://127.0.0.1:${PORT}/`);
  console.log(`Flux   : http://127.0.0.1:${PORT}/flux`);
  connecter();
});
