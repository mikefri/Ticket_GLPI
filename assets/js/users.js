// ============================================================
// users.js — Version corrigée (2026-02)
// Création utilisateur sans perdre la session admin
// ============================================================

import './app.js';
import { db } from './firebase-init.js';
import { requireAuth, toast } from './app.js';

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
// DOM
// ────────────────────────────────────────────────
const tbody           = document.getElementById('users-tbody');
const searchInput     = document.getElementById('search');
const btnPrev         = document.getElementById('btn-prev');
const btnNext         = document.getElementById('btn-next');
const pageInfo        = document.getElementById('page-info');
const btnOpenCreate   = document.getElementById('btn-open-create');
const formCreate      = document.getElementById('form-create-user');
const cuEmail         = document.getElementById('cu-email');
const cuDisplayName   = document.getElementById('cu-displayName');
const cuPassword      = document.getElementById('cu-password');
const cuConfirm       = document.getElementById('cu-password-confirm');
const cuMakeAdmin     = document.getElementById('cu-makeAdmin');
const cuCanCreate     = document.getElementById('cu-canCreate');
const cuResult        = document.getElementById('cu-result');

// ────────────────────────────────────────────────
// État pagination
// ────────────────────────────────────────────────
const PAGE_SIZE = 20;
let lastVisible = null;
let firstVisible = null;
let historyStack = [];          // pour gérer prev
let adminsCache = new Set();

// ────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function renderRow(userData, isAdmin) {
  const name = escapeHtml(userData.displayName || '—');
  const email = escapeHtml(userData.email || '—');
  const canCreate = userData.canCreateTickets !== false;
  const uid = escapeHtml(userData.uid || '');

  return `
    <tr>
      <td>
        <div class="fw-semibold">${name}</div>
        <div class="small text-muted">${uid}</div>
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
        <button class="btn btn-sm ${isAdmin ? 'btn-outline-danger' : 'btn-outline-primary'} btn-toggle-admin"
                data-uid="${uid}">
          ${isAdmin ? 'Retirer admin' : 'Promouvoir admin'}
        </button>
      </td>
    </tr>`;
}

// ────────────────────────────────────────────────
// Charger la liste des admins (cache)
// ────────────────────────────────────────────────
async function refreshAdminsCache() {
  adminsCache.clear();
  const snap = await getDocs(collection(db, 'admins'));
  snap.forEach(d => adminsCache.add(d.id));
}

// ────────────────────────────────────────────────
// Chargement paginé
// ────────────────────────────────────────────────
async function loadUsers(direction = 'first') {
  await refreshAdminsCache();

  let q = query(
    collection(db, 'users'),
    orderBy('email'),
    limit(PAGE_SIZE)
  );

  if (direction === 'next' && lastVisible) {
    q = query(
      collection(db, 'users'),
      orderBy('email'),
      startAfter(lastVisible),
      limit(PAGE_SIZE)
    );
  } else if (direction === 'prev' && firstVisible && historyStack.length > 1) {
    q = query(
      collection(db, 'users'),
      orderBy('email'),
      endBefore(firstVisible),
      limitToLast(PAGE_SIZE)
    );
  }

  const snap = await getDocs(q);

  tbody.innerHTML = '';

  if (snap.empty) {
    pageInfo.textContent = 'Aucun utilisateur';
    btnNext.disabled = true;
    btnPrev.disabled = historyStack.length <= 1;
    return;
  }

  const rows = [];
  snap.forEach(docSnap => {
    const data = docSnap.data();
    data.uid = docSnap.id;
    rows.push(renderRow(data, adminsCache.has(docSnap.id)));
  });

  tbody.innerHTML = rows.join('');

  firstVisible = snap.docs[0];
  lastVisible  = snap.docs[snap.docs.length - 1];

  if (direction === 'first') {
    historyStack = [firstVisible];
  } else if (direction === 'next') {
    historyStack.push(firstVisible);
  } else if (direction === 'prev') {
    historyStack.pop();
    firstVisible = historyStack[historyStack.length - 1];
  }

  pageInfo.textContent = `Page ${historyStack.length} — ${snap.size} utilisateur${snap.size > 1 ? 's' : ''}`;
  btnPrev.disabled = historyStack.length <= 1;
  btnNext.disabled = snap.size < PAGE_SIZE;
}

// ────────────────────────────────────────────────
// Toggle admin
// ────────────────────────────────────────────────
document.addEventListener('click', async e => {
  const btn = e.target.closest('.btn-toggle-admin');
  if (!btn) return;

  const uid = btn.dataset.uid;
  const wasAdmin = adminsCache.has(uid);

  btn.disabled = true;

  try {
    if (wasAdmin) {
      await deleteDoc(doc(db, 'admins', uid));
      toast('Rôle admin retiré');
    } else {
      await setDoc(doc(db, 'admins', uid), {});
      toast('Promu admin');
    }
    await loadUsers('first');
  } catch (err) {
    console.error('Toggle admin error', err);
    toast('Échec modification rôle');
  } finally {
    btn.disabled = false;
  }
});

