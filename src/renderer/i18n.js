/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// i18n.js — système de traductions bilingue FR / EN.
// Repris du mécanisme de NavXpressVFR : dictionnaire TRANSLATIONS,
// langue persistée (localStorage), application via attributs data-i18n
// (textContent), data-i18n-html (innerHTML), data-i18n-placeholder, data-i18n-title.
//
// CONVENTION : toute nouvelle chaîne d'UI ajoute sa clé dans fr ET en
// (jamais de texte en dur dans le HTML — sauf noms propres).
// ============================================================

const TRANSLATIONS = {
  fr: {
    statusConnected: 'Connecté',
    statusConnecting: 'Connexion…',
    statusDisconnected: 'MSFS Déconnecté',
    btnConnect: 'Connecter MSFS2024',
    btnDisconnect: 'Déconnecter MSFS2024',
    toggleTitle: 'Changer de langue / Switch language',

    // Second bandeau de données live
    lblIcaoDep: 'ICAO départ',
    lblIcaoArr: 'ICAO arrivée',
    savePlanTooltip: 'Sauvegarder le plan de vol',
    savePlanTitle: 'Sauvegarder le plan de vol',
    savePlanErr: 'Échec de la sauvegarde : {err}',
    newPlanTooltip: 'Nouveau plan de vol',
    newPlanTitle: 'Nouveau plan de vol',
    newPlanText: 'Le plan de vol en cours sera abandonné. Continuer ?',
    newPlanConfirm: 'Nouveau plan',
    openPlanTooltip: 'Ouvrir un plan de vol',
    openPlanTitle: 'Ouvrir un plan de vol',
    openPlanErr: 'Échec de l\'ouverture : {err}',
    lblLat: 'Latitude',
    lblLon: 'Longitude',
    lblAmsl: 'Altitude MSL',

    // Menu contextuel (clic droit sur la carte)
    ctxSetDep: 'Définir comme aéroport de départ',
    ctxSetArr: 'Définir comme aéroport d\'arrivée',
    ctxSetDepPoint: 'Définir comme lieu de départ',
    ctxSetArrPoint: 'Définir comme lieu d\'arrivée',
    ctxDeleteWp: 'Supprimer ce point tournant',
    ctxSetActiveLeg: 'Rendre ce leg actif',
    ctxRangeCircle: 'Cercle de portée',
    ctxRangeCircleNavaid: 'Cercle de portée du navaid',
    ctxRangeDeleteOne: 'Supprimer ce cercle de portée',
    ctxRangeClear: 'Effacer les cercles de portée',
    rangeTitle: 'Cercle de portée',
    rangeLabel: 'Rayon (NM)',
    rangeDraw: 'Tracer',
    rangeInvalid: 'Rayon invalide.',

    // Modale d'aimantation d'un point tournant sur un aéroport / navaid proche
    snapTitle: 'Point tournant à proximité',
    snapText: 'Un {kind} est à {dist} NM : {feature}. Placer le point tournant dessus ?',
    snapAirport: 'aéroport',
    snapNavaid: 'navaid',
    snapKeep: 'Garder la position',
    snapPlace: 'Placer dessus',

    // Libellés communs aux modales
    btnClose: 'Fermer',
    btnCancel: 'Annuler',

    // {url} est remplacé par l'URL de l'API.
    apiConfigured: 'CAVVA : {url} — clé configurée ✓',
    apiMissing: 'CAVVA : {url} — ⚠ clé non configurée (cliquez sur « Clé CAVVA »).',

    // Clé CAVVA saisie dans l'UI
    btnApiKey: 'Clé CAVVA',
    apiKeyTitle: 'Clé CAVVA',
    apiKeyIntro: 'Saisissez la clé de votre compte CAVVA. Elle est enregistrée localement sur cet ordinateur et sert à récupérer le brief de la séance.',
    apiKeyLabel: 'Clé CAVVA',
    apiUrlLabel: 'URL de l\'API',
    btnSaveKey: 'Enregistrer',
    apiKeySaved: 'Clé CAVVA enregistrée ✓',
    apiKeyCleared: 'Clé CAVVA effacée.',
    apiKeyOk: 'Clé enregistrée et acceptée par le serveur ✓',
    apiKeyOkNoBrief: 'Clé acceptée ✓ — aucun brief publié pour le moment.',
    apiKeyRefused: 'Clé enregistrée, mais refusée par le serveur.',
    apiKeyUnreachable: 'Clé enregistrée, serveur injoignable — impossible de la vérifier.',
    apiKeyErr: 'Échec de l\'enregistrement : {err}',

    // Import des aéroports MSFS 2024
    menuImportAirports: 'Aéroports MSFS2024',
    msfsImportTitle: 'Importer les aéroports MSFS 2024',
    msfsImportIntro: 'Extrait toute la base d\'aéroports de MSFS 2024 via SimConnect (pistes, fréquences, hélipads). MSFS 2024 doit être lancé avec un vol en cours. L\'opération peut durer plusieurs minutes.',
    btnImport: 'Importer',
    msfsCheckChecking: 'Vérification de MSFS 2024…',
    msfsCheckRunning: 'MSFS 2024 détecté ({app}).',
    msfsCheckNotRunning: 'MSFS 2024 ne répond pas. Lancez le simulateur avec un vol en cours, puis réessayez.',
    msfsProgressTitle: 'Extraction des aéroports MSFS 2024',
    msfsPhaseConnecting: 'Connexion au simulateur…',
    msfsPhaseEnumerate: 'Énumération des aéroports… ({n})',
    msfsPhaseDetail: 'Extraction des détails (pistes, fréquences, hélipads)…',
    msfsPhaseRetry: 'Reprise des aéroports en échec…',
    msfsProgressStats: '{rate}/s · temps restant estimé {eta} · {ok} OK · {failed} échec(s)',
    msfsExtractDone: 'Extraction terminée : {n} aéroports enregistrés.',
    msfsExtractEmpty: 'Aucun aéroport extrait. Vérifiez que MSFS 2024 tourne avec un vol en cours.',
    msfsExtractError: 'Extraction échouée : {msg}',

    // Import des navaids MSFS 2024 (réutilise msfsCheck*/msfsPhaseConnecting/btnImport)
    menuImportNavaids: 'Navaids MSFS2024',
    navaidsImportTitle: 'Importer les navaids MSFS 2024',
    navaidsImportIntro: 'Reconstruit la base mondiale de navaids (VOR/NDB) de MSFS 2024 par traversance du réseau d\'airways. MSFS 2024 doit être lancé avec un vol en cours. L\'opération peut durer plusieurs minutes.',
    navaidsProgressTitle: 'Extraction des navaids MSFS 2024',
    navaidsPhaseEnumerate: 'Énumération des aéroports… ({n})',
    navaidsPhaseSeed: 'Lecture des procédures (amorçage)…',
    navaidsPhaseBfs: 'Parcours du réseau d\'airways…',
    navaidsPhaseVor: 'Détail des VOR/DME/TACAN…',
    navaidsPhaseNdb: 'Détail des NDB…',
    navaidsPhaseDisco: 'Navaids isolés (complément)…',
    navaidsProgressStats: '{nav} navaids · {wpt} waypoints parcourus',
    navaidsExtractDone: 'Extraction terminée : {n} navaids enregistrés.',
    navaidsExtractEmpty: 'Aucun navaid extrait. Vérifiez que MSFS 2024 tourne avec un vol en cours.',
    navaidsExtractError: 'Extraction échouée : {msg}',

    // Import des données d'élévation (GLOBE all10g.zip)
    menuImportElevation: 'Données d\'élévation',
    elevConfirmTitle: 'Re-télécharger les données ?',
    elevConfirmMsg: 'Les données d\'élévation semblent déjà installées (~1,8 Go). Re-télécharger l\'archive (~307 Mo) et remplacer les fichiers existants ?',
    elevConfirmBtn: 'Re-télécharger',
    elevProgressTitle: 'Import des données d\'élévation',
    elevPhaseStarting: 'Préparation…',
    elevPhaseDownloading: 'Téléchargement de all10g.zip…',
    elevPhaseExtracting: 'Extraction des tuiles (~1,8 Go)…',
    elevPhaseFlattening: 'Organisation des fichiers…',
    elevProgressDone: 'Données d\'élévation installées.',
    elevProgressDoneDir: 'Dossier : {dir}',
    elevProgressError: 'Échec de l\'import',

    // Espaces aériens (export du SIA)
    menuImportEspaces: 'Espaces aériens (SIA)',
    espTitle: 'Espaces aériens',
    espFloorMax: 'Plancher au-dessous de (ft)',
    espTestAlt: 'Altitude de test (ft)',
    espCycle: 'Cycle {date} · {n} zones tracées sur {total}',
    espNone: 'Aucun espace chargé — menu Importer.',
    espProbeTitle: 'Espaces à cet endroit',
    espProbeClose: 'Fermer',
    espNoZone: 'Aucune zone à cet endroit.',
    espHighlight: 'Cliquer pour mettre cette zone en évidence sur la carte',
    espCount: '{n} zone(s) superposée(s)',
    espCountAlt: '{n} zone(s), dont {k} à cette altitude',
    espImportTitle: 'Espaces aériens français',
    espImportIntro: 'Les espaces viennent de l\'export XML du SIA, gratuit après création d\'un compte sur son site (produit « Données aéronautiques XML », 0,00 €). Déposez le fichier XML_SIA_aaaa-mm-jj.xml dans le dossier prévu, puis convertissez-le ici.',
    espOpenFolder: 'Ouvrir le dossier',
    espPickFile: 'Choisir un fichier…',
    espConvert: 'Convertir',
    espStateLoaded: 'Chargé : cycle du {date}, {n} zones.',
    espStateStale: 'Ce cycle a {j} jours — un cycle dure 28 jours. Pensez à le renouveler.',
    espStateEmpty: 'Aucun espace n\'est chargé pour le moment.',
    espStateDropped: 'Fichier déposé : {f}',
    espStatePicked: 'Fichier choisi : {f}',
    espStateSameCycle: 'C\'est le cycle déjà converti — reconvertir ne changera rien.',
    espStateNoFile: 'Aucun fichier dans {d}',
    espProgressTitle: 'Conversion de l\'export du SIA',
    espPhaseReading: 'Lecture du XML…',
    espPhaseBuilding: 'Construction des zones…',
    espImportDone: '{n} zones converties, cycle du {date}.',
    espImportSkipped: '{n} zones ponctuelles écartées : leur étendue n\'est pas dans la donnée.',
    espImportError: 'Conversion échouée : {err}',
    layersTitle: 'Couches',
    layerAirports: 'Aéroports',
    layerHeliports: 'Héliports',
    layerSeaplanes: 'Hydrobases',
    layerNavaids: 'Navaids',
    basemapTitle: 'Fond de carte',
    followTitle: 'Suivre l\'avion',

    // Briefs des séances (calendrier téléchargé depuis CAVVA)
    briefToggle: 'Briefs des séances',
    briefTitle: 'Briefs des séances',
    briefClose: 'Masquer les briefs',
    briefRefresh: 'Actualiser depuis CAVVA',
    briefLoading: 'Récupération des briefs…',
    briefCount: '{n} séance(s) publiée(s)',
    briefFlightType: 'Type de vol',
    briefRadius: 'Rayon de départ',
    briefRadiusAround: 'autour de l\'arrivée',
    briefArr: 'Arrivée',
    briefFile: 'Fichier joint',
    briefIcaoUnknown: '{icao} est introuvable dans la base MSFS : le cercle de rayon n\'est pas tracé. Importer les aéroports (menu Importer) le résoudra, sauf si le code est incomplet.',
    briefNoCycle: 'Aucun espace aérien chargé : les zones annoncées ne peuvent pas être reconnues. Voir le menu Importer.',
    briefZonesCount: '{n} zone(s) active(s)',
    briefZonesCountUnknown: '{n} zone(s) active(s), et {k} saisie(s) non reconnue(s)',
    briefNoZone: 'Aucune zone active annoncée pour cette séance.',
    briefZoneShow: 'Cliquer pour cadrer la carte sur cette zone et la mettre en évidence',
    briefZoneAsTyped: 'saisi sur CAVVA : {txt}',
    briefZoneUnknown: 'Aucune zone du cycle chargé ne correspond à cette saisie. Le texte est reproduit tel quel.',
    briefErrNoKey: 'Aucune clé CAVVA enregistrée : les briefs sont réservés aux comptes du club.',
    briefErrUnauthorized: 'Clé CAVVA refusée par le serveur.',
    briefErrAbsent: 'Aucune séance publiée pour le moment.',
    briefErrNetwork: 'Serveur CAVVA injoignable.',
    briefErrSignature: 'Signature des briefs invalide : le contenu a été rejeté.',
    briefErrContent: 'Briefs illisibles.',

    // Panneau « Plan de vol » (tableau des legs)
    legsToggle: 'Afficher plan de vol',
    copyWpTitle: 'Copier les points tournants',
    legsClose: 'Masquer le plan de vol',
    legsTitle: 'Plan de vol',
    legsTotal: 'Distance totale',
    legsColFrom: 'Départ',
    legsColTo: 'Arrivée',
    legsColHdg: 'Cap',
    legsColAlt: 'Altitude',
    legsColDist: 'Dist.',
    legsEmpty: 'Aucun plan de vol.',
    legsDeclHint: 'Déclinaison magnétique {d}° (prise en compte dans le cap)',

    // Profil vertical (relief GLOBE le long du plan de vol)
    vertProfileToggle: 'Afficher le profil vertical',
    vertProfileClose: 'Masquer le profil vertical',
    vertProfileTitle: 'Profil vertical',
    vertProfileEmpty: 'Créez un plan de vol (départ + arrivée) pour afficher le profil vertical.',
    vertProfileNoData: 'Relief indisponible. Importez d\'abord les données d\'élévation (menu Importer → Données d\'élévation).',
    vertProfileError: 'Profil indisponible : {err}',
    vertProfileTerrain: 'Relief',
    vertProfilePlanned: 'Alt. prévue',
    vertProfileGround: 'Sol',
    vertProfilePlannedFull: 'Altitude prévue',
    vertProfileSafe: 'Alt. sécu',
    vertProfileAirspace: 'Espaces',
    vertProfileSafeFull: 'Altitude de sécurité',
    vertProfileSummit: 'Sommet route',
    vertProfileMinMargin: 'Marge mini',

    // Popup d'un lieu d'atterrissage (couche « Lieux d'atterrissage »)

    // Bannière de mise à jour (electron-updater)
    updateDownloading: 'Téléchargement de la mise à jour… {percent} %',
    updateReady: 'Mise à jour {version} prête à être installée.',
    updateRestart: 'Redémarrer et installer',

    // Modale « À propos » (bouton « ? » du header)
    btnAboutTooltip: 'À propos',
    aboutTitle: 'À propos',
    aboutTagline: 'Le poste de l\'organisateur du vol de club du mercredi soir : espaces aériens français en vectoriel, zones actives de la séance, plan de vol et suivi en direct.',
    aboutLicense: 'Ce logiciel est distribué sous licence GPL-3.0 ou ultérieure.',
    aboutSource: 'Le code source de cette application est disponible sur <a href="https://github.com/brackets-acrobat/cap-cavva" target="_blank" rel="noopener">GitHub</a>.',
    aboutCopyright: 'Copyright 2026 Cyril MILANI.',
    aboutCreditsMethod: 'L\'extraction des navaids depuis MSFS 2024 (<code>extract-navaids-msfs.js</code>) s\'inspire directement de la méthode du projet atools / Little Navmap d\'Alexander Barthel.',
  },

  en: {
    statusConnected: 'Connected',
    statusConnecting: 'Connecting…',
    statusDisconnected: 'MSFS Disconnected',
    btnConnect: 'Connect MSFS2024',
    btnDisconnect: 'Disconnect MSFS2024',
    toggleTitle: 'Changer de langue / Switch language',

    // Second live-data bar
    lblIcaoDep: 'Departure ICAO',
    lblIcaoArr: 'Arrival ICAO',
    savePlanTooltip: 'Save flight plan',
    savePlanTitle: 'Save flight plan',
    savePlanErr: 'Save failed: {err}',
    newPlanTooltip: 'New flight plan',
    newPlanTitle: 'New flight plan',
    newPlanText: 'The current flight plan will be discarded. Continue?',
    newPlanConfirm: 'New plan',
    openPlanTooltip: 'Open a flight plan',
    openPlanTitle: 'Open a flight plan',
    openPlanErr: 'Open failed: {err}',
    lblLat: 'Latitude',
    lblLon: 'Longitude',
    lblAmsl: 'Altitude MSL',

    // Map context menu (right-click)
    ctxSetDep: 'Set as departure airport',
    ctxSetArr: 'Set as arrival airport',
    ctxSetDepPoint: 'Set as departure point',
    ctxSetArrPoint: 'Set as arrival point',
    ctxDeleteWp: 'Delete this turning point',
    ctxSetActiveLeg: 'Set this leg as active',
    ctxRangeCircle: 'Range ring',
    ctxRangeCircleNavaid: 'Navaid range ring',
    ctxRangeDeleteOne: 'Delete this range ring',
    ctxRangeClear: 'Clear range rings',
    rangeTitle: 'Range ring',
    rangeLabel: 'Radius (NM)',
    rangeDraw: 'Draw',
    rangeInvalid: 'Invalid radius.',

    // Snap a turning point onto a nearby airport / navaid
    snapTitle: 'Turning point nearby',
    snapText: 'A {kind} is {dist} NM away: {feature}. Snap the turning point onto it?',
    snapAirport: 'airport',
    snapNavaid: 'navaid',
    snapKeep: 'Keep position',
    snapPlace: 'Snap onto it',

    // Labels shared by the modals
    btnClose: 'Close',
    btnCancel: 'Cancel',

    apiConfigured: 'CAVVA: {url} — key configured ✓',
    apiMissing: 'CAVVA: {url} — ⚠ key not configured (click “CAVVA key”).',

    // CAVVA key entered in the UI
    btnApiKey: 'CAVVA key',
    apiKeyTitle: 'CAVVA key',
    apiKeyIntro: 'Enter the key from your CAVVA account. It is stored locally on this computer and used to fetch the Session briefing.',
    apiKeyLabel: 'CAVVA key',
    apiUrlLabel: 'API URL',
    btnSaveKey: 'Save',
    apiKeySaved: 'CAVVA key saved ✓',
    apiKeyCleared: 'CAVVA key cleared.',
    apiKeyOk: 'Key saved and accepted by the server ✓',
    apiKeyOkNoBrief: 'Key accepted ✓ — no brief published at the moment.',
    apiKeyRefused: 'Key saved, but rejected by the server.',
    apiKeyUnreachable: 'Key saved, server unreachable — cannot verify it.',
    apiKeyErr: 'Save failed: {err}',

    // MSFS 2024 airports import
    menuImportAirports: 'MSFS2024 airports',
    msfsImportTitle: 'Import MSFS 2024 airports',
    msfsImportIntro: 'Extracts the whole MSFS 2024 airport database via SimConnect (runways, frequencies, helipads). MSFS 2024 must be running with a flight loaded. This can take several minutes.',
    btnImport: 'Import',
    msfsCheckChecking: 'Checking MSFS 2024…',
    msfsCheckRunning: 'MSFS 2024 detected ({app}).',
    msfsCheckNotRunning: 'MSFS 2024 is not responding. Launch the simulator with a flight loaded, then try again.',
    msfsProgressTitle: 'MSFS 2024 airports extraction',
    msfsPhaseConnecting: 'Connecting to the simulator…',
    msfsPhaseEnumerate: 'Enumerating airports… ({n})',
    msfsPhaseDetail: 'Extracting details (runways, frequencies, helipads)…',
    msfsPhaseRetry: 'Retrying failed airports…',
    msfsProgressStats: '{rate}/s · est. time remaining {eta} · {ok} OK · {failed} failed',
    msfsExtractDone: 'Extraction complete: {n} airports saved.',
    msfsExtractEmpty: 'No airport extracted. Make sure MSFS 2024 is running with a flight loaded.',
    msfsExtractError: 'Extraction failed: {msg}',

    // MSFS 2024 navaids import (reuses msfsCheck*/msfsPhaseConnecting/btnImport)
    menuImportNavaids: 'MSFS2024 navaids',
    navaidsImportTitle: 'Import MSFS 2024 navaids',
    navaidsImportIntro: 'Rebuilds the worldwide MSFS 2024 navaid database (VOR/NDB) by traversing the airway network. MSFS 2024 must be running with a flight loaded. This can take several minutes.',
    navaidsProgressTitle: 'MSFS 2024 navaids extraction',
    navaidsPhaseEnumerate: 'Enumerating airports… ({n})',
    navaidsPhaseSeed: 'Reading procedures (seeding)…',
    navaidsPhaseBfs: 'Traversing the airway network…',
    navaidsPhaseVor: 'VOR/DME/TACAN details…',
    navaidsPhaseNdb: 'NDB details…',
    navaidsPhaseDisco: 'Isolated navaids (extra)…',
    navaidsProgressStats: '{nav} navaids · {wpt} waypoints visited',
    navaidsExtractDone: 'Extraction complete: {n} navaids saved.',
    navaidsExtractEmpty: 'No navaid extracted. Make sure MSFS 2024 is running with a flight loaded.',
    navaidsExtractError: 'Extraction failed: {msg}',

    // Elevation data import (GLOBE all10g.zip)
    menuImportElevation: 'Elevation data',
    elevConfirmTitle: 'Re-download the data?',
    elevConfirmMsg: 'Elevation data appears to be already installed (~1.8 GB). Re-download the archive (~307 MB) and replace the existing files?',
    elevConfirmBtn: 'Re-download',
    elevProgressTitle: 'Elevation data import',
    elevPhaseStarting: 'Preparing…',
    elevPhaseDownloading: 'Downloading all10g.zip…',
    elevPhaseExtracting: 'Extracting tiles (~1.8 GB)…',
    elevPhaseFlattening: 'Organizing files…',
    elevProgressDone: 'Elevation data installed.',
    elevProgressDoneDir: 'Folder: {dir}',
    elevProgressError: 'Import failed',

    // Map layers control
    // Airspace (SIA export)
    menuImportEspaces: 'Airspace (SIA)',
    espTitle: 'Airspace',
    espFloorMax: 'Floor below (ft)',
    espTestAlt: 'Test altitude (ft)',
    espCycle: 'Cycle {date} · {n} zones drawn of {total}',
    espNone: 'No airspace loaded — Import menu.',
    espProbeTitle: 'Airspace here',
    espProbeClose: 'Close',
    espNoZone: 'No zone at this point.',
    espHighlight: 'Click to highlight this zone on the map',
    espCount: '{n} overlapping zone(s)',
    espCountAlt: '{n} zone(s), {k} at this altitude',
    espImportTitle: 'French airspace',
    espImportIntro: 'Airspace comes from the SIA XML export, free once you create an account on their site (product "Donnees aeronautiques XML", 0.00 EUR). Drop the XML_SIA_yyyy-mm-dd.xml file in the folder below, then convert it here.',
    espOpenFolder: 'Open the folder',
    espPickFile: 'Pick a file…',
    espConvert: 'Convert',
    espStateLoaded: 'Loaded: cycle of {date}, {n} zones.',
    espStateStale: 'This cycle is {j} days old — a cycle lasts 28 days. Time to refresh it.',
    espStateEmpty: 'No airspace loaded yet.',
    espStateDropped: 'File in the folder: {f}',
    espStatePicked: 'Chosen file: {f}',
    espStateSameCycle: 'That is the cycle already converted — reconverting changes nothing.',
    espStateNoFile: 'No file in {d}',
    espProgressTitle: 'Converting the SIA export',
    espPhaseReading: 'Reading the XML…',
    espPhaseBuilding: 'Building the zones…',
    espImportDone: '{n} zones converted, cycle of {date}.',
    espImportSkipped: '{n} point-only zones skipped: their extent is not in the data.',
    espImportError: 'Conversion failed: {err}',
    layersTitle: 'Layers',
    layerAirports: 'Airports',
    layerHeliports: 'Heliports',
    layerSeaplanes: 'Seaplane bases',
    layerNavaids: 'Navaids',
    basemapTitle: 'Base map',
    followTitle: 'Follow aircraft',

    // Landing-spot popup ("Landing spots" layer)
    // Flight plan panel (legs table)
    // Session briefs (calendar downloaded from CAVVA)
    briefToggle: 'Session briefs',
    briefTitle: 'Session briefs',
    briefClose: 'Hide the briefs',
    briefRefresh: 'Refresh from CAVVA',
    briefLoading: 'Fetching the briefs…',
    briefCount: '{n} published session(s)',
    briefFlightType: 'Flight type',
    briefRadius: 'Departure radius',
    briefRadiusAround: 'around the arrival',
    briefArr: 'Arrival',
    briefFile: 'Attached file',
    briefIcaoUnknown: '{icao} is not in the MSFS database: the radius circle is not drawn. Importing the airports (Import menu) will fix it, unless the code itself is incomplete.',
    briefNoCycle: 'No airspace loaded: the announced zones cannot be matched. See the Import menu.',
    briefZonesCount: '{n} active zone(s)',
    briefZonesCountUnknown: '{n} active zone(s), and {k} unrecognised entr(y/ies)',
    briefNoZone: 'No active zone announced for this session.',
    briefZoneShow: 'Click to frame the map on this zone and highlight it',
    briefZoneAsTyped: 'entered on CAVVA: {txt}',
    briefZoneUnknown: 'No zone in the loaded cycle matches this entry. The text is shown as typed.',
    briefErrNoKey: 'No CAVVA key stored: the briefs are reserved for club accounts.',
    briefErrUnauthorized: 'CAVVA key rejected by the server.',
    briefErrAbsent: 'No session published at the moment.',
    briefErrNetwork: 'CAVVA server unreachable.',
    briefErrSignature: 'Invalid brief signature: the content was rejected.',
    briefErrContent: 'Unreadable briefs.',

    legsToggle: 'Show flight plan',
    copyWpTitle: 'Copy the waypoints',
    legsClose: 'Hide flight plan',
    legsTitle: 'Flight plan',
    legsTotal: 'Total distance',
    legsColFrom: 'From',
    legsColTo: 'To',
    legsColHdg: 'Hdg',
    legsColAlt: 'Altitude',
    legsColDist: 'Dist.',
    legsEmpty: 'No flight plan.',
    legsDeclHint: 'Magnetic declination {d}° (applied to the heading)',

    // Vertical profile (GLOBE terrain along the flight plan)
    vertProfileToggle: 'Show vertical profile',
    vertProfileClose: 'Hide vertical profile',
    vertProfileTitle: 'Vertical profile',
    vertProfileEmpty: 'Create a flight plan (departure + arrival) to display the vertical profile.',
    vertProfileNoData: 'Terrain unavailable. Import the elevation data first (Import menu → Elevation data).',
    vertProfileError: 'Profile unavailable: {err}',
    vertProfileTerrain: 'Terrain',
    vertProfilePlanned: 'Planned alt.',
    vertProfileGround: 'Ground',
    vertProfilePlannedFull: 'Planned altitude',
    vertProfileSafe: 'Safe alt.',
    vertProfileAirspace: 'Airspace',
    vertProfileSafeFull: 'Safe altitude',
    vertProfileSummit: 'Route summit',
    vertProfileMinMargin: 'Min. clearance',


    // Update banner (electron-updater)
    updateDownloading: 'Downloading update… {percent}%',
    updateReady: 'Update {version} ready to install.',
    updateRestart: 'Restart and install',

    // "About" modal (header "?" button)
    btnAboutTooltip: 'About',
    aboutTitle: 'About',
    aboutTagline: 'The club-night flight organiser\'s desk: French airspace in vector form, tonight\'s active zones, flight plan and live tracking.',
    aboutLicense: 'This software is distributed under the GPL-3.0 license or later.',
    aboutSource: 'The source code of this application is available on <a href="https://github.com/brackets-acrobat/cap-cavva" target="_blank" rel="noopener">GitHub</a>.',
    aboutCopyright: 'Copyright 2026 Cyril MILANI.',
    aboutCreditsMethod: 'The navaid extraction from MSFS 2024 (<code>extract-navaids-msfs.js</code>) draws directly on the method of Alexander Barthel\'s atools / Little Navmap project.',
  },
};

