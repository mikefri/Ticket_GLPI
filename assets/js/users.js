// ============================================================
// Page Utilisateurs & Rôles
// - Liste + pagination Firestore
// - Promotion / Retrait admin
// - Création d’utilisateur par invitation e-mail (Email Link, sans Cloud Functions)
// - Accès réservé aux admins (vérification directe Firestore)
// ============================================================

import './app.js';
import { db } from './firebase-init.js';
import { requireAuth, toast } from './app.js';

import {
  collection, query, orderBy, limit, limitToLast, startAfter, endBefore,
  getDocs, getDoc, setDoc, deleteDoc, doc, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  getAuth, sendSignInLinkToEmail
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ------------------------------------
// Paramètres du lien magique (Email Link)
// - url : page qui terminera la connexion via signInWithEmailLink()
// - handleCodeInApp: true est requis côté Web
// ------------------------------------
const actionCodeSettings = {
  url: `${location.origin}/Ticket_GLPI/login.html`, // adapte si tu préfères index.html
  handleCodeInApp: true
};

// ------------------------------------
// Références DOM
// ------------------------------------
const elBody   = document.getElementById('users-tbody');
const elSearch = document.getElementById('search');
const btnPrev  = document.getElementById('btn-prev');
const btnNext  = document.getElementById('btn-next');
const pageInfo = document.getElementById('page-info');

// UI Création utilisateur (Invitation)
const btnOpenCreate = document.getElementById('btn-open-create');
const formCreate    = document.getElementById('form-create-user');
const elCuEmail     = document.getElementById('cu-email');
const elCuName      = document.getElementById('cu-displayName');
const elCuAdmin     = document.getElementById('cu-makeAdmin');   // Conservé UI (info), pas d’effet direct sans serveur
const elCuCanCreate = document.getElementById('cu-canCreate');
const elCuResult    = document.getElementById('cu-result');

// ------------------------------------
// État pagination + admins
// ------------------------------------
const PAGE_SIZE = 20;
let lastDoc = null;     // dernier doc de la page courante (pour "next")
let firstDoc = null;    // premier doc de la page courante (pour "prev")
let history = [];       // pile des firstDoc des pages visitées
let adminsSet = new Set();

// ------------------------------------
// Helper : échappement HTML (affichage uniquement)
// ------------------------------------
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])
  );
}

// ------------------------------------
// Rendu d’une ligne
// ------------------------------------
function row(user, isAdmin){
  const name  = esc(user.displayName) || '—';
  const email = esc(user.email) || '—';
  const canCreate = user.canCreateTickets !== false;
  const uidText = esc(user.uid || '');

  return `
    <tr>
      <td>
        <div class="fw-semibold">${name}</div>
        <div class="small text-muted">${uidText}</div>
      </td>
      <td>${email}</td>
      <td class="text-center">
        <span class="badge ${isAdmin ? 'text-bg-warning text-dark' : 'text-bg-secondary'}">
          ${isAdmin ? 'Admin' : '—'}
        </span>
      </td>
      <td class="text-center">
        <span class="badge ${canCreate ? 'text-bg-success' : 'text-bg-secondary'}">
          ${canCreate ? 'Autorisé' : 'Bloqué'}
        </span>
      </td>
      <td class="text-end">
        <button class="btn btn-sm ${isAdmin ? 'btn-outline-danger' : 'btn-outline-primary'}"
                data-action="toggle-admin" data-uid="${esc(user.uid)}">
          ${isAdmin ? 'Retirer admin' : 'Promouvoir admin'}
        </button>
      </td>
    </tr>`;
}

// ------------------------------------
// Charge la liste des admins (Set d’UID)
// ------------------------------------
async function loadAdmins() {
  adminsSet = new Set();
  const snap = await getDocs(collection(db, 'admins'));
  snap.forEach(d => adminsSet.add(d.id));
}

// ------------------------------------
// Pagination fiable :
//  - first : limit(PAGE_SIZE)
//  - next  : startAfter(lastDoc) + limit(PAGE_SIZE)
//  - prev  : endBefore(firstDoc) + limitToLast(PAGE_SIZE)
// ------------------------------------
async function loadPage(direction = 'first'){
  await loadAdmins();

  const base = query(collection(db, 'users'), orderBy('email'));
  let q;

  if (direction === 'first') {
    q = query(base, limit(PAGE_SIZE));
  } else if (direction === 'next' && lastDoc) {
    q = query(base, startAfter(lastDoc), limit(PAGE_SIZE));
  } else if (direction === 'prev' && history.length > 1 && firstDoc) {
    q = query(base, endBefore(firstDoc), limitToLast(PAGE_SIZE));
  } else {
    return;
  }

  const snap = await getDocs(q);

  elBody.innerHTML = '';
  if (snap.empty) {
    pageInfo.textContent = 'Aucun utilisateur';
    btnNext.disabled = true;
    btnPrev.disabled = history.length <= 1;
    return;
  }

  const rows = [];
  snap.forEach(d => {
    const u = d.data();
    u.uid = d.id;
    rows.push(row(u, adminsSet.has(d.id)));
  });
  elBody.innerHTML = rows.join('');

  firstDoc = snap.docs[0];
  lastDoc  = snap.docs[snap.docs.length - 1];

  if (direction === 'first') {
    history = [firstDoc];
  } else if (direction === 'next') {
    history.push(firstDoc);
  } else if (direction === 'prev') {
    history.pop();
    history[history.length - 1] = firstDoc;
  }

  pageInfo.textContent = `Affichés: ${snap.size}`;
  btnPrev.disabled = history.length <= 1;
  btnNext.disabled = snap.size < PAGE_SIZE;
}

