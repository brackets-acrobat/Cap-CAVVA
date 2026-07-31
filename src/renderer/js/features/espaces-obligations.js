/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// espaces-obligations.js — nomenclature du SIA, familles d'affichage, et
// traduction d'une zone en OBLIGATION.
//
// Tracer une zone ne sert à rien si le pilote doit encore se souvenir de ce
// qu'elle impose. Ce fichier fait le pont : type de zone et classe OACI d'un
// côté, « clairance obligatoire » ou « pénétration interdite » de l'autre.
//
// Repris de la page d'évaluation qui a servi à juger la donnée, avec la
// nomenclature openAIP remplacée par celle du SIA (des sigles, pas des codes).
// ============================================================

// Libellés des TypeEspace rencontrés dans l'export français.
const ESPACE_LIBELLES = {
  R: 'Zone réglementée', P: 'Zone interdite', D: 'Zone dangereuse',
  CTR: 'CTR', MCTR: 'CTR militaire', TMA: 'TMA', CTA: 'CTA', LTA: 'LTA', UTA: 'UTA',
  CTL: 'Secteur de contrôle', FIR: 'FIR', UIR: 'UIR', UAC: 'UAC', ACC: 'Secteur ACC',
  OCA: 'Espace océanique', FRA: 'Espace à route libre', FBZ: 'Zone tampon',
  SIV: 'Secteur d\'information de vol', RMZ: 'RMZ', TMZ: 'TMZ', 'RMZ-TMZ': 'RMZ + TMZ',
  TRA: 'Zone de travail militaire', CBA: 'Zone transfrontalière',
  PRN: 'Parc ou réserve', SUR: 'Survol réglementé',
  Aer: 'Aérodrome', Pje: 'Parachutage', Vol: 'Voltige',
  TrVL: 'Treuillage vol libre', TrPla: 'Treuillage planeur', TrPVL: 'Treuillage',
  AP: 'Zone d\'activité', Bal: 'Ballon captif', other: 'Autre',
};

// Familles d'affichage.
//
// LES COULEURS SUIVENT LA CONVENTION ÉCRITE DU SIA, PAS UNE PALETTE OFFICIELLE :
// il n'en existe pas. Le « Recueil de critères cartographiques » v2.2 ne donne
// aucune valeur par type d'espace — sa table des couleurs (annexe 2) porte sur
// la topographie, et son chapitre « Carte 1/500 000 » est marqué « Réservé ».
// Ce qu'il prescrit est qualitatif :
//   • espaces contrôlés (CTR, TMA, CTA) → bleu, contour fin ;
//   • zones interdites, réglementées ou dangereuses → rouge, aire hachurée ;
//   • RTBA → rouge pointillé hachuré ; ZIT → rouge quadrillé.
// Les SIV sont en vert sur la carte OACI (relevé sur la carte, pas dans le
// recueil, qui renvoie à l'arrêté du 6 juillet 2018).
//
// Le rouge et le brun sont repris de la table du recueil, relevés dans son
// image. Attention : ce scan de 2009 est décalé en couleur — son échantillon
// « MAGENTA » se mesure à #511A15, un bordeaux. Il sert de repère de teinte,
// jamais de référence chiffrée ; les valeurs ci-dessous restent un choix.
//
// « Parcs et survol » passe du vert franc à l'olive (teinte des régions boisées
// du recueil) pour laisser le vert aux SIV sans les rendre confusables : mesuré
// en CIEDE2000, l'écart le plus faible de la palette reste ΔE 15,9, entre CTR
// et TMA — voulu, ce sont deux espaces contrôlés.
//
// Les familles « haute altitude » sont éteintes par défaut : au-dessus du
// FL 145, rien ne concerne un vol de club, et les allumer noie la carte sous
// 600 polygones.
const ESPACE_FAMILLES = [
  { id: 'rpd',    nom: 'R / P / D',                types: ['R', 'P', 'D'],                    couleur: '#ef3027', on: true },
  { id: 'ctr',    nom: 'CTR',                      types: ['CTR', 'MCTR'],                    couleur: '#1f6feb', on: true },
  { id: 'tma',    nom: 'TMA',                      types: ['TMA'],                            couleur: '#5a8fd6', on: true },
  { id: 'mil',    nom: 'Militaire (TRA, CBA)',     types: ['TRA', 'CBA'],                     couleur: '#8a6d3b', on: true },
  { id: 'radio',  nom: 'RMZ / TMZ',                types: ['RMZ', 'TMZ', 'RMZ-TMZ'],          couleur: '#6b7b8c', on: true },
  { id: 'parc',   nom: 'Parcs et survol',          types: ['PRN', 'SUR'],                     couleur: '#8a8f2e', on: true },
  { id: 'sport',  nom: 'Voltige, parachutage',     types: ['Vol', 'Pje', 'TrVL', 'TrPla', 'TrPVL', 'AP', 'Bal', 'Aer'], couleur: '#8e44ad', on: true },
  { id: 'siv',    nom: 'SIV',                      types: ['SIV'],                            couleur: '#1f9d55', on: false },
  { id: 'haut',   nom: 'Haute altitude',           types: ['CTA', 'LTA', 'UTA', 'CTL', 'FIR', 'UIR', 'UAC', 'ACC', 'OCA', 'FRA', 'FBZ', 'other'], couleur: '#444c56', on: false },
];

const familleDuType = {};
ESPACE_FAMILLES.forEach((f) => f.types.forEach((t) => { familleDuType[t] = f; }));

function familleDeZone(p) { return familleDuType[p.type] || null; }

// ------------------------------------------------------------
// Limites verticales
// ------------------------------------------------------------

