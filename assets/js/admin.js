// Page Administration – version robuste (priorité NOM partout)

import './app.js';
import { db } from './firebase-init.js';
import { requireAuth, badgeForStatus, badgeForPriority, formatDate, toast } from './app.js';

import {
  collection, query, orderBy, onSnapshot,
  updateDoc, deleteDoc, doc, getDoc, addDoc, serverTimestamp,
  getDocs, writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

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
let modalEdit = null;
let currentEditId = null;

// ────────────────────────────────────────────────
// Ordre de tri
// ────────────────────────────────────────────────
const STATUS_ORDER   = { 'Ouvert': 0, 'En cours': 1, 'En attente': 2, 'Résolu': 3, 'Fermé': 4 };
const PRIORITY_ORDER = { 'Critique': 0, 'Haute': 1, 'Moyenne': 2, 'Basse': 3 };

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
// Récupération nom d'affichage (très robuste)
// ────────────────────────────────────────────────
async function getDisplayName(user = null, uid = null) {
  const targetUid = uid || user?.uid;
  if (!targetUid) return 'Admin';

  // 1. Auth → le plus rapide et fiable
  if (user?.displayName?.trim()) {
    return user.displayName.trim();
  }

  // 2. Firestore /admins/{uid}
  try {
    const adminSnap = await getDoc(doc(db, 'admins', targetUid));
    if (adminSnap.exists()) {
      const data = adminSnap.data();
      if (data.displayName?.trim()) {
        return data.displayName.trim();
      }
    }
  } catch (err) {
    console.warn('[getDisplayName] Admins lookup error for', targetUid, err);
  }

  // 3. Firestore /users/{uid} (fallback)
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

  // 4. Fallback email → prenom.nom
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
    takenInfo = `<div class="text-success small mt-1" data-uid="${t.takenByUid || ''}">
      <i class="bi bi-person-check-fill me-1"></i>
      Pris en charge par <strong>${t.takenBy}</strong> le ${formatDate(date)}
    </div>`;
  }

  const authorName = t.userName || t.displayName || (t.email ? t.email.split('@')[0] : t.createdBy) || 'Inconnu';
  const meta = `Par ${authorName} • ${formatDate(t.createdAt)}`;

  const editBtn = window.__isAdmin ? `<button type="button" class="btn btn-outline-primary btn-sm" title="Modifier" data-edit="${id}"><i class="bi bi-pencil"></i></button>` : '';
  const deleteBtn = window.__isAdmin ? `<button type="button" class="btn btn-outline-danger btn-sm" title="Supprimer" data-delete="${id}"><i class="bi bi-trash"></i></button>` : '';

  const historyBtn = `<button type="button" class="btn btn-link btn-sm p-0 mt-2 text-decoration-none" data-history="${id}" title="Voir l'historique"><i class="bi bi-clock-history me-1"></i> Historique</button>`;

  return `
  <div class="card soft">
    <div class="card-body">
      <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
        <div style="flex: 1;">
          <h5 class="card-title mb-1">
            <a href="ticket-detail.html?id=${id}"
               class="text-decoration-none text-dark fw-semibold"
               title="Voir le détail">
              ${t.title}
              <i class="bi bi-box-arrow-up-right ms-1 small opacity-50"></i>
            </a>
          </h5>
          <div class="mb-2">${details}</div>
          <div class="text-muted small">${meta}</div>
          ${takenInfo}
        </div>
        <div class="d-flex align-items-center gap-2">
          <select class="form-select form-select-sm" data-id="${id}" data-current="${t.status}">
            ${['Ouvert','En cours','En attente','Résolu','Fermé'].map(s => `<option ${s===t.status?'selected':''}>${s}</option>`).join('')}
          </select>
          ${editBtn}
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

  // Tri : statut (Ouvert → Fermé) puis priorité (Critique → Basse)
  filtered.sort((a, b) => {
    const ta = a.data();
    const tb = b.data();
    const statusDiff = (STATUS_ORDER[ta.status] ?? 99) - (STATUS_ORDER[tb.status] ?? 99);
    if (statusDiff !== 0) return statusDiff;
    return (PRIORITY_ORDER[ta.priority] ?? 99) - (PRIORITY_ORDER[tb.priority] ?? 99);
  });

  elList.innerHTML = '';
  show(elEmpty, filtered.length === 0);
  filtered.forEach(d => elList.insertAdjacentHTML('beforeend', renderItem(d)));

  // Rafraîchissement async des noms dans les badges "Pris en charge par"
  setTimeout(async () => {
    const containers = document.querySelectorAll('.text-success[data-uid]');
    for (const container of containers) {
      const uid = container.getAttribute('data-uid');
      const strongEl = container.querySelector('strong');

      if (strongEl) {
        if (uid) {
          const name = await getDisplayName(null, uid);
          strongEl.textContent = name;
        } else {
          const auth = getAuth();
          const currentUser = auth.currentUser;
          if (currentUser) {
            const name = await getDisplayName(currentUser, currentUser.uid);
            strongEl.textContent = name;
          }
        }
      }
    }
  }, 800);
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

  const auth = getAuth();
  const currentUser = auth.currentUser;

  if (!currentUser) {
    toast('Utilisateur non connecté');
    sel.value = oldStatus;
    return;
  }

  const changedBy = await getDisplayName(currentUser, currentUser.uid);

  try {
    const ticketRef = doc(db, 'tickets', id);

    const historyEntry = {
      field: 'status',
      oldValue: oldStatus,
      newValue: newStatus,
      changedBy,
      changedByUid: currentUser.uid,
      changedAt: serverTimestamp()
    };

    const updateData = { status: newStatus };

    // Si passage de Ouvert à En cours → enregistrer la prise en charge
    if (oldStatus === 'Ouvert' && newStatus === 'En cours') {
      updateData.takenBy = changedBy;
      updateData.takenByUid = currentUser.uid;
      updateData.takenAt = serverTimestamp();
    }

    // Si passage à Résolu ou Fermé → enregistrer la date de fermeture
    if (newStatus === 'Résolu' || newStatus === 'Fermé') {
      updateData.closedAt = serverTimestamp();
      updateData.closedBy = changedBy;
      updateData.closedByUid = currentUser.uid;
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

// Édition
elList.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-edit]');
  if (!btn) return;

  currentEditId = btn.getAttribute('data-edit');

  try {
    const ticketRef = doc(db, 'tickets', currentEditId);
    const ticketSnap = await getDoc(ticketRef);

    if (!ticketSnap.exists()) {
      toast('Ticket introuvable');
      return;
    }

    const t = ticketSnap.data();

    document.getElementById('edit-title').value = t.title || '';
    document.getElementById('edit-description').value = t.description || '';
    document.getElementById('edit-category').value = t.category || '';
    document.getElementById('edit-type').value = t.type || '';
    document.getElementById('edit-priority').value = t.priority || 'Moyenne';

    if (!modalEdit) modalEdit = new bootstrap.Modal(document.getElementById('editModal'));
    modalEdit.show();
  } catch (err) {
    console.error('[load ticket for edit] error', err);
    toast('Erreur chargement du ticket');
  }
});

// Sauvegarde de l'édition
document.getElementById('btn-save-edit')?.addEventListener('click', async () => {
  if (!currentEditId) return;

  const auth = getAuth();
  const currentUser = auth.currentUser;

  if (!currentUser) {
    toast('Utilisateur non connecté');
    return;
  }

  const newTitle       = document.getElementById('edit-title').value.trim();
  const newDescription = document.getElementById('edit-description').value.trim();
  const newCategory    = document.getElementById('edit-category').value;
  const newType        = document.getElementById('edit-type').value;
  const newPriority    = document.getElementById('edit-priority').value;

  if (!newTitle || !newDescription) {
    toast('Titre et description requis');
    return;
  }

  try {
    const ticketRef  = doc(db, 'tickets', currentEditId);
    const ticketSnap = await getDoc(ticketRef);
    const oldData    = ticketSnap.data();

    const changedBy = await getDisplayName(currentUser, currentUser.uid);
    const changes   = [];

    const fields = [
      { key: 'title',       oldVal: oldData.title,       newVal: newTitle },
      { key: 'description', oldVal: oldData.description, newVal: newDescription },
      { key: 'category',    oldVal: oldData.category,    newVal: newCategory },
      { key: 'type',        oldVal: oldData.type,        newVal: newType },
      { key: 'priority',    oldVal: oldData.priority,    newVal: newPriority },
    ];

    for (const f of fields) {
      if (f.oldVal !== f.newVal) {
        changes.push({
          field: f.key,
          oldValue: f.oldVal,
          newValue: f.newVal,
          changedBy,
          changedByUid: currentUser.uid,
          changedAt: serverTimestamp()
        });
      }
    }

    await updateDoc(ticketRef, {
      title: newTitle,
      description: newDescription,
      category: newCategory,
      type: newType,
      priority: newPriority,
      updatedAt: serverTimestamp()
    });

    for (const change of changes) {
      await addDoc(collection(ticketRef, 'history'), change);
    }

    toast('Ticket modifié avec succès');
    modalEdit?.hide();
    currentEditId = null;
  } catch (err) {
    console.error('[save edit] error', err);
    toast('Échec de la modification');
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
  const content  = document.getElementById('history-content');
  content.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></div>';

  const modal = new bootstrap.Modal(document.getElementById('historyModal'));
  modal.show();

  try {
    const q    = query(collection(db, 'tickets', ticketId, 'history'), orderBy('changedAt', 'desc'));
    const snap = await getDocs(q);

    if (snap.empty) {
      content.innerHTML = '<p class="text-muted text-center py-3">Aucun changement enregistré.</p>';
      return;
    }

    let html = '';
    snap.forEach(ds => {
      const h    = ds.data();
      const date = h.changedAt ? formatDate(h.changedAt.toDate ? h.changedAt.toDate() : new Date(h.changedAt)) : '?';

      let changeDisplay = '';
      if (h.field === 'title' || h.field === 'description') {
        changeDisplay = `
          <div class="mt-1">
            <small class="text-muted">Champ modifié : <strong>${h.field === 'title' ? 'Titre' : 'Description'}</strong></small>
          </div>`;
      } else {
        changeDisplay = `
          <div class="mt-1">
            ${h.oldValue ? `<span class="badge bg-secondary me-2">${h.oldValue}</span>` : '(nouveau)'}
            <i class="bi bi-arrow-right mx-2"></i>
            <span class="badge bg-primary">${h.newValue}</span>
          </div>`;
      }

      html += `
        <div class="list-group-item">
          <div class="d-flex justify-content-between">
            <strong>${h.changedBy || 'Admin'}</strong>
            <small class="text-muted">${date}</small>
          </div>
          ${changeDisplay}
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
