// Page Administration – version robuste (priorité NOM partout)

import './app.js';
import { db } from './firebase-init.js';
import { requireAuth, badgeForStatus, badgeForPriority, formatDate, toast } from './app.js';

import {
  collection, query, orderBy, onSnapshot,
  updateDoc, deleteDoc, doc, getDoc, addDoc, serverTimestamp,
  getDocs, writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ────────────────────────────────────────────────
// DOM
// ────────────────────────────────────────────────
const elList       = document.getElementById('admin-list');
const elEmpty      = document.getElementById('admin-empty');
const filterStatus = document.getElementById('filter-status');
const inputSearch  = document.getElementById('search');

// ────────────────────────────────────────────────
// État
// ────────────────────────────────────────────────
let data = [];
let pendingDeleteId = null;
let modalDelete = null;

// ────────────────────────────────────────────────
// Utils
// ────────────────────────────────────────────────
function show(el, yes = true) {
  if (el) el.classList.toggle('d-none', !yes);
}

async function isUserAdmin(uid) {
  try {
    const snap = await getDoc(doc(db, 'admins', uid));
    return snap.exists();
  } catch (e) {
    console.error('[isUserAdmin] error', e);
    return false;
  }
}

// ────────────────────────────────────────────────
// Récupération nom d’affichage (très robuste)
// ────────────────────────────────────────────────
async function getDisplayName(user = null, uid = null) {
  const targetUid = uid || user?.uid;
  if (!targetUid) return 'Admin';

  // 1. Auth → le plus rapide et fiable
  if (user?.displayName?.trim()) {
    return user.displayName.trim();
  }

  // 2. Firestore /users/{uid}
  try {
    const userSnap = await getDoc(doc(db, 'users', targetUid));
    if (userSnap.exists()) {
      const data = userSnap.data();
      if (data.displayName?.trim()) {
        return data.displayName.trim();
      }
    }
  } catch (err) {
    console.warn('[getDisplayName] Firestore error for', targetUid, err);
  }

  // 3. Fallback email → prenom.nom
  if (user?.email) {
    return user.email.split('@')[0];
  }

  return 'Admin';
}

// ────────────────────────────────────────────────
// Suppression récursive history
// ────────────────────────────────────────────────
async function deleteCollection(colRef, batchSize = 400) {
  const snap = await getDocs(colRef);
  if (snap.empty) return;

  const batch = writeBatch(db);
  let ops = 0;

  snap.forEach(d => {
    batch.delete(d.ref);
    ops++;
    if (ops >= batchSize) return;
  });

  if (ops > 0) await batch.commit().catch(e => console.error('Batch commit error', e));

  if (snap.size >= batchSize) {
    await deleteCollection(colRef, batchSize);
  }
}

// ────────────────────────────────────────────────
// Rendu carte ticket
// ────────────────────────────────────────────────
function renderItem(d) {
  const t = d.data();
  const id = d.id;

  const details = `${badgeForStatus(t.status)} ${badgeForPriority(t.priority)} <span class="ms-2 text-muted small">${t.category}${t.type ? ' • ' + t.type : ''}</span>`;

  let takenInfo = '';
  if (t.takenBy && t.takenAt) {
    const date = t.takenAt.toDate ? t.takenAt.toDate() : new Date(t.takenAt);
    takenInfo = `<div class="text-success small mt-1">
      <i class="bi bi-person-check-fill me-1"></i>
      Pris en charge par <strong>${t.takenBy}</strong> le ${formatDate(date)}
    </div>`;
  }

  const meta = `Par ${t.email || t.createdBy || 'Inconnu'} • ${formatDate(t.createdAt)} • #${id}`;

  const deleteBtn = window.__isAdmin ? `<button type="button" class="btn btn-outline-danger btn-sm" title="Supprimer" data-delete="${id}"><i class="bi bi-trash"></i></button>` : '';

  const historyBtn = `<button type="button" class="btn btn-link btn-sm p-0 mt-2 text-decoration-none" data-history="${id}" title="Voir l’historique"><i class="bi bi-clock-history me-1"></i> Historique</button>`;

  return `
  <div class="card soft">
    <div class="card-body">
      <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
        <div style="flex: 1;">
          <h5 class="card-title mb-1">${t.title}</h5>
          <div class="mb-2">${details}</div>
          <div class="text-muted small">${meta}</div>
          ${takenInfo}
        </div>
        <div class="d-flex align-items-center gap-2">
          <select class="form-select form-select-sm" data-id="${id}" data-current="${t.status}">
            ${['Ouvert','En cours','En attente','Résolu','Fermé'].map(s => `<option ${s===t.status?'selected':''}>${s}</option>`).join('')}
          </select>
          ${deleteBtn}
        </div>
      </div>
      <p class="card-text mt-2">${(t.description||'').replace(/</g,'&lt;')}</p>
      ${historyBtn}
    </div>
  </div>`;
}

// ────────────────────────────────────────────────
// Rafraîchissement liste
// ────────────────────────────────────────────────
function refreshList() {
  const q = (inputSearch.value || '').toLowerCase();
  const fs = filterStatus.value;

  const filtered = data.filter(d => {
    const t = d.data();
    const matchStatus = fs ? t.status === fs : true;
    const hay = `${t.title} ${t.description} ${t.email} ${t.category} ${t.type||''}`.toLowerCase();
    return (fs === '' || matchStatus) && (!q || hay.includes(q));
  });

  elList.innerHTML = '';
  show(elEmpty, filtered.length === 0);
  filtered.forEach(d => elList.insertAdjacentHTML('beforeend', renderItem(d)));

  // Rafraîchissement async des noms dans les badges "Pris en charge par"
  setTimeout(async () => {
    const nameEls = document.querySelectorAll('.text-success strong');
    for (const el of nameEls) {
      const current = el.textContent.trim();
      if (current === 'Admin' || current.includes('@')) {
        const name = await getDisplayName(null, null); // fallback global pour l'admin courant
        el.textContent = name;
      }
    }
  }, 800); // léger délai pour que le DOM soit prêt
}

// ────────────────────────────────────────────────
// Listeners
// ────────────────────────────────────────────────
filterStatus?.addEventListener('change', refreshList);
inputSearch?.addEventListener('input', refreshList);

// Changement de statut
elList.addEventListener('change', async (e) => {
  const sel = e.target.closest('select[data-id]');
  if (!sel) return;

  const id = sel.getAttribute('data-id');
  const newStatus = sel.value;
  const oldStatus = sel.getAttribute('data-current');

  if (newStatus === oldStatus) return;

  const currentUser = window.__currentUser;
  const changedBy = await getDisplayName(currentUser);

  try {
    const ticketRef = doc(db, 'tickets', id);

    const historyEntry = {
      field: 'status',
      oldValue: oldStatus,
      newValue: newStatus,
      changedBy,
      changedAt: serverTimestamp()
    };

    const updateData = { status: newStatus };

    if (oldStatus === 'Ouvert' && newStatus === 'En cours') {
      updateData.takenBy = changedBy;
      updateData.takenAt = serverTimestamp();
    }

    await updateDoc(ticketRef, updateData);
    await addDoc(collection(ticketRef, 'history'), historyEntry);

    toast(`Statut → ${newStatus}`);
    sel.setAttribute('data-current', newStatus);
  } catch (err) {
    console.error('[update status] error', err);
    toast('Échec mise à jour');
    sel.value = oldStatus;
  }
});

// Suppression
elList.addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-delete]');
  if (!btn) return;
  pendingDeleteId = btn.getAttribute('data-delete');
  if (!modalDelete) modalDelete = new bootstrap.Modal(document.getElementById('confirmDelete'));
  modalDelete.show();
});

