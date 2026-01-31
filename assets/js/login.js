// assets/js/login.js

// ⚙️ Initialisation / imports
import { app } from './firebase-init.js'; // si ton fichier exporte app ; sinon supprime et laisse getAuth()/getFirestore() par défaut
import { toast } from './app.js';

import {
  getAuth,
  onAuthStateChanged,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import {
  getFirestore,
  doc, getDoc, setDoc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Instances (utilise l'app par défaut si 'app' n'est pas exporté)
const auth = getAuth(app);
const db   = getFirestore(app);

// 🧩 Références DOM
const form       = document.getElementById('form-login');
const btnLogin   = document.getElementById('btn-login') || document.querySelector('button[type="submit"]');
const btnRegister= document.getElementById('btn-register'); // optionnel

// Helpers UI
function say(msg) {
  if (typeof toast === 'function') toast(msg);
  else alert(msg);
}
function disableForm(disabled) {
  if (btnLogin) btnLogin.disabled = disabled;
  const emailEl = document.getElementById('email');
  const passEl  = document.getElementById('password');
  if (emailEl) emailEl.disabled = disabled;
  if (passEl)  passEl.disabled  = disabled;
}

// 🔐 Crée le doc users/{uid} si manquant (profil minimal)
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
    // On ne bloque pas la connexion, mais on logge l’erreur.
  }
}

// 🔁 Redirection selon rôle
async function redirectAfterSignIn(uid) {
  try {
    const adminSnap = await getDoc(doc(db, 'admins', uid));
    if (adminSnap.exists()) {
      window.location.replace('users.html');   // page Admin
    } else {
      window.location.replace('tickets.html'); // page standard
    }
  } catch (e) {
    console.error('[login] redirect check error:', e);
    window.location.replace('tickets.html');
  }
}

// ✉️ Compléter la connexion par lien e‑mail si présent dans l’URL
async function completeEmailLinkIfNeeded() {
  if (!isSignInWithEmailLink(auth, window.location.href)) return;

  disableForm(true);
  try {
    // Si l’utilisateur finalise le flux sur un autre device, on lui demande l’email
    let email = window.localStorage.getItem('emailForSignIn');
    if (!email) {
      email = window.prompt('Saisis ton email pour terminer la connexion :') || '';
    }

    const cred = await signInWithEmailLink(auth, email.trim(), window.location.href);
    window.localStorage.removeItem('emailForSignIn');

    await ensureUserDoc(cred.user, email);
    await redirectAfterSignIn(cred.user.uid);
  } catch (err) {
    console.error('[login] email link completion error:', err);
    say('Impossible de terminer la connexion par lien e‑mail : ' + (err?.message || err));
    disableForm(false);
  }
}

// ▶️ Démarrage : tenter d’abord de compléter un lien e‑mail
completeEmailLinkIfNeeded().catch(console.error);

// 👤 État d’auth : si déjà connecté, on redirige selon le rôle
onAuthStateChanged(auth, async (user) => {
  if (user) {
    try {
      // S’assure que le profil Firestore existe (utile pour les comptes créés par lien e‑mail)
      await ensureUserDoc(user);
    } catch (e) {
      // on ignore ici
    }
    await redirectAfterSignIn(user.uid);
  }
});

// 🔑 Connexion Email + Mot de passe
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = (document.getElementById('email')?.value || '').trim();
  const pass  = (document.getElementById('password')?.value || '');

  if (!email || !pass) {
    return say('Email et mot de passe requis.');
  }

  disableForm(true);
  try {
    const cred = await signInWithEmailAndPassword(auth, email, pass);
    await ensureUserDoc(cred.user, email);
    await redirectAfterSignIn(cred.user.uid);
  } catch (e) {
    console.error('[login] email/password error:', e);
    say('Connexion échouée : ' + (e?.message || e));
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
    // L’utilisateur est connecté après création
    await ensureUserDoc(cred.user, email);
    say('Compte créé.');
    await redirectAfterSignIn(cred.user.uid);
  } catch (e) {
    console.error('[login] register error:', e);
    say('Création échouée : ' + (e?.message || e));
    disableForm(false);
  }
});
