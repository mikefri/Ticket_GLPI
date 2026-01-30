// ============================================================
// Page Utilisateurs & Rôles
// - Liste + pagination Firestore
// - Promotion / Retrait admin
// - Création d’utilisateur via Cloud Function adminCreateUser (Option B)
// - Accès réservé aux admins (vérification directe Firestore)
// ============================================================

import './app.js';
import { db } from './firebase-init.js';
import { requireAuth, toast } from './app.js';

import {
  collection, query, orderBy, limit, limitToLast, startAfter, endBefore,
  getDocs, getDoc, setDoc, deleteDoc, doc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import {
  getFunctions, httpsCallable
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-functions.js";

// ------------------------------------
// (Option) Région des Cloud Functions
// Si ta Function est déployée en europe-west1 (recommandé en France),
// mets: const FUNCTIONS_REGION = 'europe-west1';
// Sinon laisse null pour us-central1 (défaut).
// ------------------------------------
const FUNCTIONS_REGION = null;

// ------------------------------------
// Références DOM
// ------------------------------------
const elBody   = document.getElementById('users-tbody');
const elSearch = document.getElementById('search');
const btnPrev  = document.getElementById('btn-prev');
const btnNext  = document.getElementById('btn-next');
const pageInfo = document.getElementById('page-info');

// UI Création utilisateur (Option B)
const btnOpenCreate = document.getElementById('btn-open-create');
const formCreate    = document.getElementById('form-create-user');
const elCuEmail     = document.getElementById('cu-email');
const elCuName      = document.getElementById('cu-displayName');
const elCuAdmin     = document.getElementById('cu-makeAdmin');
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
                data-action="toggle-admin" data-uid="${user.uid}">
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
// Option B - Création d'utilisateur via Cloud Function
//  - Nécessite le bouton + modal dans users.html
//  - adminCreateUser déployée côté serveur
// ============================================================
let modalCreate;
let functions;

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
  if (!functions) {
    functions = FUNCTIONS_REGION
      ? getFunctions(undefined, FUNCTIONS_REGION)
      : getFunctions();
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
  if (elCuAdmin) elCuAdmin.checked = false;
  if (elCuCanCreate) elCuCanCreate.checked = true;
  if (elCuResult) {
    elCuResult.classList.add('d-none');
    elCuResult.textContent = '';
  }
  modalCreate.show();
});

// Soumission du formulaire (appel Cloud Function)
formCreate?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!initCreateModal()) return;

  const email = (elCuEmail?.value || '').trim();
  const displayName = (elCuName?.value || '').trim();
  const makeAdmin = !!elCuAdmin?.checked;
  const canCreateTickets = !!elCuCanCreate?.checked;

  if (!email) {
    toast('Email requis');
    return;
  }

  const btn = document.getElementById('cu-submit');
  if (btn) btn.disabled = true;

  try {
    const call = httpsCallable(functions, 'adminCreateUser');
    const res = await call({ email, displayName, makeAdmin, canCreateTickets });

    const { uid, resetLink, promoted } = res.data || {};
    if (elCuResult) {
      elCuResult.classList.remove('d-none');
      elCuResult.innerHTML = `
        <div>Utilisateur créé: <code>${esc(uid || '')}</code></div>
        <div class="mt-2">Lien de mot de passe: ${esc(resetLink || '')}Ouvrir</a></div>
        <div class="mt-1">
          toggle-copy
            Copier le lien
          </button>
        </div>
        ${promoted ? '<div class="mt-1 text-success">Utilisateur promu admin</div>' : ''}
      `;

      // Bouton copier
      const copyBtn = document.getElementById('btn-copy-reset');
      copyBtn?.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(resetLink || '');
          toast('Lien copié dans le presse-papiers');
        } catch {
          toast('Copie impossible (permissions navigateur)');
        }
      });
    }

    // Recharge la page 1 pour voir le nouvel utilisateur
    await loadPage('first');
  } catch (err) {
    console.error('[users] adminCreateUser error:', err);
    const msg = err?.message || err?.code || 'Création refusée (droits / domaines / quotas ?)';
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