document.getElementById('btn-confirm-delete')?.addEventListener('click', async () => {
  if (!pendingDeleteId) return;
  try {
    const ticketRef = doc(db, 'tickets', pendingDeleteId);
    await deleteCollection(collection(ticketRef, 'history'));
    await deleteDoc(ticketRef);
    toast('Ticket et historique supprimés');
  } catch (e) {
    console.error('[delete ticket] error', e);
    toast('Échec suppression');
  } finally {
    pendingDeleteId = null;
    modalDelete?.hide();
  }
});

// Historique
elList.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-history]');
  if (!btn) return;

  const ticketId = btn.getAttribute('data-history');
  const content = document.getElementById('history-content');
  content.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></div>';

  const modal = new bootstrap.Modal(document.getElementById('historyModal'));
  modal.show();

  try {
    const q = query(collection(db, 'tickets', ticketId, 'history'), orderBy('changedAt', 'desc'));
    const snap = await getDocs(q);

    if (snap.empty) {
      content.innerHTML = '<p class="text-muted text-center py-3">Aucun changement enregistré.</p>';
      return;
    }

    let html = '';
    snap.forEach(ds => {
      const h = ds.data();
      const date = h.changedAt ? formatDate(h.changedAt.toDate ? h.changedAt.toDate() : new Date(h.changedAt)) : '?';

      html += `
        <div class="list-group-item">
          <div class="d-flex justify-content-between">
            <strong>${h.changedBy || 'Admin'}</strong>
            <small class="text-muted">${date}</small>
          </div>
          <div class="mt-1">
            ${h.oldValue ? `<span class="badge bg-secondary me-2">${h.oldValue}</span>` : '(nouveau)'}
            <i class="bi bi-arrow-right mx-2"></i>
            <span class="badge bg-primary">${h.newValue}</span>
          </div>
        </div>`;
    });

    content.innerHTML = html;
  } catch (err) {
    console.error('[load history] error', err);
    content.innerHTML = '<div class="alert alert-danger">Erreur chargement historique</div>';
  }
});

// ────────────────────────────────────────────────
// Initialisation
// ────────────────────────────────────────────────
(async () => {
  const user = await requireAuth(true);
  if (!user) return;

  const isAdmin = await isUserAdmin(user.uid);
  if (!isAdmin) {
    toast('Accès admin requis');
    setTimeout(() => location.href = 'tickets.html', 800);
    return;
  }

  onSnapshot(
    query(collection(db, 'tickets'), orderBy('createdAt', 'desc')),
    snap => {
      data = snap.docs;
      refreshList();
    },
    err => {
      console.error('[tickets snapshot] error', err);
      toast('Erreur chargement tickets');
      show(elEmpty, true);
    }
  );
})();
