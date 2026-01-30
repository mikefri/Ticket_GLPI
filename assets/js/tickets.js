import { db } from './firebase-init.js';
import { requireAuth, badgeForStatus, badgeForPriority, formatDate } from './app.js';
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

async function attach(user) {
  if (unsub) unsub();
  elList.innerHTML = '';

  const clauses = [ where('createdBy', '==', user.uid) ];
  if (filterStatus.value) clauses.push(where('status', '==', filterStatus.value));
  if (filterCategory.value) clauses.push(where('category', '==', filterCategory.value));

  const q = query(collection(db, 'tickets'), ...clauses, orderBy('createdAt','desc'));
  unsub = onSnapshot(q, (snap) => {
    elList.innerHTML = '';
    if (snap.empty) { elEmpty.classList.remove('d-none'); } else { elEmpty.classList.add('d-none'); }
    snap.forEach((d) => { elList.insertAdjacentHTML('beforeend', render(d)); });
  });
}

(async () => {
  const user = await requireAuth(true);
  if (!user) return;
  await attach(user);

  filterStatus.addEventListener('change', () => attach(user));
  filterCategory.addEventListener('change', () => attach(user));
})();
