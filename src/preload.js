/*
 * Cap CAVVA
 * Copyright (C) 2026 Cyril MILANI — GPL-3.0-or-later
 */

// ============================================================
// preload.js — pont sécurisé renderer ↔ main (contextIsolation).
//
// Tout ce que le renderer peut demander au process principal passe par ici, et
// rien d'autre. Chaque abonnement renvoie sa fonction de désabonnement.
//
// Rappel hérité de NavXpressVFR : NE JAMAIS require() un fichier local ici
// sous sandbox — seuls les modules d'Electron sont disponibles.
// ============================================================

const { contextBridge, ipcRenderer } = require('electron');

function abonner(canal, cb) {
  const h = (_e, p) => cb(p);
  ipcRenderer.on(canal, h);
  return () => ipcRenderer.removeListener(canal, h);
}

contextBridge.exposeInMainWorld('cap', {
  // Configuration
  getConfig: () => ipcRenderer.invoke('app-config'),
  setApiKey: (apiKey, apiBaseUrl) => ipcRenderer.invoke('config-set-key', { apiKey, apiBaseUrl }),

  // Simulateur
  connect: () => ipcRenderer.invoke('sc-connect'),
  disconnect: () => ipcRenderer.invoke('sc-disconnect'),

  // Import des aéroports et navaids MSFS 2024
  msfsVerifierLancement: () => ipcRenderer.invoke('msfs-verifier-lancement'),
  msfsExtraireAeroports: (options) => ipcRenderer.invoke('extraire-aeroports-msfs', options),
  msfsExtraireNavaids: () => ipcRenderer.invoke('extraire-navaids-msfs'),
  onMsfsExtractProgress: (cb) => abonner('msfs-extract-progress', cb),
  onMsfsNavaidsProgress: (cb) => abonner('msfs-navaids-progress', cb),

  // Espaces aériens français (export du SIA)
  siaEtat: () => ipcRenderer.invoke('sia-etat'),
  siaEspaces: () => ipcRenderer.invoke('sia-espaces'),
  siaOuvrirDossier: () => ipcRenderer.invoke('sia-ouvrir-dossier'),
  siaChoisirFichier: () => ipcRenderer.invoke('sia-choisir-fichier'),
  siaImporter: (chemin) => ipcRenderer.invoke('sia-importer', chemin),
  onSiaProgress: (cb) => abonner('sia-progress', cb),

  // Briefs de séance (CAVVA) — le calendrier complet, en une fois
  briefsCharger: () => ipcRenderer.invoke('briefs-charger'),
  briefVerifierCle: () => ipcRenderer.invoke('brief-verifier-cle'),

  // Relief (jeu de données GLOBE) et profil vertical
  elevationExiste: () => ipcRenderer.invoke('elevation-existe'),
  importerElevation: () => ipcRenderer.invoke('importer-elevation'),
  onElevationProgress: (cb) => abonner('elevation-progress', cb),
  profilVertical: (charge) => ipcRenderer.invoke('profil-vertical', charge),

  // Données carte
  aeroportsDansBbox: (bbox) => ipcRenderer.invoke('aeroports-bbox', bbox),
  navaidsDansBbox: (bbox) => ipcRenderer.invoke('navaids-bbox', bbox),
  aeroportParCode: (code) => ipcRenderer.invoke('aeroport-par-code', code),
  featureProche: (lat, lon, rayonNm) => ipcRenderer.invoke('feature-proche', { lat, lon, rayonNm }),

  // Navigation
  declinaison: (lat, lon) => ipcRenderer.invoke('declinaison', { lat, lon }),
  sauverPlan: (charge) => ipcRenderer.invoke('sauver-plan', charge),
  ouvrirPlan: (charge) => ipcRenderer.invoke('ouvrir-plan', charge),

  // Mise à jour automatique
  installUpdate: () => ipcRenderer.invoke('update-install'),
  getUpdateState: () => ipcRenderer.invoke('update-get-state'),   // rejeu (course au démarrage)

  // Abonnements (main → renderer)
  onConfig: (cb) => abonner('app-config', cb),
  onStatus: (cb) => abonner('sc-status', cb),
  onScan: (cb) => abonner('sc-scan', cb),
  onUpdateStatus: (cb) => abonner('update-status', cb),
});
