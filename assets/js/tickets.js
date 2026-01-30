// assets/js/tickets.js
import { db } from './firebase-init.js';
import { requireAuth, badgeForStatus, badgeForPriority, formatDate, toast } from './app.js';
import { collection, query, where, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const elList = document.getElementById('list');
const elEmpty = document.getElementById('empty');
const filterStatus = document.getElementById('filter-status');
const filterCategory = document.getElementById('filter-category');

let unsub = null;

function render(docSnap) {
  const t = docSnap.data();
  const id = docSnap.id;
  return `
  <div class="card soft">
    <div class="card-body">
      <div class="d-flex justify-content-between align-items-start">
        <div>
          <h5 class="card-title mb-1">${t.title}</h5>
          <div class="mb-2">${badgeForStatus(t.status)} ${badgeForPriority(t.priority)} <span class="ms-2 text-muted small">${t.category}${t.type ? ' • ' + t.type : ''}</span></div>
        </div>
        <div class="text-muted small">${formatDate(t.createdAt)}</div>
      </div>
      <p class="card-text">${(t.description||'').replace(/</g,'&lt;')}</p>
      <div class="text-muted small">Ticket #${id}</div>
    </div>
  </div>`;
}

function buildQuery(user) {
  const clauses = [ where('createdBy', '==', user.uid) ];
  if (filterStatus.value)   clauses.push(where('status',   '==', filterStatus.value));
  if (filterCategory.value) clauses.push(where('category', '==', filterCategory.value));
  // IMPORTANT : on finit par un tri sur createdAt
  return query(collection(db, 'tickets'), ...clauses, orderBy('createdAt', 'desc'));
}

async function attach(user) {
  if (unsub) unsub();
  elList.innerHTML = '';
  elEmpty.classList.add('d-none');

  const q = buildQuery(user);

  unsub = onSnapshot(q,
    (snap) => {
      elList.innerHTML = '';
      if (snap.empty) {
        elEmpty.classList.remove('d-none');
        return;
      }
      elEmpty.classList.add('d-none');
      snap.forEach((d) => elList.insertAdjacentHTML('beforeend', render(d)));
    },
    (err) => {
      console.error('[tickets] onSnapshot error:', err);

      // Messages utiles selon la cause
      const msg = String(err?.message || '');
      if (err?.code === 'failed-precondition' || msg.includes('index')) {
        toast('Cette recherche nécessite un index Firestore. Ouvre la console pour suivre le lien proposé.');
      } else if (err?.code === 'permission-denied') {
        toast('Permissions insuffisantes pour lire les tickets (vérifiez les règles Firestore).');
      } else {
        toast('Erreur de lecture des tickets : ' + (err?.message || err));
      }

      // Afficher l’état vide pour ne pas laisser la page blanche
      elList.innerHTML = '';
      elEmpty.classList.remove('d-none');
    }
  );
}

(async () => {
  const user = await requireAuth(true);
  if (!user) return;
  await attach(user);

  filterStatus.addEventListener('change', () => attach(user));
  filterCategory.addEventListener('change', () => attach(user));
})();