// ────────────────────────────────────────────────
// Pagination & recherche locale
// ────────────────────────────────────────────────
btnNext?.addEventListener('click', () => loadUsers('next'));
btnPrev?.addEventListener('click', () => loadUsers('prev'));

searchInput?.addEventListener('input', () => {
  const term = searchInput.value.toLowerCase().trim();
  document.querySelectorAll('#users-tbody tr').forEach(row => {
    row.style.display = row.textContent.toLowerCase().includes(term) ? '' : 'none';
  });
});

// ────────────────────────────────────────────────
// Création utilisateur (sans perdre session admin)
// ────────────────────────────────────────────────
let createModal;
btnOpenCreate?.addEventListener('click', () => {
  if (!createModal) {
    createModal = new bootstrap.Modal(document.getElementById('modal-create-user'));
  }

  cuEmail.value = '';
  cuDisplayName.value = '';
  cuPassword.value = '';
  cuConfirm.value = '';
  cuMakeAdmin.checked = false;
  cuCanCreate.checked = true;
  cuResult.classList.add('d-none');
  cuResult.textContent = '';

  createModal.show();
});

formCreate?.addEventListener('submit', async e => {
  e.preventDefault();

  const email       = cuEmail.value.trim();
  const displayName = cuDisplayName.value.trim();
  const pw          = cuPassword.value;
  const pwConfirm   = cuConfirm.value;
  const isAdmin     = cuMakeAdmin.checked;
  const canCreate   = cuCanCreate.checked;

  if (!email || !displayName || !pw || pw !== pwConfirm) {
    toast('Vérifiez les champs obligatoires et la confirmation du mot de passe');
    return;
  }
  if (pw.length < 8) {
    toast('Le mot de passe doit contenir au moins 8 caractères');
    return;
  }

  const submitBtn = document.getElementById('cu-submit');
  submitBtn.disabled = true;

  try {
    // 1. Sauvegarde l'admin actuel AVANT de créer le compte
    const adminUser = await requireAuth(true);
    if (!adminUser) throw new Error('Session perdue');

    // 2. Créer le document utilisateur AVANT création Auth (droits admin)
    const userRef = doc(collection(db, 'users'));
    const tempId = userRef.id;

    await setDoc(userRef, {
      email,
      displayName,
      canCreateTickets: canCreate,
      createdAt: serverTimestamp(),
      createdBy: adminUser.uid,
      status: 'pending_auth'
    });

    // 3. Créer le compte Auth → l'utilisateur courant change ici
    const auth = getAuth();
    const credential = await createUserWithEmailAndPassword(auth, email, pw);
    const newUser = credential.user;

    // 4. Mettre à jour displayName Auth
    await updateProfile(newUser, { displayName });

    // 5. Remplacer le document par le vrai UID
    await deleteDoc(doc(db, 'users', tempId));

    await setDoc(doc(db, 'users', newUser.uid), {
      uid: newUser.uid,
      email: newUser.email,
      displayName,
      canCreateTickets: canCreate,
      createdAt: serverTimestamp(),
      createdBy: adminUser.uid
    });

    // 6. Ajouter rôle admin si coché
    if (isAdmin) {
      await setDoc(doc(db, 'admins', newUser.uid), {});
    }

    toast('Utilisateur créé avec succès');
    cuResult.textContent = `Compte créé : ${escapeHtml(email)} (${escapeHtml(displayName)})`;
    cuResult.classList.remove('d-none');

    await loadUsers('first');
    createModal.hide();

  } catch (err) {
    console.error('Création utilisateur échouée', err);
    let msg = 'Erreur création';
    switch (err.code) {
      case 'auth/email-already-in-use': msg = 'Cet email existe déjà'; break;
      case 'auth/weak-password':        msg = 'Mot de passe trop faible'; break;
      case 'permission-denied':         msg = 'Permissions insuffisantes (règles Firestore)'; break;
    }
    toast(msg);
  } finally {
    submitBtn.disabled = false;
  }
});

// ────────────────────────────────────────────────
// Démarrage
// ────────────────────────────────────────────────
(async () => {
  try {
    const user = await requireAuth(true);
    if (!user) return;

    const adminDoc = await getDoc(doc(db, 'admins', user.uid));
    if (!adminDoc.exists()) {
      toast('Accès réservé aux administrateurs');
      setTimeout(() => location.href = 'tickets.html', 1200);
      return;
    }

    await loadUsers('first');
  } catch (err) {
    console.error('Initialisation users échouée', err);
    toast('Impossible de charger la page (voir console)');
  }
})();
