import './app.js';
import { db } from './firebase-init.js';
import { requireAuth, toast } from './app.js';
import {
  collection, query, orderBy, limit, startAfter, endBefore,
  getDocs, setDoc, deleteDoc, doc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const elBody   = document.getElementById('users-tbody');
const elSearch = document.getElementById('search');
const btnPrev  = document.getElementById('btn-prev');
const btnNext  = document.getElementById('btn-next');
const pageInfo = document.getElementById('page-info');

const PAGE_SIZE = 20;
let lastDoc = null;
let firstDoc = null;
let stack = []; // pile de pagination
let adminsSet = new Set();

function row(user, isAdmin){
  const name  = user.displayName || '—';
  const email = user.email || '—';
  const canCreate = user.canCreateTickets !== false;
  return `
    <tr>
      <td>
        <div class="fw-semibold">${name}</div>
        <div class="small text-muted">${user.uid || ''}</div>
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
        <button class="btn btn-sm ${isAdmin?'btn-outline-danger':'btn-outline-primary'}"
                data-action="toggle-admin" data-uid="${user.uid}">
          ${isAdmin?'Retirer admin':'Promouvoir admin'}
        </button>
      </td>
    </tr>`;
}

async function loadAdmins() {
  adminsSet = new Set();
  const snap = await getDocs(collection(db, 'admins'));
  snap.forEach(d => adminsSet.add(d.id));
}

async function loadPage(direction = 'first'){
  await loadAdmins();

  let q = query(collection(db, 'users'), orderBy('email'), limit(PAGE_SIZE));
  if (direction === 'next' && lastDoc)  q = query(collection(db,'users'), orderBy('email'), startAfter(lastDoc), limit(PAGE_SIZE));
  if (direction === 'prev' && stack.length > 1) {
    // recalcule : on repart depuis le début et on avance
    const marker = stack[stack.length - 2];
    q = query(collection(db,'users'), orderBy('email'), startAfter(marker), limit(PAGE_SIZE));
    stack.splice(stack.length - 1, 1);
  }
  const snap = await getDocs(q);

  elBody.innerHTML = '';
  if (snap.empty) {
    pageInfo.textContent = 'Aucun utilisateur';
    btnNext.disabled = true;
    btnPrev.disabled = stack.length <= 1;
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
  if (direction === 'first' || direction === 'next') stack.push(lastDoc);

  pageInfo.textContent = `Affichés: ${snap.size}`;
  btnPrev.disabled = stack.length <= 1;
  btnNext.disabled = snap.size < PAGE_SIZE;
}

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

btnNext?.addEventListener('click', () => loadPage('next'));
btnPrev?.addEventListener('click', () => loadPage('prev'));

elSearch?.addEventListener('input', async () => {
  // version simple (client‑side) : filtre sur les lignes déjà chargées
  const q = (elSearch.value || '').toLowerCase();
  [...elBody.querySelectorAll('tr')].forEach(tr => {
    const txt = tr.textContent.toLowerCase();
    tr.classList.toggle('d-none', !txt.includes(q));
  });
});

(async () => {
  const user = await requireAuth(true);
  if (!user) return;

  if (window.__isAdmin !== true) {
    toast('Accès admin requis');
    setTimeout(() => window.location.href = 'tickets.html', 800);
    return;
  }
  await loadPage('first');
})();
