import './app.js';
import { db } from './firebase-init.js';
import { requireAdmin, toast } from './app.js';
import {
  collection, query, orderBy, limit, limitToLast, startAfter, endBefore,
  getDocs, setDoc, deleteDoc, doc
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const elBody   = document.getElementById('users-tbody');
const elSearch = document.getElementById('search');
const btnPrev  = document.getElementById('btn-prev');
const btnNext  = document.getElementById('btn-next');
const pageInfo = document.getElementById('page-info');

const PAGE_SIZE = 20;
let lastDoc = null;     // dernier doc de la page courante (pour "next")
let firstDoc = null;    // premier doc de la page courante (pour "prev")
let stack = [];         // pile des "firstDoc" des pages déjà visitées (prev fiable)
let adminsSet = new Set();

/* --- Helper sécurité rendu HTML --- */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])
  );
}

function row(user, isAdmin){
  const name  = esc(user.displayName) || '—';
  const email = esc(user.email) || '—';
  const canCreate = user.canCreateTickets !== false;
  const uid = esc(user.uid || '');
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
        <button class="btn btn-sm ${isAdmin?'btn-outline-danger':'btn-outline-primary'}"
                data-action="toggle-admin" data-uid="${uid}">
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

/**
 * Pagination fiable :
 *  - first : limit(PAGE_SIZE)
 *  - next  : startAfter(lastDoc) + limit(PAGE_SIZE)
 *  - prev  : endBefore(firstDoc) + limitToLast(PAGE_SIZE)
 */
async function loadPage(direction = 'first'){
  try {
    await loadAdmins();
    console.log('[users] loadPage direction=', direction);

    const base = query(collection(db, 'users'), orderBy('email'));
    let q;

    if (direction === 'first') {
      q = query(base, limit(PAGE_SIZE));
    } else if (direction === 'next' && lastDoc) {
      q = query(base, startAfter(lastDoc), limit(PAGE_SIZE));
    } else if (direction === 'prev' && stack.length > 1 && firstDoc) {
      q = query(base, endBefore(firstDoc), limitToLast(PAGE_SIZE));
    } else {
      // rien à faire (pas d’historique pour prev, ou pas de lastDoc pour next)
      return;
    }

    const snap = await getDocs(q);
    console.log('[users] snap.size =', snap.size);

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

    // Marqueurs de pagination
    firstDoc = snap.docs[0];
    lastDoc  = snap.docs[snap.docs.length - 1];

    if (direction === 'first') {
      stack = [firstDoc];
    } else if (direction === 'next') {
      stack.push(firstDoc);
    } else if (direction === 'prev') {
      // on remonte d'une page : dépile l’ancienne "firstDoc"
      stack.pop();
      // par robustesse : met en cohérence l’entrée courante
      stack[stack.length - 1] = firstDoc;
    }

    pageInfo.textContent = `Affichés: ${snap.size}`;
    btnPrev.disabled = stack.length <= 1;
    btnNext.disabled = snap.size < PAGE_SIZE;
  } catch (err) {
    console.error('[users] loadPage error:', err);
    toast('Lecture des utilisateurs refusée ou erreur (voir console)');
    pageInfo.textContent = 'Erreur de lecture';
  }
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
    // recharge depuis la première page (simple et sûr)
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
  // Contrôle propre : auth + rôle admin (avec cache) + UI
  const user = await requireAdmin(true);
  if (!user) return;

  try {
    await loadPage('first');
  } catch (e) {
    console.error('[users] loadPage init error:', e);
    toast('Erreur de chargement de la liste (voir console)');
  }
})();