// Langue active (depuis localStorage si dispo, sinon FR).
let currentLang = (typeof localStorage !== 'undefined' && localStorage.getItem('cap-lang')) || 'fr';

// Traduction d'une clé pour la langue active (repli FR, puis clé brute).
function t(key) {
  return TRANSLATIONS[currentLang][key] ?? TRANSLATIONS.fr[key] ?? key;
}

// Change la langue, persiste, et ré-applique tout le DOM statique.
function setLanguage(lang) {
  if (!TRANSLATIONS[lang]) return;
  currentLang = lang;
  if (typeof localStorage !== 'undefined') localStorage.setItem('cap-lang', lang);
  applyTranslations();
  updateToggleButton();
}

// Applique les traductions aux éléments porteurs d'un attribut data-i18n*.
function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.getAttribute('data-i18n'));
  });
  document.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.getAttribute('data-i18n-html'));
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.getAttribute('data-i18n-placeholder'));
  });
  document.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.getAttribute('data-i18n-title'));
  });
}

// Met à jour l'état visuel du toggle FR | EN.
function updateToggleButton() {
  const btn = document.getElementById('btn-lang-toggle');
  if (!btn) return;
  btn.setAttribute('data-active-lang', currentLang);
  const fr = btn.querySelector('.lang-fr');
  const en = btn.querySelector('.lang-en');
  if (fr) fr.classList.toggle('lang-active', currentLang === 'fr');
  if (en) en.classList.toggle('lang-active', currentLang === 'en');
}

// Initialise au chargement : applique la langue courante.
function initI18n() {
  applyTranslations();
  updateToggleButton();
}
