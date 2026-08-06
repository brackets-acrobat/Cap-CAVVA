/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// sia-convert.js — export XML du SIA → GeoJSON des espaces aériens français.
//
// Source : le fichier XML_SIA_aaaa-mm-jj.xml du cycle AIRAC, publié par le
// Service de l'Information Aéronautique sous Licence Ouverte 2.0.
//
// Le modèle du SIA a trois niveaux :
//
//   Espace   l'identité        TypeEspace (R, P, D, CTR, TMA, SIV…), Nom, Territoire
//     └ Partie   le contour    une liste de points lat,lon
//         └ Volume  la tranche  plancher, plafond, classe, horaires, activité
//
// Une Partie peut porter plusieurs Volumes empilés (les TMA en couches), et un
// Espace plusieurs Parties. On produit donc UNE Feature PAR VOLUME, en lui
// donnant la géométrie de sa Partie : c'est le grain auquel une zone se lit —
// « cette surface-là, de ce plancher à ce plafond, à ces horaires ».
//
// ── Ce qui rend cette conversion facile ─────────────────────────────────────
// Le champ <Contour> décrit la zone en primitives : grc (arc de grand cercle),
// cir (cercle), cca/cwa (arcs), rhl (loxodromie), fnt (suivi de frontière). Le
// champ <Geometrie>, lui, contient DÉJÀ le résultat déroulé en points. On lit
// donc Geometrie et on ignore Contour : aucun arc à calculer, aucune frontière
// à raccorder. Un cercle de 1,6 NM y arrive en 90 points.
//
// ── Ce qu'on écarte, et pourquoi ────────────────────────────────────────────
// Près de la moitié des Parties n'ont qu'UN SEUL point, et aucun champ de rayon
// n'existe dans l'export : terrains privés, voltige, parachutage, treuillage,
// survol de sites, parcs naturels. Leur étendue réelle n'est pas dans la donnée.
// On les compte dans les métadonnées et on les écarte — les deviner serait
// inventer des limites d'espace aérien, ce qui n'est pas acceptable ici.
//
// Deux types font exception, parce que leur absence de la carte se remarquait :
//
//   PRN  parcs et réserves. Leur contour EXISTE ailleurs, publié par l'IGN, et
//        contours-proteges.js va l'y chercher par le nom et la position. Ce
//        n'est pas une limite devinée : c'est le périmètre réel du site que le
//        SIA désigne. Ce qui ne se rapproche pas reste ponctuel.
//
//   SUR  survol réglementé — sites industriels, centrales, établissements
//        pénitentiaires. Aucun contour public ne leur correspond, et ce sont
//        de vrais objets ponctuels.
//
// Les deux ressortent en Point quand le contour manque : un repère sur la carte
// dit « il y a une règle ici » sans prétendre en dessiner l'étendue. Rien
// d'autre ne change de statut — voltige, parachutage et terrains restent
// écartés.
//
// ── Les altitudes ───────────────────────────────────────────────────────────
// Les limites sont référencées explicitement, et chaque référence correspond à
// une SimVar que le simulateur fournit telle quelle :
//
//   SFC / ft ASFC  → PLANE ALT ABOVE GROUND   (hauteur-sol)
//   ft AMSL        → PLANE ALTITUDE           (altitude vraie)
//   FL             → PRESSURE ALTITUDE        (calage standard)
//
// Rien à convertir, pas de QNH à appliquer. On recopie donc la valeur ET sa
// référence, sans les mélanger.
// ============================================================

const fs = require('fs');
const path = require('path');
const sax = require('sax');

const { dossierDonnees } = require('./config');
const contoursProteges = require('./contours-proteges');

const FICHIER_SORTIE = 'espaces-france.geojson';

// Les seuls types dont une Partie ponctuelle est conservée : les parcs et
// réserves (PRN), pour lesquels un contour peut être retrouvé, et le survol
// réglementé (SUR), qui désigne de vrais points.
const TYPES_PONCTUELS = new Set(['PRN', 'SUR']);

// Métropole + Corse. L'outre-mer est dans le même export, sous d'autres
// territoires ([SO] Guyane, [FM] Mayotte, [TF] Terres australes…).
const TERRITOIRE_METROPOLE = '[LF]';

// Un contour doit fermer une surface. En deçà de trois points, ce n'est pas une
// zone mais un lieu.
const POINTS_MINIMUM = 3;

function cheminSortie() { return path.join(dossierDonnees(), FICHIER_SORTIE); }

