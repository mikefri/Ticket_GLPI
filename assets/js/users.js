// Page Utilisateurs & Rôles – Création directe email/password

import './app.js';
import { db } from './firebase-init.js';
import { requireAuth, toast } from './app.js';

import {
  collection, query, orderBy, limit, limitToLast, startAfter, endBefore,
  getDocs, getDoc, setDoc, deleteDoc, doc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  getAuth, createUserWithEmailAndPassword, updateProfile
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// DOM
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

const PAGE_SIZE = 20;
let lastDoc = null;
let firstDoc = null;
let history = [];
let adminsSet = new Set();

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function row(user, isAdmin) {
  const name = esc(user.displayName) || '—';
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
  } else return;

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

  pageInfo.textContent = `Affichés: ${snap.size}`;
  btnPrev.disabled = history.length <= 1;
  btnNext.disabled = snap.size < PAGE_SIZE;
}

// Toggle admin
document.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-action="toggle-admin"]');
  if (!btn) return;
  const uid = btn.getAttribute('data-uid');
  const isAdmin = adminsSet.has(uid);

  try {
    btn.disabled = true;
    if (isAdmin) {
      await deleteDoc(doc(db, 'admins', uid));
      toast('Rôle admin retiré');
    } else {
      await setDoc(doc(db, 'admins', uid), {});
      toast('Promu administrateur');
    }
    await loadPage('first');
  } catch (err) {
    console.error('[users] toggle admin error', err);
    toast('Échec action');
  } finally {
    btn.disabled = false;
  }
});

btnNext?.addEventListener('click', () => loadPage('next'));
btnPrev?.addEventListener('click', () => loadPage('prev'));

elSearch?.addEventListener('input', () => {
  const q = elSearch.value.toLowerCase();
  [...elBody.querySelectorAll('tr')].forEach(tr => {
    tr.classList.toggle('d-none', !tr.textContent.toLowerCase().includes(q));
  });
});

// Modal création
let modalCreate;
function initModal() {
  if (!modalCreate) modalCreate = new bootstrap.Modal(document.getElementById('modal-create-user'));
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
  modalCreate.show();
});

formCreate?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = elCuEmail.value.trim();
  const displayName = elCuName.value.trim();
  const password = elCuPassword.value;
  const confirm = elCuConfirm.value;
  const makeAdmin = elCuAdmin.checked;
  const canCreate = elCuCanCreate.checked;

  if (!email || !displayName || !password) {
    toast('Champs obligatoires manquants');
    return;
  }
  if (password !== confirm) {
    toast('Mots de passe différents');
    return;
  }
  if (password.length < 8) {
    toast('Mot de passe ≥ 8 caractères');
    return;
  }

  const btn = document.getElementById('cu-submit');
  btn.disabled = true;

  try {
    const auth = getAuth();
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const newUser = cred.user;

    await updateProfile(newUser, { displayName });

    await setDoc(doc(db, 'users', newUser.uid), {
      uid: newUser.uid,
      email: newUser.email,
      displayName,
      canCreateTickets: canCreate,
      createdAt: serverTimestamp(),
      createdBy: (await requireAuth())?.uid || null
    });

    if (makeAdmin) {
      await setDoc(doc(db, 'admins', newUser.uid), {});
    }

    toast(makeAdmin ? 'Utilisateur créé + admin' : 'Utilisateur créé');
    elCuResult.innerHTML = `Compte créé : ${esc(email)} (${displayName})`;
    elCuResult.classList.remove('d-none');

    await loadPage('first');
    modalCreate.hide();
  } catch (err) {
    console.error('[createUser]', err);
    let msg = 'Erreur création';
    if (err.code === 'auth/email-already-in-use') msg = 'Email déjà utilisé';
    if (err.code === 'auth/weak-password') msg = 'Mot de passe trop faible';
    toast(msg);
  } finally {
    btn.disabled = false;
  }
});

// Init
(async () => {
  const user = await requireAuth(true);
  if (!user) return;

  const adminSnap = await getDoc(doc(db, 'admins', user.uid));
  if (!adminSnap.exists()) {
    toast('Accès réservé aux admins');
    setTimeout(() => location.href = 'tickets.html', 800);
    return;
  }

  await loadPage('first');
})();
