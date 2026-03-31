// assets/js/session-guard.js

import { auth } from './firebase-init.js';
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// --- Config ---
const INACTIVITY_MAX_MS = 60 * 60 * 1000; // 1 heure
const CHECK_INTERVAL_MS = 30 * 1000;       // vérification toutes les 30s
const STORAGE_KEY = 'lastActivity';

// --- Met à jour le timestamp d'activité ---
function recordActivity() {
  localStorage.setItem(STORAGE_KEY, Date.now().toString());
}

// --- Déconnexion forcée ---
async function forceLogout() {
  try {
    await signOut(auth);
  } catch (e) {
    console.error('[session] signOut error:', e);
  }
  localStorage.removeItem(STORAGE_KEY);
  alert('Session expirée après 1 heure d\'inactivité.');
  window.location.replace('login.html');
}

// --- Vérifie si la session a expiré ---
function checkInactivity() {
  const last = parseInt(localStorage.getItem(STORAGE_KEY), 10);
  if (!last) return;

  if (Date.now() - last >= INACTIVITY_MAX_MS) {
    forceLogout();
  }
}

// --- Initialisation ---
recordActivity();

// Écoute les interactions utilisateur
['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt => {
  document.addEventListener(evt, recordActivity, { passive: true });
});

// Vérification périodique
setInterval(checkInactivity, CHECK_INTERVAL_MS);

// Au retour d'un onglet inactif ou sortie de veille
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    checkInactivity();
  }
});