// ------------------------------------------------------------
// Lecture des points
// ------------------------------------------------------------

// <Geometrie> donne une ligne « lat,lon » par point. GeoJSON attend [lon, lat],
// et un anneau fermé (premier point répété en dernier).
function anneauDepuisGeometrie(texte) {
  if (!texte) return null;
  const anneau = [];
  for (const ligne of texte.split('\n')) {
    const s = ligne.trim();
    if (!s) continue;
    const virgule = s.indexOf(',');
    if (virgule < 0) continue;
    const lat = parseFloat(s.slice(0, virgule));
    const lon = parseFloat(s.slice(virgule + 1));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    anneau.push([lon, lat]);
  }
  if (anneau.length < POINTS_MINIMUM) return null;

  const premier = anneau[0], dernier = anneau[anneau.length - 1];
  if (premier[0] !== dernier[0] || premier[1] !== dernier[1]) anneau.push([premier[0], premier[1]]);
  return anneau;
}

// Le repère d'une Partie ponctuelle, en [lon, lat]. Le SIA l'arrondit souvent à
// la minute : c'est un repère, pas un centroïde, et sûrement pas un centre de
// cercle — d'où la tolérance de contours-proteges.js.
function pointDepuisGeometrie(texte) {
  if (!texte) return null;
  for (const ligne of String(texte).split('\n')) {
    const s = ligne.trim();
    const virgule = s.indexOf(',');
    if (virgule < 0) continue;
    const lat = parseFloat(s.slice(0, virgule));
    const lon = parseFloat(s.slice(virgule + 1));
    if (Number.isFinite(lat) && Number.isFinite(lon)) return [lon, lat];
  }
  return null;
}

// ------------------------------------------------------------
// Limites verticales
// ------------------------------------------------------------

// Normalise l'unité du SIA en une référence exploitable côté carte et côté vol.
// 'SFC' seul (plancher au sol) est ramené à la hauteur-sol, valeur 0.
function reference(unite) {
  const u = String(unite || '').trim();
  if (u === 'FL') return 'FL';
  if (u === 'SFC' || u === 'ft ASFC') return 'ASFC';
  if (u === 'ft AMSL') return 'AMSL';
  return u || null;   // inconnu : conservé tel quel plutôt que deviné
}

function nombre(txt) {
  const v = parseFloat(String(txt == null ? '' : txt).trim());
  return Number.isFinite(v) ? v : null;
}

// ------------------------------------------------------------
// Analyse du fichier
// ------------------------------------------------------------

// Champs recopiés tels quels depuis <Volume>.
const CHAMPS_VOLUME = new Set([
  'Sequence', 'Plancher', 'PlancherRefUnite', 'Plafond', 'PlafondRefUnite',
  'Classe', 'HorCode', 'HorTxt', 'Activite', 'Remarque', 'Rtba',
]);
const CHAMPS_ESPACE = new Set(['TypeEspace', 'Nom']);
const CHAMPS_PARTIE = new Set(['NomUsuel', 'NomPartie', 'Geometrie']);

