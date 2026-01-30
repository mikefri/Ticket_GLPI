import { auth, db } from './firebase-init.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

function setText(el, text) { if (el) el.textContent = text; }
function show(el, yes=true) { if (!el) return; el.classList.toggle('d-none', !yes); }

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

const elUser = document.getElementById('user-display');
const btnLogin = document.getElementById('btn-login');
const btnLogout = document.getElementById('btn-logout');
const navAdmin = document.getElementById('nav-admin');
const avatar = document.getElementById('avatar');

onAuthStateChanged(auth, async (user) => {
  if (user) {
    const label = user.email || user.uid;
    setText(elUser, label);
    show(btnLogin, false);
    show(btnLogout, true);
    // avatar initials
    if (avatar) { const ini = (label[0]||'U').toUpperCase(); avatar.textContent = ini; show(avatar, true); }
    try {
      const ref = doc(db, 'admins', user.uid);
      const snap = await getDoc(ref);
      show(navAdmin, snap.exists());
    } catch (e) { show(navAdmin, false); }
  } else {
    setText(elUser, '');
    show(btnLogin, true);
    show(btnLogout, false);
    show(navAdmin, false);
    show(avatar, false);
  }
});

if (btnLogout) {
  btnLogout.addEventListener('click', async () => {
    await signOut(auth);
    window.location.href = 'login.html';
  });
}

export function toast(message) {
  const body = document.getElementById('toast-body');
  if (body) body.textContent = message;
  const el = document.getElementById('toast');
  if (!el) return;
  const t = new bootstrap.Toast(el);
  t.show();
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