// Écriture lisible d'une limite, référence comprise. C'est la référence qui
// porte le sens : 800 ASFC et 800 AMSL ne se comparent pas à la même chose.
function limiteTexte(valeur, ref) {
  if (valeur == null) return '?';
  if (ref === 'FL') return 'FL ' + valeur;
  if (ref === 'ASFC') return valeur === 0 ? 'SFC' : valeur + ' ft ASFC';
  if (ref === 'AMSL') return valeur + ' ft AMSL';
  return valeur + (ref ? ' ' + ref : '');
}

// L'altitude à comparer, selon la référence de la limite. Le contexte porte les
// trois que le simulateur fournit ; sans simulateur, l'interface les confond en
// une seule valeur de test, et c'est dit à l'utilisateur.
function altitudeSelon(ref, ctx) {
  if (!ctx) return null;
  if (ref === 'ASFC') return ctx.aglFt;
  if (ref === 'FL') return ctx.stdFt;
  return ctx.amslFt;
}

// L'altitude du contexte traverse-t-elle la tranche de cette zone ?
// Sans contexte (aucune altitude connue), on répond oui : mieux vaut montrer
// une zone de trop que d'en cacher une.
function traverseZone(p, ctx) {
  if (!ctx) return true;
  const bas = altitudeSelon(p.plancherRef, ctx);
  if (p.plancher != null && bas != null && bas < p.plancher) return false;
  const haut = altitudeSelon(p.plafondRef, ctx);
  if (p.plafond != null && haut != null && haut > p.plafond) return false;
  return true;
}

// Plancher ramené en pieds pour le filtre d'affichage seulement. Les trois
// références y sont volontairement mélangées : il ne s'agit que de masquer ce
// qui est trop haut pour concerner un vol de club, pas de juger une pénétration.
function plancherApproxFt(p) {
  if (p.plancher == null) return 0;
  return p.plancherRef === 'FL' ? p.plancher * 100 : p.plancher;
}

// ------------------------------------------------------------
// Obligations
// ------------------------------------------------------------

const CLASSE_CONTROLEE = new Set(['A', 'B', 'C', 'D']);

// Ce que la zone impose, en clair. Une entrée par obligation : { t, d }.
function obligationsZone(p) {
  const out = [];

  if (p.type === 'P') out.push({ t: 'INTERDIT', d: 'Zone interdite : pénétration interdite.' });
  if (p.type === 'R') out.push({ t: 'AUTORISATION', d: 'Zone réglementée : pénétration soumise à autorisation.' });
  if (p.type === 'D') out.push({ t: 'DANGER', d: 'Zone dangereuse : traversée déconseillée.' });

  // La classe A se traite AVANT les autres classes contrôlées, et à part : le
  // VFR n'y est pas soumis à clairance, il y est interdit. Annoncer « clairance
  // obligatoire » laisserait croire qu'il suffit de demander pour passer — la
  // seule erreur de ce fichier qui pousse dans le mauvais sens. Cap CAVVA est
  // un outil de vol à vue : 13 zones sont concernées dans l'export français.
  if (p.classe === 'A') {
    out.push({ t: 'VFR INTERDIT', d: 'Classe A : VFR interdit, aucune clairance ne l\'autorise.' });
  } else if (p.classe && CLASSE_CONTROLEE.has(p.classe)) {
    out.push({ t: 'CLAIRANCE', d: `Classe ${p.classe} : clairance obligatoire avant pénétration.` });
  } else if (p.classe === 'E') {
    out.push({ t: 'RADIO', d: 'Classe E : contact radio recommandé.' });
  }

  if (p.type === 'CTR' || p.type === 'MCTR') out.push({ t: 'RADIO', d: 'CTR : contact obligatoire avant pénétration.' });
  if (p.type === 'RMZ' || p.type === 'RMZ-TMZ') out.push({ t: 'RADIO', d: 'RMZ : radio obligatoire.' });
  if (p.type === 'TMZ' || p.type === 'RMZ-TMZ') out.push({ t: 'XPDR', d: 'TMZ : transpondeur obligatoire.' });
  if (p.type === 'PRN' || p.type === 'SUR') out.push({ t: 'SURVOL', d: 'Hauteur minimale de survol imposée.' });
  if (p.type === 'Pje') out.push({ t: 'PARACHUTAGE', d: 'Activité de parachutage.' });
  if (p.type === 'Vol') out.push({ t: 'VOLTIGE', d: 'Activité de voltige.' });
  if (p.rtba) out.push({ t: 'RTBA', d: 'Réseau très basse altitude : consulter l\'AZBA du jour.' });

  // Le régime horaire vient de la donnée elle-même, pas d'une supposition.
  if (p.horCode === 'NOTAM') out.push({ t: 'NOTAM', d: 'Activation par NOTAM.' });
  else if (p.horCode === 'HX') out.push({ t: 'HX', d: 'Horaires non déterminés.' });
  else if (p.horCode === 'H24') out.push({ t: 'H24', d: 'Active en permanence.' });
  else if (p.horCode === 'HJ') out.push({ t: 'HJ', d: 'Active de jour.' });
  else if (p.horCode === 'HN') out.push({ t: 'HN', d: 'Active de nuit.' });
  else if (p.horCode === 'HO') out.push({ t: 'HO', d: 'Active sur demande.' });

  return out;
}

// Une obligation bloquante mérite du rouge, une information du bleu.
function tonObligation(t) {
  if (t === 'INTERDIT' || t === 'VFR INTERDIT' || t === 'AUTORISATION' || t === 'DANGER' || t === 'CLAIRANCE') return 'dur';
  if (t === 'H24' || t === 'HJ' || t === 'HN' || t === 'HO' || t === 'HX' || t === 'NOTAM') return 'horaire';
  return 'info';
}
