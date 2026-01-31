// assets/js/app.js
// ------------------------------------------------------------
// Fichier commun UI + helpers. NE PAS ré-initialiser Firebase ici.
// ------------------------------------------------------------

import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* ============= Utilitaires DOM ============= */
function $(id){ return document.getElementById(id); }
function setText(el, text){ if (el) el.textContent = text ?? ''; }
function show(el, yes = true){ if (el) el.classList.toggle('d-none', !yes); }

/* ============= Références (si absentes sur la page, le code ignore) ============= */
const elUser    = $('user-display');
const btnLogin  = $('btn-login');
const btnLogout = $('btn-logout');
const navAdmin  = $('nav-admin');   // <li id="nav-admin" class="d-none">...</li>
const navStats  = $('nav-stats');   // <li id="nav-stats" class="d-none">...</li> (optionnel)
const avatar    = $('avatar');      // <div id="avatar" class="avatar-circle d-none"></div>
const badge     = $('badge-admin'); // <span id="badge-admin" class="badge ... d-none">Admin</span>

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
    // Fallback console si pas de toast dans la page
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

/* ============= Détection Admin (via /admins/{uid}) ============= */
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
  // Affiche/masque : lien "Administration", lien "Statistiques" et badge
  show(navAdmin, !!isAdmin);
  if (navStats) show(navStats, !!isAdmin);
  if (badge)    badge.classList.toggle('d-none', !isAdmin);

  // Expose un flag global si certaines pages veulent conditionner l’UI côté client
  window.__isAdmin = !!isAdmin;
}

/* ============= Wiring Navbar / Badge ============= */
onAuthStateChanged(auth, async (user) => {
  // État par défaut (déconnecté)
  setText(elUser, '');
  show(btnLogin, true);
  show(btnLogout, false);
  show(navAdmin, false);
  if (navStats) show(navStats, false);
  show(avatar, false);
  if (badge) badge.classList.add('d-none');
  window.__isAdmin = false;

  if (!user) return;

  // Identité
  const label = user.email || user.displayName || user.uid;
  setText(elUser, label);
  show(btnLogin, false);
  show(btnLogout, true);

  // Avatar (initiale)
  if (avatar) {
    const initial = (label?.trim()?.[0] || 'U').toUpperCase();
    avatar.textContent = initial;
    show(avatar, true);
  }

  // Rôle admin (avec cache sessionStorage)
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
    // Si sessionStorage est indisponible (navigateur strict), on relit Firestore
    isAdmin = await isUserAdmin(user.uid);
  }

  setAdminUI(isAdmin);
});

/* ============= Déconnexion ============= */
if (btnLogout) {
  btnLogout.addEventListener('click', async () => {
    try {
      // Nettoie le cache admin pour la session suivante
      const u = auth.currentUser;
      if (u) sessionStorage.removeItem(`isAdmin:${u.uid}`);
      await signOut(auth);
    } finally {
      window.location.href = 'login.html';
    }
  });
}
