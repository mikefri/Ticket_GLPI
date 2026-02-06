// ============================================================
// users.js — Création utilisateur + RECONNEXION AUTO ADMIN + SUPPRESSION
// ============================================================

import './app.js';
import { db } from './firebase-init.js';
import { requireAuth, toast } from './app.js';

import {
  collection, query, orderBy, limit, limitToLast, startAfter, endBefore,
  getDocs, getDoc, setDoc, deleteDoc, doc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  getAuth, createUserWithEmailAndPassword, updateProfile, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// DOM
const tbody         = document.getElementById('users-tbody');
const searchInput   = document.getElementById('search');
const btnPrev       = document.getElementById('btn-prev');
const btnNext       = document.getElementById('btn-next');
const pageInfo      = document.getElementById('page-info');
const btnOpenCreate = document.getElementById('btn-open-create');
const formCreate    = document.getElementById('form-create-user');
const cuEmail       = document.getElementById('cu-email');
const cuName        = document.getElementById('cu-displayName');
const cuPassword    = document.getElementById('cu-password');
const cuConfirm     = document.getElementById('cu-password-confirm');
const cuMakeAdmin   = document.getElementById('cu-makeAdmin');
const cuCanCreate   = document.getElementById('cu-canCreate');
const cuResult      = document.getElementById('cu-result');

const PAGE_SIZE = 20;
let lastDoc = null;
let firstDoc = null;
let history = [];
let adminsSet = new Set();

// Helpers
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function row(user, isAdmin) {
  const name = esc(user.displayName || '—');
  const email = esc(user.email || '—');
  const canCreate = user.canCreateTickets !== false;
  const uidText = esc(user.uid || '');
  return `
    <tr>
      <td><div class="fw-semibold">${name}</div><div class="small text-muted">${uidText}</div></td>
      <td>${email}</td>
      <td class="text-center"><span class="badge ${isAdmin ? 'text-bg-warning text-dark' : 'text-bg-secondary'}">${isAdmin ? 'Admin' : '—'}</span></td>
      <td class="text-center"><span class="badge ${canCreate ? 'text-bg-success' : 'text-bg-secondary'}">${canCreate ? 'Autorisé' : 'Bloqué'}</span></td>
      <td class="text-end">
        <button class="btn btn-sm ${isAdmin ? 'btn-outline-danger' : 'btn-outline-primary'} btn-toggle-admin" data-uid="${esc(user.uid)}" title="Changer le rôle admin">
          ${isAdmin ? 'Retirer admin' : 'Promouvoir admin'}
        </button>
        <button class="btn btn-sm btn-outline-danger btn-delete-user" data-uid="${esc(user.uid)}" data-email="${esc(user.email)}" title="Supprimer cet utilisateur">
          <i class="bi bi-trash"></i>
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

  if (direction === 'first') q = query(base, limit(PAGE_SIZE));
  else if (direction === 'next' && lastDoc) q = query(base, startAfter(lastDoc), limit(PAGE_SIZE));
  else if (direction === 'prev' && history.length > 1 && firstDoc) q = query(base, endBefore(firstDoc), limitToLast(PAGE_SIZE));
  else return;

  const snap = await getDocs(q);
  tbody.innerHTML = '';

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
  tbody.innerHTML = rows.join('');

  firstDoc = snap.docs[0];
  lastDoc = snap.docs[snap.docs.length - 1];

  if (direction === 'first') history = [firstDoc];
  else if (direction === 'next') history.push(firstDoc);
  else if (direction === 'prev') {
    history.pop();
    firstDoc = history[history.length - 1];
  }

  pageInfo.textContent = `Affichés : ${snap.size}`;
  btnPrev.disabled = history.length <= 1;
  btnNext.disabled = snap.size < PAGE_SIZE;
}

// ============================================================
// Toggle admin (promouvoir / retirer)
// ============================================================
document.addEventListener('click', async e => {
  const btn = e.target.closest('.btn-toggle-admin');
  if (!btn) return;

  const uid = btn.dataset.uid;
  const isAdmin = adminsSet.has(uid);

  btn.disabled = true;
  try {
    if (isAdmin) {
      // IL EST ADMIN -> ON LE RETIRE
      await deleteDoc(doc(db, 'admins', uid));
      toast('Rôle admin retiré');
    } else {
      // IL N'EST PAS ADMIN -> ON LE PROMEUT
      const userSnap = await getDoc(doc(db, 'users', uid));
      const userData = userSnap.exists() ? userSnap.data() : {};

      await setDoc(doc(db, 'admins', uid), {
        email: userData.email || null,
        displayName: userData.displayName || null,
        promotedAt: serverTimestamp()
      });
      toast('Promu admin avec succès');
    }
    
    await loadPage('first');

  } catch (err) {
    console.error(err);
    toast('Échec modification rôle');
  } finally {
    btn.disabled = false;
  }
});

// ============================================================
// Suppression d'utilisateur
// ============================================================
document.addEventListener('click', async e => {
  const btn = e.target.closest('.btn-delete-user');
  if (!btn) return;

  const uid = btn.dataset.uid;
  const email = btn.dataset.email;

  // Confirmation avant suppression
  const confirmed = confirm(
    `Êtes-vous sûr de vouloir supprimer l'utilisateur "${email}" ?\n\nCette action est irréversible.`
  );
  if (!confirmed) return;

  btn.disabled = true;
  try {
    // Supprime le document utilisateur
    await deleteDoc(doc(db, 'users', uid));
    
    // Supprime le rôle admin s'il y était
    try {
      await deleteDoc(doc(db, 'admins', uid));
    } catch (e) {
      // L'utilisateur n'était peut-être pas admin, on continue
      console.log('[users] user was not admin, continuing');
    }
    
    toast(`Utilisateur "${email}" supprimé`);
    await loadPage('first');
    
  } catch (err) {
    console.error('[users] delete user error:', err);
    toast('Erreur lors de la suppression (vérifier les droits Firestore)');
    btn.disabled = false;
  }
});

