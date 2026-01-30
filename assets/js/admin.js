import { db } from './firebase-init.js';
import { requireAuth, badgeForStatus, badgeForPriority, formatDate, toast } from './app.js';
import { collection, query, orderBy, onSnapshot, updateDoc, doc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const elList = document.getElementById('admin-list');
const elEmpty = document.getElementById('admin-empty');
const filterStatus = document.getElementById('filter-status');
const inputSearch = document.getElementById('search');

let data = [];

function renderItem(d) {
  const t = d.data();
  const id = d.id;
  return `
  <div class="card soft">
    <div class="card-body">
      <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
        <div>
          <h5 class="card-title mb-1">${t.title}</h5>
          <div class="mb-2">${badgeForStatus(t.status)} ${badgeForPriority(t.priority)} <span class="ms-2 text-muted small">${t.category}${t.type ? ' • ' + t.type : ''}</span></div>
          <div class="text-muted small">Par ${t.email||t.createdBy} • ${formatDate(t.createdAt)} • #${id}</div>
        </div>
        <div class="d-flex align-items-center gap-2">
          <select class="form-select form-select-sm" data-id="${id}" data-current="${t.status}">
            ${['Ouvert','En cours','En attente','Résolu','Fermé'].map(s=>`<option ${s===t.status?'selected':''}>${s}</option>`).join('')}
          </select>
        </div>
      </div>
      <p class="card-text mt-2">${(t.description||'').replace(/</g,'&lt;')}</p>
    </div>
  </div>`;
}

function refreshList() {
  const q = (inputSearch.value||'').toLowerCase();
  const fs = filterStatus.value;
  const filtered = data.filter(d => {
    const t = d.data();
    const matchStatus = fs ? t.status === fs : true;
    const hay = `${t.title} ${t.description} ${t.email} ${t.category} ${t.type||''}`.toLowerCase();
    const matchQuery = q ? hay.includes(q) : true;
    return matchStatus && matchQuery;
  });

  elList.innerHTML = '';
  if (filtered.length === 0) { elEmpty.classList.remove('d-none'); } else { elEmpty.classList.add('d-none'); }
  filtered.forEach(d => elList.insertAdjacentHTML('beforeend', renderItem(d)));

  // change handlers for status selects
  elList.querySelectorAll('select[data-id]').forEach(sel => {
    sel.addEventListener('change', async (e) => {
      const id = e.target.getAttribute('data-id');
      const newStatus = e.target.value;
      try {
        await updateDoc(doc(db, 'tickets', id), { status: newStatus });
        toast('Statut mis à jour');
      } catch (err) {
        toast('Maj refusée: ' + (err?.message||err));
        e.target.value = e.target.getAttribute('data-current');
      }
    });
  });
}

(async () => {
  const user = await requireAuth(true);
  if (!user) return;

  const q = query(collection(db, 'tickets'), orderBy('createdAt','desc'));
  onSnapshot(q, (snap) => {
    data = snap.docs;
    refreshList();
  }, (err) => {
    toast('Accès refusé: compte non admin');
    elList.innerHTML = '';
    elEmpty.classList.remove('d-none');
  });

  filterStatus.addEventListener('change', refreshList);
  inputSearch.addEventListener('input', refreshList);
})();
