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

// ── NOUVEAU : état modal affectation ──
let modalAssign = null;
let currentAssignId = null;
let allUsers = [];      // cache [{uid, name, role}]

// ────────────────────────────────────────────────
// Ordres de tri
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
// Récupération nom d'affichage (robuste)
// ────────────────────────────────────────────────
async function getDisplayName(user = null, uid = null) {
  const targetUid = uid || user?.uid;
  if (!targetUid) return 'Admin';

  if (user?.displayName?.trim()) return user.displayName.trim();

  try {
    const adminSnap = await getDoc(doc(db, 'admins', targetUid));
    if (adminSnap.exists()) {
      const d = adminSnap.data();
      if (d.displayName?.trim()) return d.displayName.trim();
    }
  } catch (err) {}

  try {
    const userSnap = await getDoc(doc(db, 'users', targetUid));
    if (userSnap.exists()) {
      const d = userSnap.data();
      if (d.displayName?.trim()) return d.displayName.trim();
    }
  } catch (err) {}

  if (user?.email) return user.email.split('@')[0];
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
  if (snap.size >= batchSize) await deleteCollection(colRef, batchSize);
}

// ────────────────────────────────────────────────
// Rendu carte ticket
// ────────────────────────────────────────────────
function renderItem(d) {
  const t  = d.data();
  const id = d.id;

  const details = `${badgeForStatus(t.status)} ${badgeForPriority(t.priority)} <span class="ms-2 text-muted small">${t.category}${t.type ? ' • ' + t.type : ''}</span>`;

  // Bandeau vert "Pris en charge" OU "Affecté à"
  let takenInfo = '';
  if (t.assignedTo) {
    // Affectation manuelle (priorité sur takenBy)
    takenInfo = `<div class="text-success small mt-1">
      <i class="bi bi-person-fill-check me-1"></i>
      Affecté à <strong>${t.assignedTo}</strong>
      ${t.assignedAt ? `le ${formatDate(t.assignedAt.toDate ? t.assignedAt.toDate() : new Date(t.assignedAt))}` : ''}
    </div>`;
  } else if (t.takenBy && t.takenAt) {
    const date = t.takenAt.toDate ? t.takenAt.toDate() : new Date(t.takenAt);
    takenInfo = `<div class="text-success small mt-1" data-uid="${t.takenByUid || ''}">
      <i class="bi bi-person-check-fill me-1"></i>
      Pris en charge par <strong>${t.takenBy}</strong> le ${formatDate(date)}
    </div>`;
  }

  const authorName = t.userName || t.displayName || (t.email ? t.email.split('@')[0] : t.createdBy) || 'Inconnu';
  const meta = `Par ${authorName} • ${formatDate(t.createdAt)}`;

  // Bouton Affecter (toujours visible pour les admins)
  const assignBtn = window.__isAdmin
    ? `<button type="button" class="btn btn-outline-success btn-sm" title="Affecter à…" data-assign="${id}">
         <i class="bi bi-person-plus"></i>
       </button>`
    : '';

  const editBtn   = window.__isAdmin ? `<button type="button" class="btn btn-outline-primary btn-sm" title="Modifier" data-edit="${id}"><i class="bi bi-pencil"></i></button>` : '';
  const deleteBtn = window.__isAdmin ? `<button type="button" class="btn btn-outline-danger btn-sm" title="Supprimer" data-delete="${id}"><i class="bi bi-trash"></i></button>` : '';

  const historyBtn = `<button type="button" class="btn btn-link btn-sm p-0 mt-2 text-decoration-none" data-history="${id}" title="Voir l'historique"><i class="bi bi-clock-history me-1"></i> Historique</button>`;

  return `
  <div class="card soft">
    <div class="card-body">
      <div class="d-flex justify-content-between align-items-start flex-wrap gap-2">
        <div style="flex: 1;">
          <h5 class="card-title mb-1">
            <a href="ticket-detail.html?id=${id}"
               class="text-decoration-none text-dark fw-semibold" title="Voir le détail">
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
          ${assignBtn}
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
  const q  = (inputSearch.value || '').toLowerCase();
  const fs = filterStatus.value;

  const filtered = data.filter(d => {
    const t = d.data();
    const matchStatus = fs ? t.status === fs : true;
    const hay = `${t.title} ${t.description} ${t.email} ${t.category} ${t.type||''}`.toLowerCase();
    return (fs === '' || matchStatus) && (!q || hay.includes(q));
  });

  filtered.sort((a, b) => {
    const ta = a.data(), tb = b.data();
    const statusDiff = (STATUS_ORDER[ta.status] ?? 99) - (STATUS_ORDER[tb.status] ?? 99);
    if (statusDiff !== 0) return statusDiff;
    return (PRIORITY_ORDER[ta.priority] ?? 99) - (PRIORITY_ORDER[tb.priority] ?? 99);
  });

  elList.innerHTML = '';
  show(elEmpty, filtered.length === 0);
  filtered.forEach(d => elList.insertAdjacentHTML('beforeend', renderItem(d)));

  // Refresh async noms takenBy
  setTimeout(async () => {
    const containers = document.querySelectorAll('.text-success[data-uid]');
    for (const container of containers) {
      const uid = container.getAttribute('data-uid');
      const strongEl = container.querySelector('strong');
      if (strongEl) {
        if (uid) {
          strongEl.textContent = await getDisplayName(null, uid);
        } else {
          const auth = getAuth();
          const currentUser = auth.currentUser;
          if (currentUser) strongEl.textContent = await getDisplayName(currentUser, currentUser.uid);
        }
      }
    }
  }, 800);
}

// ────────────────────────────────────────────────
// Listeners existants
// ────────────────────────────────────────────────
filterStatus?.addEventListener('change', refreshList);
inputSearch?.addEventListener('input', refreshList);

// Changement de statut
elList.addEventListener('change', async (e) => {
  const sel = e.target.closest('select[data-id]');
  if (!sel) return;

  const id        = sel.getAttribute('data-id');
  const newStatus = sel.value;
  const oldStatus = sel.getAttribute('data-current');
  if (newStatus === oldStatus) return;

  const auth = getAuth();
  const currentUser = auth.currentUser;
  if (!currentUser) { toast('Utilisateur non connecté'); sel.value = oldStatus; return; }

  const changedBy = await getDisplayName(currentUser, currentUser.uid);

  try {
    const ticketRef    = doc(db, 'tickets', id);
    const historyEntry = { field: 'status', oldValue: oldStatus, newValue: newStatus, changedBy, changedByUid: currentUser.uid, changedAt: serverTimestamp() };
    const updateData   = { status: newStatus };

    if (oldStatus === 'Ouvert' && newStatus === 'En cours') {
      updateData.takenBy    = changedBy;
      updateData.takenByUid = currentUser.uid;
      updateData.takenAt    = serverTimestamp();
    }
    if (newStatus === 'Résolu' || newStatus === 'Fermé') {
      updateData.closedAt    = serverTimestamp();
      updateData.closedBy    = changedBy;
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
    const ticketSnap = await getDoc(doc(db, 'tickets', currentEditId));
    if (!ticketSnap.exists()) { toast('Ticket introuvable'); return; }
    const t = ticketSnap.data();
    document.getElementById('edit-title').value       = t.title       || '';
    document.getElementById('edit-description').value = t.description || '';
    document.getElementById('edit-category').value    = t.category    || '';
    document.getElementById('edit-type').value        = t.type        || '';
    document.getElementById('edit-priority').value    = t.priority    || 'Moyenne';
    if (!modalEdit) modalEdit = new bootstrap.Modal(document.getElementById('editModal'));
    modalEdit.show();
  } catch (err) { console.error('[load ticket for edit]', err); toast('Erreur chargement du ticket'); }
});

document.getElementById('btn-save-edit')?.addEventListener('click', async () => {
  if (!currentEditId) return;
  const auth = getAuth();
  const currentUser = auth.currentUser;
  if (!currentUser) { toast('Utilisateur non connecté'); return; }

  const newTitle       = document.getElementById('edit-title').value.trim();
  const newDescription = document.getElementById('edit-description').value.trim();
  const newCategory    = document.getElementById('edit-category').value;
  const newType        = document.getElementById('edit-type').value;
  const newPriority    = document.getElementById('edit-priority').value;

  if (!newTitle || !newDescription) { toast('Titre et description requis'); return; }

  try {
    const ticketRef  = doc(db, 'tickets', currentEditId);
    const oldData    = (await getDoc(ticketRef)).data();
    const changedBy  = await getDisplayName(currentUser, currentUser.uid);
    const fields     = [
      { key: 'title',       oldVal: oldData.title,       newVal: newTitle },
      { key: 'description', oldVal: oldData.description, newVal: newDescription },
      { key: 'category',    oldVal: oldData.category,    newVal: newCategory },
      { key: 'type',        oldVal: oldData.type,        newVal: newType },
      { key: 'priority',    oldVal: oldData.priority,    newVal: newPriority },
    ];

    await updateDoc(ticketRef, { title: newTitle, description: newDescription, category: newCategory, type: newType, priority: newPriority, updatedAt: serverTimestamp() });

    for (const f of fields) {
      if (f.oldVal !== f.newVal) {
        await addDoc(collection(ticketRef, 'history'), {
          field: f.key, oldValue: f.oldVal, newValue: f.newVal,
          changedBy, changedByUid: currentUser.uid, changedAt: serverTimestamp()
        });
      }
    }
    toast('Ticket modifié avec succès');
    modalEdit?.hide();
    currentEditId = null;
  } catch (err) { console.error('[save edit]', err); toast('Échec de la modification'); }
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
  } catch (e) { console.error('[delete ticket]', e); toast('Échec suppression'); }
  finally { pendingDeleteId = null; modalDelete?.hide(); }
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

    if (snap.empty) { content.innerHTML = '<p class="text-muted text-center py-3">Aucun changement enregistré.</p>'; return; }

    let html = '';
    snap.forEach(ds => {
      const h    = ds.data();
      const date = h.changedAt ? formatDate(h.changedAt.toDate ? h.changedAt.toDate() : new Date(h.changedAt)) : '?';
      let changeDisplay = '';
      if (h.field === 'title' || h.field === 'description') {
        changeDisplay = `<div class="mt-1"><small class="text-muted">Champ modifié : <strong>${h.field === 'title' ? 'Titre' : 'Description'}</strong></small></div>`;
      } else {
        changeDisplay = `<div class="mt-1">
          ${h.oldValue ? `<span class="badge bg-secondary me-2">${h.oldValue}</span>` : '(nouveau)'}
          <i class="bi bi-arrow-right mx-2"></i>
          <span class="badge bg-primary">${h.newValue}</span>
        </div>`;
      }
      html += `<div class="list-group-item">
        <div class="d-flex justify-content-between">
          <strong>${h.changedBy || 'Admin'}</strong>
          <small class="text-muted">${date}</small>
        </div>
        ${changeDisplay}
      </div>`;
    });
    content.innerHTML = html;
  } catch (err) { console.error('[load history]', err); content.innerHTML = '<div class="alert alert-danger">Erreur chargement historique</div>'; }
});

// ════════════════════════════════════════════════
//  NOUVEAU : Affectation d'un ticket
// ════════════════════════════════════════════════

/**
 * Charge tous les utilisateurs (collections "users" et "admins")
 * et retourne un tableau [{uid, name, role}] dédupliqué.
 */
async function loadAllUsers() {
  if (allUsers.length > 0) return allUsers; // cache

  const result = [];
  const seen   = new Set();

  // --- admins ---
  try {
    const adminSnap = await getDocs(collection(db, 'admins'));
    adminSnap.forEach(d => {
      const data = d.data();
      const name = data.displayName?.trim() || data.email?.split('@')[0] || d.id;
      if (!seen.has(d.id)) {
        seen.add(d.id);
        result.push({ uid: d.id, name, role: 'Admin', email: data.email || '' });
      }
    });
  } catch (err) { console.warn('[loadAllUsers] admins', err); }

  // --- users ---
  try {
    const userSnap = await getDocs(collection(db, 'users'));
    userSnap.forEach(d => {
      const data = d.data();
      const name = data.displayName?.trim() || data.email?.split('@')[0] || d.id;
      if (!seen.has(d.id)) {
        seen.add(d.id);
        result.push({ uid: d.id, name, role: 'Utilisateur', email: data.email || '' });
      }
    });
  } catch (err) { console.warn('[loadAllUsers] users', err); }

  // Tri alpha
  result.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  allUsers = result;
  return allUsers;
}

/** Affiche la liste filtrée dans le modal */
function renderAssignList(users, currentAssignedUid = null) {
  const listEl  = document.getElementById('assign-user-list');
  const emptyEl = document.getElementById('assign-empty');

  if (users.length === 0) {
    show(listEl, false);
    show(emptyEl, true);
    return;
  }

  show(emptyEl, false);
  listEl.innerHTML = users.map(u => {
    const isActive = u.uid === currentAssignedUid;
    return `
      <button type="button"
              class="list-group-item list-group-item-action d-flex justify-content-between align-items-center py-2
                     ${isActive ? 'active' : ''}"
              data-assign-uid="${u.uid}"
              data-assign-name="${u.name}">
        <span>
          <i class="bi bi-person-circle me-2 opacity-50"></i>
          <strong>${u.name}</strong>
          ${u.email ? `<small class="text-muted ms-2">${u.email}</small>` : ''}
        </span>
        <span class="badge ${u.role === 'Admin' ? 'bg-warning text-dark' : 'bg-secondary'} ms-2">
          ${u.role}
        </span>
      </button>`;
  }).join('');

  show(listEl, true);
}

// Ouvrir le modal d'affectation
elList.addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-assign]');
  if (!btn) return;

  currentAssignId = btn.getAttribute('data-assign');

  // Récupérer le ticket pour connaître l'assigné actuel
  let currentAssignedUid = null;
  try {
    const snap = await getDoc(doc(db, 'tickets', currentAssignId));
    if (snap.exists()) {
      currentAssignedUid = snap.data().assignedToUid || null;
      // Afficher le bouton "Retirer" seulement si déjà assigné
      show(document.getElementById('assign-unassign-wrap'), !!snap.data().assignedTo);
    }
  } catch (err) { console.warn('[assign] getDoc', err); }

  // Préparer le modal
  const loadingEl = document.getElementById('assign-loading');
  const listEl    = document.getElementById('assign-user-list');
  const searchEl  = document.getElementById('assign-search');
  searchEl.value  = '';

  show(loadingEl, true);
  show(listEl, false);

  if (!modalAssign) modalAssign = new bootstrap.Modal(document.getElementById('assignModal'));
  modalAssign.show();

  // Charger les utilisateurs
  const users = await loadAllUsers();
  show(loadingEl, false);
  renderAssignList(users, currentAssignedUid);

  // Filtre en temps réel
  searchEl.oninput = () => {
    const q = searchEl.value.toLowerCase();
    const filtered = users.filter(u =>
      u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
    renderAssignList(filtered, currentAssignedUid);
  };
});

// Clic sur un utilisateur dans la liste → affecter
document.getElementById('assign-user-list')?.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-assign-uid]');
  if (!btn || !currentAssignId) return;

  const uid  = btn.getAttribute('data-assign-uid');
  const name = btn.getAttribute('data-assign-name');

  const auth = getAuth();
  const currentUser = auth.currentUser;
  const changedBy   = currentUser ? await getDisplayName(currentUser, currentUser.uid) : 'Admin';

  try {
    const ticketRef = doc(db, 'tickets', currentAssignId);
    await updateDoc(ticketRef, {
      assignedTo:    name,
      assignedToUid: uid,
      assignedAt:    serverTimestamp(),
      assignedBy:    changedBy,
      assignedByUid: currentUser?.uid || null,
    });
    await addDoc(collection(ticketRef, 'history'), {
      field:         'assignedTo',
      oldValue:      null,
      newValue:      name,
      changedBy,
      changedByUid:  currentUser?.uid || null,
      changedAt:     serverTimestamp()
    });

    toast(`Ticket affecté à ${name}`);
    modalAssign?.hide();
    currentAssignId = null;
  } catch (err) {
    console.error('[assign ticket]', err);
    toast('Échec de l\'affectation');
  }
});

// Retirer l'affectation
document.getElementById('btn-unassign')?.addEventListener('click', async () => {
  if (!currentAssignId) return;
  const auth = getAuth();
  const currentUser = auth.currentUser;
  const changedBy   = currentUser ? await getDisplayName(currentUser, currentUser.uid) : 'Admin';

  try {
    const ticketRef = doc(db, 'tickets', currentAssignId);
    const snap      = await getDoc(ticketRef);
    const oldName   = snap.data()?.assignedTo || '?';

    await updateDoc(ticketRef, {
      assignedTo:    null,
      assignedToUid: null,
      assignedAt:    null,
      assignedBy:    null,
      assignedByUid: null,
    });
    await addDoc(collection(ticketRef, 'history'), {
      field:         'assignedTo',
      oldValue:      oldName,
      newValue:      null,
      changedBy,
      changedByUid:  currentUser?.uid || null,
      changedAt:     serverTimestamp()
    });

    toast('Affectation retirée');
    modalAssign?.hide();
    currentAssignId = null;
  } catch (err) {
    console.error('[unassign ticket]', err);
    toast('Échec suppression affectation');
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
    snap => { data = snap.docs; refreshList(); },
    err  => { console.error('[tickets snapshot]', err); toast('Erreur chargement tickets'); show(elEmpty, true); }
  );
})();
