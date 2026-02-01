// ------------------------------------------------------------
// Page Administration : liste les tickets, mise à jour de statut avec historique,
// affichage historique via modal, suppression avec nettoyage history
// Accès réservé aux admins.
// ------------------------------------------------------------

import './app.js'; // monte navbar + badge + helpers
import { db } from './firebase-init.js';
import { requireAuth, badgeForStatus, badgeForPriority, formatDate, toast } from './app.js';

import {
  collection,
  query,
  orderBy,
  onSnapshot,
  updateDoc,
  deleteDoc,
  doc,
  getDoc,
  addDoc,
  serverTimestamp,
  getDocs,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ---------- Eléments ----------
const elList       = document.getElementById('admin-list');
const elEmpty      = document.getElementById('admin-empty');
const filterStatus = document.getElementById('filter-status');
const inputSearch  = document.getElementById('search');

// ---------- Etat ----------
let data = []; // snapshot docs (Firestore)
let pendingDeleteId = null;
let modalDelete = null;

// ---------- Utils ----------
function show(el, yes = true) {
  if (el) el.classList.toggle('d-none', !yes);
}

// Vérifie le rôle admin via /admins/{uid}
async function isUserAdmin(uid) {
  try {
    const snap = await getDoc(doc(db, 'admins', uid));
    return snap.exists();
  } catch (e) {
    console.error('[admin] isUserAdmin failed:', e);
    return false;
  }
}

// Helper : suppression récursive d'une collection (par batches simples)
async function deleteCollection(collectionRef, batchSize = 400) {
  const querySnapshot = await getDocs(collectionRef);
  if (querySnapshot.empty) return;

  const batch = writeBatch(db);
  let ops = 0;

  querySnapshot.forEach((docSnap) => {
    batch.delete(docSnap.ref);
    ops++;

    if (ops >= batchSize) {
      // On commit partiel (limite 500 ops/batch)
      batch.commit().catch(err => console.error("Batch commit error:", err));
      return; // Pour éviter de continuer la boucle après commit
    }
  });

  // Commit final si reste des ops
  if (ops > 0) {
    await batch.commit().catch(err => console.error("Final batch error:", err));
  }

  // Si > batchSize → on rappelle récursivement (rare pour history)
  if (querySnapshot.size >= batchSize) {
    await deleteCollection(collectionRef, batchSize);
  }
}

// Rendu d'une carte ticket
function renderItem(d) {
  const t = d.data();
  const id = d.id;

  const details =
    `${badgeForStatus(t.status)} ${badgeForPriority(t.priority)} ` +
    `<span class="ms-2 text-muted small">${t.category}${t.type ? ' • ' + t.type : ''}</span>`;

  let takenInfo = '';
  if (t.takenBy && t.takenAt) {
    const takenDate = t.takenAt.toDate ? t.takenAt.toDate() : new Date(t.takenAt);
    takenInfo = `<div class="text-success small mt-1">
      <i class="bi bi-person-check-fill me-1"></i>
      Pris en charge par <strong>${t.takenBy}</strong> le ${formatDate(takenDate)}
    </div>`;
  }

  const meta =
    `Par ${t.email || t.createdBy} • ${formatDate(t.createdAt)} • #${id}`;

  const deleteBtn = window.__isAdmin
    ? `<button type="button" class="btn btn-outline-danger btn-sm"
               title="Supprimer ce ticket" aria-label="Supprimer ce ticket"
               data-delete="${id}">
         <i class="bi bi-trash"></i>
       </button>`
    : '';

  const historyBtn = `
    <button type="button" class="btn btn-link btn-sm p-0 mt-2 text-decoration-none"
            data-history="${id}" title="Voir l’historique des changements de statut">
      <i class="bi bi-clock-history me-1"></i> Historique
    </button>`;

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
            ${['Ouvert','En cours','En attente','Résolu','Fermé']
              .map(s => `<option ${s===t.status?'selected':''}>${s}</option>`).join('')}
          </select>
          ${deleteBtn}
        </div>
      </div>
      <p class="card-text mt-2">${(t.description||'').replace(/</g,'&lt;')}</p>
      ${historyBtn}
    </div>
  </div>`;
}

// Filtrer + dessiner
function refreshList() {
  const q = (inputSearch.value || '').toLowerCase();
  const fs = filterStatus.value;

  const filtered = data.filter(d => {
    const t = d.data();
    const matchStatus = fs ? t.status === fs : true;
    const hay = `${t.title} ${t.description} ${t.email} ${t.category} ${t.type||''}`.toLowerCase();
    const matchQuery = q ? hay.includes(q) : true;
    return matchStatus && matchQuery;
  });

  elList.innerHTML = '';
  show(elEmpty, filtered.length === 0);
  filtered.forEach(d => elList.insertAdjacentHTML('beforeend', renderItem(d)));
}

// ---------- Listeners ----------
filterStatus?.addEventListener('change', refreshList);
inputSearch?.addEventListener('input', refreshList);

// Changement de statut + historique
elList.addEventListener('change', async (e) => {
  const sel = e.target.closest('select[data-id]');
  if (!sel) return;

  const id        = sel.getAttribute('data-id');
  const newStatus = sel.value;
  const oldStatus = sel.getAttribute('data-current');

  if (newStatus === oldStatus) return;

  const user = window.__currentUser;
  const changedBy = user?.displayName || user?.email || 'Système';

  try {
    const ticketRef = doc(db, 'tickets', id);

    const historyEntry = {
      field:     'status',
      oldValue:  oldStatus,
      newValue:  newStatus,
      changedBy: changedBy,
      changedAt: serverTimestamp(),
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
    console.error('[admin] update + history failed', err);
    toast('Échec mise à jour : ' + (err?.code || err?.message || 'Erreur'));
    sel.value = oldStatus;
  }
});

// Suppression avec nettoyage history
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
    const historyCol = collection(ticketRef, 'history');

    // 1. Nettoyage de l'historique
    await deleteCollection(historyCol);

    // 2. Suppression du ticket
    await deleteDoc(ticketRef);

    toast('Ticket et historique supprimés');
  } catch (e) {
    console.error('[admin] delete + cleanup failed', e);
    toast('Échec suppression : ' + (e?.code || e?.message || 'Erreur'));
  } finally {
    pendingDeleteId = null;
    modalDelete?.hide();
  }
});

// Affichage historique
elList.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-history]');
  if (!btn) return;

  const ticketId = btn.getAttribute('data-history');
  const contentEl = document.getElementById('history-content');
  if (!contentEl) return;

  contentEl.innerHTML = '<div class="text-center py-4"><div class="spinner-border text-primary" role="status"></div></div>';

  const modal = new bootstrap.Modal(document.getElementById('historyModal'));
  modal.show();

  try {
    const histRef = collection(db, 'tickets', ticketId, 'history');
    const qHist = query(histRef, orderBy('changedAt', 'desc'));
    const snap = await getDocs(qHist);

    if (snap.empty) {
      contentEl.innerHTML = '<p class="text-muted text-center py-3">Aucun changement de statut enregistré.</p>';
      return;
    }

    let html = '';
    snap.forEach(docSnap => {
      const h = docSnap.data();
      const dateStr = h.changedAt
        ? formatDate(h.changedAt.toDate ? h.changedAt.toDate() : new Date(h.changedAt))
        : 'Date inconnue';

      html += `
        <div class="list-group-item">
          <div class="d-flex justify-content-between align-items-baseline">
            <strong>${h.changedBy || 'Système'}</strong>
            <small class="text-muted">${dateStr}</small>
          </div>
          <div class="mt-1">
            ${h.oldValue ? `<span class="badge bg-secondary me-2">${h.oldValue}</span>` : '(nouveau)'}
            <i class="bi bi-arrow-right mx-2"></i>
            <span class="badge bg-primary">${h.newValue}</span>
          </div>
        </div>`;
    });

    contentEl.innerHTML = html;

  } catch (err) {
    console.error('[admin] load history failed', err);
    contentEl.innerHTML = `<div class="alert alert-danger">Impossible de charger l’historique : ${err.message || err}</div>`;
  }
});

// ---------- Bootstrap ----------
(async () => {
  const user = await requireAuth(true);
  if (!user) return;

  const admin = await isUserAdmin(user.uid);
  if (!admin) {
    toast('Accès admin requis');
    setTimeout(() => window.location.href = 'tickets.html', 800);
    return;
  }

  const qAll = query(collection(db, 'tickets'), orderBy('createdAt', 'desc'));

  onSnapshot(qAll, (snap) => {
    data = snap.docs;
    refreshList();
  }, (err) => {
    console.error('[admin] onSnapshot error:', err);
    if (err.code === 'permission-denied') {
      toast('Permission refusée (vérifiez les règles Firestore)');
    } else if (err.code === 'failed-precondition') {
      toast('Index manquant (console Firebase)');
    } else {
      toast('Erreur : ' + (err.message || err));
    }
    elList.innerHTML = '';
    show(elEmpty, true);
  });
})();