// Lit le XML en flux et renvoie { situation, espaces, parties, volumes }.
// Le fichier est en ISO-8859-1 : Buffer.toString('latin1') le décode exactement,
// et l'encodage étant sur un seul octet, découper en morceaux ne casse aucun
// caractère.
function analyser(cheminXml, onProgress) {
  return new Promise((resolve, reject) => {
    const taille = fs.statSync(cheminXml).size;
    let lus = 0, dernierPourcent = -1;

    const espaces = new Map();   // pk → { type, nom, territoire }
    const parties = new Map();   // pk → { espacePk, nomUsuel, anneau }
    const volumes = [];          // { partiePk, … }
    let situation = {};

    const parseur = sax.createStream(true, { trim: false, position: false });
    const pile = [];
    let courant = null;      // objet Espace / Partie / Volume en cours
    let genre = null;        // 'espace' | 'partie' | 'volume'
    let champ = null;        // nom de la balise feuille en cours
    let tampon = '';

    parseur.on('opentag', (n) => {
      pile.push(n.name);
      const p = pile.length;

      if (n.name === 'Situation' && p === 2) {
        situation = { pubDate: n.attributes.pubDate, effDate: n.attributes.effDate };
        return;
      }
      if (p === 4) {   // SiaExport > Situation > XxxS > Xxx
        const section = pile[2];
        if (section === 'EspaceS' && n.name === 'Espace') { genre = 'espace'; courant = { pk: n.attributes.pk }; }
        else if (section === 'PartieS' && n.name === 'Partie') { genre = 'partie'; courant = { pk: n.attributes.pk }; }
        else if (section === 'VolumeS' && n.name === 'Volume') { genre = 'volume'; courant = {}; }
        else { genre = null; courant = null; }
        return;
      }
      if (p === 5 && courant) {
        // Les renvois entre niveaux sont des balises vides porteuses d'attributs.
        if (genre === 'espace' && n.name === 'Territoire') courant.territoire = n.attributes.lk;
        else if (genre === 'partie' && n.name === 'Espace') courant.espacePk = n.attributes.pk;
        else if (genre === 'volume' && n.name === 'Partie') courant.partiePk = n.attributes.pk;
        champ = n.name;
        tampon = '';
      }
    });

    parseur.on('text', (t) => { if (champ) tampon += t; });
    parseur.on('cdata', (t) => { if (champ) tampon += t; });

    parseur.on('closetag', (nom) => {
      const p = pile.length;

      if (p === 5 && courant && nom === champ) {
        if (genre === 'espace' && CHAMPS_ESPACE.has(nom)) courant[nom] = tampon.trim();
        else if (genre === 'partie' && CHAMPS_PARTIE.has(nom)) courant[nom] = tampon;
        else if (genre === 'volume' && CHAMPS_VOLUME.has(nom)) courant[nom] = tampon.trim();
        champ = null; tampon = '';
      } else if (p === 4 && courant) {
        if (genre === 'espace') {
          espaces.set(courant.pk, {
            type: courant.TypeEspace || null,
            nom: courant.Nom || null,
            territoire: courant.territoire || null,
          });
        } else if (genre === 'partie') {
          const anneau = anneauDepuisGeometrie(courant.Geometrie);
          parties.set(courant.pk, {
            espacePk: courant.espacePk || null,
            nomUsuel: (courant.NomUsuel || '').trim() || null,
            anneau,
            // Gardé seulement quand il n'y a pas de contour : c'est ce repère
            // qui permettra de retrouver un parc ou de poser un point.
            point: anneau ? null : pointDepuisGeometrie(courant.Geometrie),
          });
        } else if (genre === 'volume' && courant.partiePk) {
          volumes.push(courant);
        }
        courant = null; genre = null;
      }
      pile.pop();
    });

    parseur.on('error', (e) => { parseur._parser.error = null; reject(e); });
    parseur.on('end', () => resolve({ situation, espaces, parties, volumes }));

    const flux = fs.createReadStream(cheminXml);
    flux.on('error', reject);
    flux.on('data', (bloc) => {
      lus += bloc.length;
      if (onProgress) {
        const pct = Math.floor((lus / taille) * 100);
        if (pct !== dernierPourcent) { dernierPourcent = pct; onProgress({ type: 'lecture', percent: pct }); }
      }
      parseur.write(bloc.toString('latin1'));
    });
    flux.on('end', () => parseur.end());
  });
}

// ------------------------------------------------------------
// Construction du GeoJSON
// ------------------------------------------------------------

// Géométrie d'une Partie ponctuelle de type PRN ou SUR, et ce qu'il faut en
// dire. Le résultat est mémorisé par Partie : un parc porte souvent plusieurs
// Volumes, et la recherche de contour ne doit se faire qu'une fois.
function geometriePonctuelle(partie, type, memo) {
  if (memo.has(partie)) return memo.get(partie);

  const [lon, lat] = partie.point;
  let res = { geometry: { type: 'Point', coordinates: [lon, lat] }, contour: null };

  if (type === 'PRN') {
    const trouve = contoursProteges.chercher(partie.nomUsuel, lat, lon);
    if (trouve) {
      res = {
        geometry: trouve.poly.length === 1
          ? { type: 'Polygon', coordinates: trouve.poly[0] }
          : { type: 'MultiPolygon', coordinates: trouve.poly },
        contour: {
          source: 'IGN BD TOPO',
          nom: trouve.nomSource,
          genre: trouve.genre,
          ecartM: Math.round(trouve.distanceM),
        },
      };
    }
  }

  memo.set(partie, res);
  return res;
}