// ------------------------------------
// Toggle Admin (promouvoir / retirer)
// ------------------------------------
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action="toggle-admin"]');
  if (!btn) return;

  const uid = btn.getAttribute('data-uid');
  const isAdmin = adminsSet.has(uid);

  try {
    btn.disabled = true;
    if (isAdmin) {
      await deleteDoc(doc(db, 'admins', uid));
      toast('Rôle administrateur retiré');
    } else {
      await setDoc(doc(db, 'admins', uid), {});
      toast('Utilisateur promu administrateur');
    }
    await loadPage('first');
  } catch (err) {
    console.error('[users] toggle admin', err);
    toast('Action refusée (vérifier les règles / droits)');
  } finally {
    btn.disabled = false;
  }
});

// ------------------------------------
// Boutons pagination
// ------------------------------------
btnNext?.addEventListener('click', () => loadPage('next'));
btnPrev?.addEventListener('click', () => loadPage('prev'));

// ------------------------------------
// Filtre client
// ------------------------------------
elSearch?.addEventListener('input', async () => {
  const q = (elSearch.value || '').toLowerCase();
  [...elBody.querySelectorAll('tr')].forEach(tr => {
    const txt = tr.textContent.toLowerCase();
    tr.classList.toggle('d-none', !txt.includes(q));
  });
});

// ============================================================
// Invitation par e-mail (Email Link) — sans Cloud Functions
// - Nécessite le bouton + modal dans users.html
// - L’utilisateur apparaitra après sa première connexion via le lien
// - (Optionnel) journalisation dans la collection 'invites'
// ============================================================
let modalCreate;

function initCreateModal() {
  // bootstrap.bundle.min.js doit être chargé
  if (!window.bootstrap?.Modal) {
    console.warn('[users] Bootstrap Modal indisponible (bundle manquant ?)');
    toast('Impossible d’ouvrir la fenêtre (Bootstrap non chargé).');
    return false;
  }
  if (!modalCreate) {
    modalCreate = new bootstrap.Modal(document.getElementById('modal-create-user'));
  }
  return true;
}

// Ouvrir le modal
btnOpenCreate?.addEventListener('click', (e) => {
  e.preventDefault();
  if (!initCreateModal()) return;

  // reset form
  if (elCuEmail) elCuEmail.value = '';
  if (elCuName) elCuName.value = '';
  if (elCuAdmin) elCuAdmin.checked = false;      // indicatif (pas d’effet auto sans serveur)
  if (elCuCanCreate) elCuCanCreate.checked = true;
  if (elCuResult) {
    elCuResult.classList.add('d-none');
    elCuResult.textContent = '';
  }
  modalCreate.show();
});

// Soumission du formulaire (envoi du lien magique)
formCreate?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!initCreateModal()) return;

  const email = (elCuEmail?.value || '').trim();
  const displayName = (elCuName?.value || '').trim();
  const makeAdmin = !!elCuAdmin?.checked;            // on peut le journaliser, mais la promo se fera manuellement ensuite
  const canCreateTickets = !!elCuCanCreate?.checked;

  if (!email) { toast('Email requis'); return; }

  const btn = document.getElementById('cu-submit');
  if (btn) btn.disabled = true;

  try {
    // (Optionnel) Journalise l’invitation pour suivi interne
    await addDoc(collection(db, 'invites'), {
      email,
      displayName,
      canCreateTickets,
      makeAdmin,               // note: la promotion admin devra être faite via le bouton de la liste
      createdBy: (await requireAuth())?.uid || null,
      createdAt: serverTimestamp()
    });

    // Envoi du lien de connexion par e-mail (passwordless)
    const auth = getAuth();
    await sendSignInLinkToEmail(auth, email, actionCodeSettings);

    // Si l’utilisateur termine sur le même device, on stocke l’email pour la complétion
    window.localStorage.setItem('emailForSignIn', email);

    // Feedback UI
    if (elCuResult) {
      elCuResult.classList.remove('d-none');
      elCuResult.innerHTML = `
        <div>Invitation envoyée à <strong>${esc(email)}</strong>.</div>
        <div class="mt-2 small text-muted">
          L’utilisateur cliquera le lien reçu par e‑mail pour se connecter.
          Son profil apparaîtra ensuite dans la liste.
        </div>`;
    }
    toast('Invitation envoyée');

    // Ici, on NE recharge PAS la liste : l’utilisateur apparaîtra après sa première connexion
  } catch (err) {
    console.error('[users] invite error:', err);
    const msg = err?.message || 'Envoi impossible (vérifier domaine autorisé / méthode activée)';
    toast(msg);
  } finally {
    if (btn) btn.disabled = false;
  }
});

// ------------------------------------
// Démarrage : Auth + contrôle Admin + chargement page 1
// ------------------------------------
(async () => {
  const user = await requireAuth(true);
  if (!user) return;

  // Vérifie l'accès admin DIRECTEMENT sur Firestore pour éviter toute course avec app.js
  try {
    const adminSnap = await getDoc(doc(db, 'admins', user.uid));
    if (!adminSnap.exists()) {
      toast('Accès admin requis');
      setTimeout(() => window.location.href = 'tickets.html', 800);
      return;
    }
  } catch (e) {
    console.error('[users] admin check error:', e);
    toast('Impossible de vérifier les droits (règles Firestore ?)');
    setTimeout(() => window.location.href = 'tickets.html', 1200);
    return;
  }

  try {
    await loadPage('first');
  } catch (e) {
    console.error('[users] loadPage init error:', e);
    toast('Erreur de chargement de la liste (voir console)');
  }
})();
