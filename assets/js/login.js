// assets/js/login.js

import { auth, db } from './firebase-init.js';
import { toast } from './app.js';

import {
  onAuthStateChanged,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  doc, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- Références DOM & helpers UI ---
const form       = document.getElementById('form-login');
const btnLogin   = document.getElementById('btn-login') || document.querySelector('button[type="submit"]');
const btnRegister= document.getElementById('btn-register'); // optionnel
const elStatus   = document.getElementById('login-status');
const elBanner   = document.getElementById('email-link-banner');

function say(msg) {
  (typeof toast === 'function') ? toast(msg) : alert(msg);
}
function showStatus(msg, type = 'info') {
  if (!elStatus) return;
  elStatus.className = `alert alert-${type}`;
  elStatus.textContent = msg;
  elStatus.classList.remove('d-none');
}
function hideStatus() { elStatus?.classList.add('d-none'); }
function showBanner(show) { elBanner?.classList.toggle('d-none', !show); }
function disableForm(disabled) {
  btnLogin && (btnLogin.disabled = disabled);
  const emailEl = document.getElementById('email');
  const passEl  = document.getElementById('password');
  if (emailEl) emailEl.disabled = disabled;
  if (passEl)  passEl.disabled  = disabled;
}

// --- Crée users/{uid} si manquant ---
async function ensureUserDoc(user, fallbackEmail = '') {
  try {
    const ref  = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      await setDoc(ref, {
        email: user.email || fallbackEmail || '',
        displayName: user.displayName || '',
        canCreateTickets: true,
        createdAt: new Date()
      }, { merge: true });
    }
  } catch (e) {
    console.error('[login] ensureUserDoc error:', e);
  }
}

// --- Redirection selon rôle ---
async function redirectAfterSignIn(uid) {
  try {
    const adminSnap = await getDoc(doc(db, 'admins', uid));
    if (adminSnap.exists()) window.location.replace('users.html');
    else                    window.location.replace('tickets.html');
  } catch (e) {
    console.error('[login] redirect check error:', e);
    window.location.replace('tickets.html');
  }
}

// --- Compléter la connexion par lien e‑mail (si présent) ---
async function completeEmailLinkIfNeeded() {
  if (!isSignInWithEmailLink(auth, window.location.href)) return;

  hideStatus();
  showBanner(true);
  disableForm(true);

  try {
    let email = window.localStorage.getItem('emailForSignIn');
    if (!email) email = window.prompt('Saisis ton email pour terminer la connexion :') || '';

    const cred = await signInWithEmailLink(auth, email.trim(), window.location.href);
    window.localStorage.removeItem('emailForSignIn');

    await ensureUserDoc(cred.user, email);
    await redirectAfterSignIn(cred.user.uid);
  } catch (err) {
    console.error('[login] email link completion error:', err);
    showStatus(err?.message || 'Impossible de terminer la connexion par lien e‑mail.', 'danger');
    disableForm(false);
    showBanner(false);
  }
}

// ▶️ Démarrage : tenter d’abord de compléter un lien e‑mail
completeEmailLinkIfNeeded().catch(console.error);

// 👤 Si déjà connecté : redirection selon rôle
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try { await ensureUserDoc(user); } catch (_) {}
    await redirectAfterSignIn(user.uid);
  }
});

// 🔑 Connexion Email + Mot de passe
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideStatus();

  const email = (document.getElementById('email')?.value || '').trim();
  const pass  = (document.getElementById('password')?.value || '');

  if (!email || !pass) return showStatus('Email et mot de passe requis.', 'warning');

  disableForm(true);
  try {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    await ensureUserDoc(cred.user, email);
    await redirectAfterSignIn(cred.user.uid);
  } catch (err) {
    console.error('[login] email/password error:', err);
    showStatus(err?.message || 'Connexion refusée. Vérifie tes identifiants.', 'danger');
    disableForm(false);
  }
});

// 🆕 (Optionnel) Création Email + Mot de passe
btnRegister?.addEventListener('click', async () => {
  const email = (document.getElementById('email')?.value || '').trim();
  const pass  = (document.getElementById('password')?.value || '');
  if (!email || !pass) return say('Saisis un email et un mot de passe.');

  disableForm(true);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, pass);
    await ensureUserDoc(cred.user, email);
    say('Compte créé.');
    await redirectAfterSignIn(cred.user.uid);
  } catch (err) {
    console.error('[login] register error:', err);
    say('Création échouée : ' + (err?.message || err));
    disableForm(false);
  }
});
