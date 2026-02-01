// ============================================================
// Page Utilisateurs & Rôles – Création directe email + password
// Version corrigée pour éviter "Missing or insufficient permissions"
// ============================================================

import './app.js';
import { db } from './firebase-init.js';
import { requireAuth, toast, esc } from './app.js';

import {
  collection,
  query,
  orderBy,
  limit,
  limitToLast,
  startAfter,
  endBefore,
  getDocs,
  getDoc,
  setDoc,
  deleteDoc,
  doc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  getAuth,
  createUserWithEmailAndPassword,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ────────────────────────────────────────────────
// Références DOM
// ────────────────────────────────────────────────
const elBody         = document.getElementById('users-tbody');
const elSearch       = document.getElementById('search');
const btnPrev        = document.getElementById('btn-prev');
const btnNext        = document.getElementById('btn-next');
const pageInfo       = document.getElementById('page-info');
const btnOpenCreate  = document.getElementById('btn-open-create');
const formCreate     = document.getElementById('form-create-user');
const elCuEmail      = document.getElementById('cu-email');
const elCuName       = document.getElementById('cu-displayName');
const elCuPassword   = document.getElementById('cu-password');
const elCuConfirm    = document.getElementById('cu-password-confirm');
const elCuAdmin      = document.getElementById('cu-makeAdmin');
const elCuCanCreate  = document.getElementById('cu-canCreate');
const elCuResult     = document.getElementById('cu-result');

// ────────────────────────────────────────────────
// Pagination & état
// ────────────────────────────────────────────────
const PAGE_SIZE = 20;
let lastDoc = null;
let firstDoc = null;
let history = [];
let adminsSet = new Set();

// ────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])
  );
}

function row(user, isAdmin) {
  const name = esc(user.displayName || '—');
  const email = esc(user.email || '—');
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

async function loadAdmins() {
  adminsSet = new Set();
  const snap = await getDocs(collection(db, 'admins'));
  snap.forEach(d => adminsSet.add(d.id));
}

async function loadPage(direction = 'first') {
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
  lastDoc = snap.docs[snap.docs.length - 1];

  if (direction === 'first') history = [firstDoc];
  else if (direction === 'next') history.push(firstDoc);
  else if (direction === 'prev') {
    history.pop();
    history[history.length - 1] = firstDoc;
  }

  pageInfo.textContent = `Affichés : ${snap.size}`;
  btnPrev.disabled = history.length <= 1;
  btnNext.disabled = snap.size < PAGE_SIZE;
}

// ────────────────────────────────────────────────
// Toggle rôle admin
// ────────────────────────────────────────────────
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
    console.error('[toggle-admin]', err);
    toast('Échec modification rôle');
  } finally {
    btn.disabled = false;
  }
});

btnNext?.addEventListener('click', () => loadPage('next'));
btnPrev?.addEventListener('click', () => loadPage('prev'));

elSearch?.addEventListener('input', () => {
  const term = elSearch.value.toLowerCase();
  [...elBody.querySelectorAll('tr')].forEach(tr => {
    tr.classList.toggle('d-none', !tr.textContent.toLowerCase().includes(term));
  });
});

// ────────────────────────────────────────────────
// Création utilisateur (corrigée)
// ────────────────────────────────────────────────
let modalCreate;
function initModal() {
  if (!modalCreate) {
    modalCreate = new bootstrap.Modal(document.getElementById('modal-create-user'));
  }
  return modalCreate;
}

btnOpenCreate?.addEventListener('click', () => {
  initModal();
  elCuEmail.value = '';
  elCuName.value = '';
  elCuPassword.value = '';
  elCuConfirm.value = '';
  elCuAdmin.checked = false;
  elCuCanCreate.checked = true;
  elCuResult.classList.add('d-none');
  elCuResult.textContent = '';
  modalCreate.show();
});

formCreate?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email          = (elCuEmail?.value     || '').trim();
  const displayName    = (elCuName?.value      || '').trim();
  const password       = elCuPassword?.value   || '';
  const passwordConfirm = elCuConfirm?.value   || '';
  const makeAdmin      = elCuAdmin?.checked    ?? false;
  const canCreateTickets = elCuCanCreate?.checked ?? true;

  if (!email || !displayName || !password) {
    toast('Email, nom et mot de passe obligatoires');
    return;
  }
  if (password !== passwordConfirm) {
    toast('Les mots de passe ne correspondent pas');
    return;
  }
  if (password.length < 8) {
    toast('Le mot de passe doit contenir au moins 8 caractères');
    return;
  }

  const btn = document.getElementById('cu-submit');
  if (btn) btn.disabled = true;

  try {
    const currentAdmin = await requireAuth(true);
    if (!currentAdmin) throw new Error('Session admin perdue');

    // 1. Créer un placeholder avec UID temporaire (sous droits admin)
    const placeholderRef = doc(collection(db, 'users'));
    const tempUid = placeholderRef.id;

    await setDoc(placeholderRef, {
      email,
      displayName,
      canCreateTickets,
      createdAt: serverTimestamp(),
      createdBy: currentAdmin.uid,
      status: 'pending_auth',
      tempUid // pour traçabilité si besoin
    });

    // 2. Créer le compte Auth (l'utilisateur courant change ici !)
    const auth = getAuth();
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    const newUser = userCredential.user;

    // 3. Mettre à jour displayName dans Firebase Auth
    await updateProfile(newUser, { displayName });

    // 4. Supprimer le placeholder et créer le vrai document avec le bon UID
    await deleteDoc(doc(db, 'users', tempUid));

    await setDoc(doc(db, 'users', newUser.uid), {
      uid: newUser.uid,
      email: newUser.email,
      displayName,
      canCreateTickets,
      createdAt: serverTimestamp(),
      createdBy: currentAdmin.uid   // on garde l'UID de l'admin créateur
    });

    // 5. Promouvoir admin si demandé
    if (makeAdmin) {
      await setDoc(doc(db, 'admins', newUser.uid), {}, { merge: true });
    }

    toast('Utilisateur créé avec succès');
    if (elCuResult) {
      elCuResult.classList.remove('d-none');
      elCuResult.textContent = `Compte créé : ${esc(email)} (${esc(displayName)})`;
    }

    await loadPage('first');
    modalCreate.hide();

  } catch (err) {
    console.error('[create user]', err);
    let msg = 'Erreur lors de la création';
    if (err.code === 'auth/email-already-in-use')    msg = 'Cet email est déjà utilisé';
    if (err.code === 'auth/weak-password')           msg = 'Mot de passe trop faible';
    if (err.code === 'permission-denied')            msg = 'Permissions insuffisantes (vérifiez les règles)';
    toast(msg);
  } finally {
    if (btn) btn.disabled = false;
  }
});

// ────────────────────────────────────────────────
// Initialisation
// ────────────────────────────────────────────────
(async () => {
  const user = await requireAuth(true);
  if (!user) return;

  try {
    const adminSnap = await getDoc(doc(db, 'admins', user.uid));
    if (!adminSnap.exists()) {
      toast('Accès réservé aux administrateurs');
      setTimeout(() => window.location.href = 'tickets.html', 800);
      return;
    }

    await loadPage('first');
  } catch (err) {
    console.error('[users init]', err);
    toast('Erreur chargement liste utilisateurs');
  }
})();