// ============================================================
// Pagination
// ============================================================
btnNext?.addEventListener('click', () => loadPage('next'));
btnPrev?.addEventListener('click', () => loadPage('prev'));

// ============================================================
// Recherche client
// ============================================================
searchInput?.addEventListener('input', () => {
  const term = searchInput.value.toLowerCase();
  [...tbody.querySelectorAll('tr')].forEach(tr => {
    tr.style.display = tr.textContent.toLowerCase().includes(term) ? '' : 'none';
  });
});

// ============================================================
// Modal + création + RECONNEXION AUTO ADMIN
// ============================================================
let modalCreate;
btnOpenCreate?.addEventListener('click', () => {
  if (!modalCreate) modalCreate = new bootstrap.Modal(document.getElementById('modal-create-user'));

  // Sauvegarde temporaire des infos admin AVANT ouverture modal
  const auth = getAuth();
  const currentUser = auth.currentUser;
  if (currentUser && currentUser.email) {
    sessionStorage.setItem('adminEmail', currentUser.email);
  }

  cuEmail.value = '';
  cuName.value = '';
  cuPassword.value = '';
  cuConfirm.value = '';
  cuMakeAdmin.checked = false;
  cuCanCreate.checked = true;
  cuResult.classList.add('d-none');
  modalCreate.show();
});

formCreate?.addEventListener('submit', async e => {
  e.preventDefault();

  const email       = cuEmail.value.trim();
  const displayName = cuName.value.trim();
  const password    = cuPassword.value;
  const confirmPw   = cuConfirm.value;
  const makeAdmin   = cuMakeAdmin.checked;
  const canCreate   = cuCanCreate.checked;

  if (!email || !displayName || !password || password !== confirmPw || password.length < 8) {
    toast('Vérifiez les champs (mot de passe ≥ 8 et confirmation identique)');
    return;
  }

  const submitBtn = document.getElementById('cu-submit');
  submitBtn.disabled = true;

  const auth = getAuth();

  try {
    // Récupère l'email admin
    const adminEmail = sessionStorage.getItem('adminEmail');
    if (!adminEmail) {
      toast('Impossible de récupérer vos identifiants admin. Reconnectez-vous.');
      return;
    }

    // Demande le mot de passe admin
    const adminPassword = prompt("Pour des raisons de sécurité, veuillez ressaisir votre mot de passe administrateur :");
    if (!adminPassword) {
      toast('Mot de passe admin annulé');
      return;
    }

    // 1. Créer le nouvel utilisateur
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const newUser = cred.user;

    await updateProfile(newUser, { displayName });

    await setDoc(doc(db, 'users', newUser.uid), {
      uid: newUser.uid,
      email,
      displayName,
      canCreateTickets: canCreate,
      createdAt: serverTimestamp(),
      createdBy: (await requireAuth())?.uid || null
    });

    if (makeAdmin) {
      await setDoc(doc(db, 'admins', newUser.uid), {});
    }

    // 2. Déconnecter le nouveau user
    await signOut(auth);

    // 3. Reconnecter l'admin automatiquement
    await signInWithEmailAndPassword(auth, adminEmail, adminPassword);

    // Nettoyage
    sessionStorage.removeItem('adminEmail');

    toast('Utilisateur créé et vous êtes reconnecté en admin !');
    cuResult.innerHTML = `Compte créé : ${esc(email)} (${esc(displayName)})`;
    cuResult.classList.remove('d-none');

    await loadPage('first');
    modalCreate.hide();

  } catch (err) {
    console.error('[createUser]', err);
    let msg = 'Erreur création';
    if (err.code === 'auth/email-already-in-use') msg = 'Email déjà utilisé';
    if (err.code === 'auth/wrong-password') msg = 'Mot de passe admin incorrect';
    toast(msg);
  } finally {
    submitBtn.disabled = false;
  }
});

// ============================================================
// Initialisation
// ============================================================
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