function construire({ situation, espaces, parties, volumes }) {
  const features = [];
  const parType = {};
  let ponctuelles = 0, horsMetropole = 0, orphelines = 0;
  let contoursTrouves = 0, restesPonctuelles = 0;

  // Les Parties écartées sont comptées une seule fois, pas une fois par Volume.
  const partiesVues = new Set();
  const memoContour = new Map();

  for (const v of volumes) {
    const partie = parties.get(v.partiePk);
    if (!partie) { orphelines += 1; continue; }
    const espace = partie.espacePk ? espaces.get(partie.espacePk) : null;
    if (!espace) { orphelines += 1; continue; }

    const nouvelle = !partiesVues.has(v.partiePk);
    partiesVues.add(v.partiePk);

    if (espace.territoire !== TERRITOIRE_METROPOLE) { if (nouvelle) horsMetropole += 1; continue; }

    const type = espace.type || 'other';

    let geometry = null, contour = null;
    if (partie.anneau) {
      geometry = { type: 'Polygon', coordinates: [partie.anneau] };
    } else if (TYPES_PONCTUELS.has(type) && partie.point) {
      const g = geometriePonctuelle(partie, type, memoContour);
      geometry = g.geometry;
      contour = g.contour;
      if (nouvelle) {
        if (contour) contoursTrouves += 1; else restesPonctuelles += 1;
      }
    } else {
      if (nouvelle) ponctuelles += 1;
      continue;
    }

    parType[type] = (parType[type] || 0) + 1;

    features.push({
      type: 'Feature',
      geometry,
      properties: {
        // Clé stable, contrat avec CAVVA pour désigner une zone active.
        cle: type + '|' + (espace.nom || ''),
        type,
        nom: espace.nom || null,
        nomUsuel: partie.nomUsuel,
        classe: v.Classe || null,
        plancher: nombre(v.Plancher),
        plancherRef: reference(v.PlancherRefUnite),
        plafond: nombre(v.Plafond),
        plafondRef: reference(v.PlafondRefUnite),
        horCode: v.HorCode || null,
        horTxt: v.HorTxt || null,
        activite: v.Activite || null,
        remarque: v.Remarque || null,
        rtba: v.Rtba != null,
        // Le contour ne vient pas du SIA : la carte doit pouvoir le dire.
        contour,
        // Aucune étendue connue — la carte pose un repère, pas une surface.
        ponctuel: geometry.type === 'Point' || undefined,
      },
    });
  }

  // Les zones les plus basses tracées en dernier : elles passent au-dessus des
  // grandes TMA et restent cliquables sous le curseur.
  features.sort((a, b) => hauteurTri(b.properties) - hauteurTri(a.properties));

  return {
    type: 'FeatureCollection',
    meta: {
      source: 'SIA — export XML_SIA, Licence Ouverte 2.0',
      effDate: situation.effDate || null,
      pubDate: situation.pubDate || null,
      converti: new Date().toISOString(),
      zones: features.length,
      parType,
      ecartees: { ponctuelles, horsMetropole, orphelines },
      // Ce que les parcs et le survol réglementé ont donné, et d'où viennent
      // les contours ajoutés : le bandeau de la carte doit pouvoir le citer.
      contours: {
        trouves: contoursTrouves,
        ponctuelles: restesPonctuelles,
        bibliotheque: contoursProteges.etat().meta || null,
      },
    },
    features,
  };
}

// Hauteur approximative du plancher, pour l'ordre de tracé seulement. Les trois
// références sont ici mélangées volontairement : il ne s'agit que d'empiler des
// polygones à l'écran, pas de juger si l'avion est dedans.
function hauteurTri(p) {
  if (p.plancher == null) return 0;
  return p.plancherRef === 'FL' ? p.plancher * 100 : p.plancher;
}

// ------------------------------------------------------------

// Convertit `cheminXml` et écrit le GeoJSON dans le dossier de données.
async function convertir(cheminXml, onProgress = () => {}) {
  onProgress({ type: 'debut', fichier: path.basename(cheminXml) });

  const brut = await analyser(cheminXml, onProgress);
  onProgress({ type: 'construction' });

  const geojson = construire(brut);
  if (!geojson.features.length) {
    throw new Error('Aucune zone en métropole : le fichier ne ressemble pas à un export XML_SIA.');
  }

  const sortie = cheminSortie();
  fs.mkdirSync(path.dirname(sortie), { recursive: true });
  fs.writeFileSync(sortie, JSON.stringify(geojson), 'utf-8');

  onProgress({ type: 'termine', meta: geojson.meta, fichier: sortie });
  return { ok: true, meta: geojson.meta, fichier: sortie };
}

module.exports = { convertir, cheminSortie, FICHIER_SORTIE };
