// assets/js/app.js
// ------------------------------------------------------------
// Fichier commun UI + helpers. NE PAS ré-initialiser Firebase ici.
// ------------------------------------------------------------

import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ============= AUTO-LOGOUT après 5h d'inactivité ============= */
const INACTIVITY_LIMIT = 5 * 60 * 60 * 1000; // 5 heures en millisecondes
let inactivityTimer = null;

function resetInactivityTimer() {
  // Annule le timer précédent et en recrée un nouveau
  clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(async () => {
    const u = auth.currentUser;
    if (u) {
      sessionStorage.removeItem(`isAdmin:${u.uid}`);
      await signOut(auth);
    }
    window.location.href = 'login.html';
  }, INACTIVITY_LIMIT);
}

function startInactivityWatcher() {
  // Ces événements réinitialisent le compteur à chaque action utilisateur
  ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll', 'click'].forEach(event => {
    window.addEventListener(event, resetInactivityTimer, { passive: true });
  });
  resetInactivityTimer(); // Démarre le premier timer
}

function stopInactivityWatcher() {
  clearTimeout(inactivityTimer);
  ['mousemove', 'keydown', 'mousedown', 'touchstart', 'scroll', 'click'].forEach(event => {
    window.removeEventListener(event, resetInactivityTimer);
  });
}

/* ============= Utilitaires DOM ============= */
function $(id){ return document.getElementById(id); }
function setText(el, text){ if (el) el.textContent = text ?? ''; }
function show(el, yes = true){ if (el) el.classList.toggle('d-none', !yes); }

/* ============= Références ============= */
const elUser        = $('user-display');
const btnLogin      = $('btn-login');
const btnLogout     = $('btn-logout');
const navAdmin      = $('nav-admin');
const navStats      = $('nav-stats');
const navStatsTech  = $('nav-stats-tech');
const navUsers      = $('nav-users');
const avatar        = $('avatar');
const badge         = $('badge-admin');

/* ============= Helpers exportés ============= */
export function badgeForStatus(status) {
  const map = { 'Ouvert':'secondary', 'En cours':'primary', 'En attente':'warning', 'Résolu':'success', 'Fermé':'dark' };
  return `<span class="badge text-bg-${map[status]||'secondary'} badge-status">${status}</span>`;
}
export function badgeForPriority(p) {
  const map = { 'Faible':'secondary', 'Normal':'info', 'Haute':'warning', 'Critique':'danger' };
  return `<span class="badge text-bg-${map[p]||'info'}">${p}</span>`;
}
export function formatDate(ts) {
  try {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('fr-FR');
  } catch { return ''; }
}
export function toast(message) {
  const body = $('toast-body'); if (body) body.textContent = message ?? '';
  const el = $('toast');
  if (el && window.bootstrap?.Toast) {
    new bootstrap.Toast(el).show();
  } else {
    console.log('[toast]', message);
  }
}
export function requireAuth(redirect = true) {
  return new Promise((resolve) => {
    const unsub = onAuthStateChanged(auth, (user) => {
      unsub();
      if (!user && redirect) window.location.href = 'login.html';
      resolve(user);
    });
  });
}

/* ============= Détection Admin ============= */
async function isUserAdmin(uid) {
  try {
    const snap = await getDoc(doc(db, 'admins', uid));
    return snap.exists();
  } catch (e) {
    console.error('[app] admin check failed:', e);
    return false;
  }
}

function setAdminUI(isAdmin) {
  show(navAdmin, !!isAdmin);
  if (navStats)     show(navStats, !!isAdmin);
  if (navStatsTech) show(navStatsTech, !!isAdmin);
  if (navUsers)     show(navUsers, !!isAdmin);
  if (badge)        badge.classList.toggle('d-none', !isAdmin);
  window.__isAdmin = !!isAdmin;
}

/* ============= Wiring Navbar / Badge ============= */
onAuthStateChanged(auth, async (user) => {
  setText(elUser, '');
  show(btnLogin, true);
  show(btnLogout, false);
  show(navAdmin, false);
  if (navStats)     show(navStats, false);
  if (navStatsTech) show(navStatsTech, false);
  if (navUsers)     show(navUsers, false);
  show(avatar, false);
  if (badge) badge.classList.add('d-none');
  window.__isAdmin = false;

  if (!user) {
    stopInactivityWatcher(); // ← Arrête le timer si déconnecté
    return;
  }

  // Identité
  const label = user.email || user.displayName || user.uid;
  setText(elUser, label);
  show(btnLogin, false);
  show(btnLogout, true);

  // Avatar
  if (avatar) {
    const initial = (label?.trim()?.[0] || 'U').toUpperCase();
    avatar.textContent = initial;
    show(avatar, true);
  }

  // Rôle admin
  let isAdmin = false;
  try {
    const key = `isAdmin:${user.uid}`;
    const cached = sessionStorage.getItem(key);
    if (cached === '1') {
      isAdmin = true;
    } else if (cached === '0') {
      isAdmin = false;
    } else {
      isAdmin = await isUserAdmin(user.uid);
      sessionStorage.setItem(key, isAdmin ? '1' : '0');
    }
  } catch {
    isAdmin = await isUserAdmin(user.uid);
  }

  setAdminUI(isAdmin);
  startInactivityWatcher(); // ← Démarre le timer d'inactivité une fois connecté
});

/* ============= Déconnexion manuelle ============= */
if (btnLogout) {
  btnLogout.addEventListener('click', async () => {
    try {
      stopInactivityWatcher(); // ← Nettoie le timer au logout manuel
      const u = auth.currentUser;
      if (u) sessionStorage.removeItem(`isAdmin:${u.uid}`);
      await signOut(auth);
    } finally {
      window.location.href = 'login.html';
    }
  });
}
