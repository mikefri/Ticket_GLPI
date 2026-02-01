// ------------------------------------------------------------
// Page Administration : liste les tickets, mise à jour de statut avec historique,
// suppression avec confirmation. Accès réservé aux admins.
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
  serverTimestamp
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

// Rendu d'une carte ticket
function renderItem(d) {
  const t = d.data();
  const id = d.id;

  const details =
    `${badgeForStatus(t.status)} ${badgeForPriority(t.priority)} ` +
    `<span class="ms-2 text-muted small">${t.category}${t.type ? ' • ' + t.type : ''}</span>`;

  // Information de prise en charge
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

  // Bouton suppression seulement si admin
  const deleteBtn = (window.__isAdmin)
    ? `<button type="button" class="btn btn-outline-danger btn-sm"
               title="Supprimer ce ticket" aria-label="Supprimer ce ticket"
               data-delete="${id}">
         <i class="bi bi-trash"></i>
       </button>`
    : '';

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

// ---------- Listeners (délégation) ----------
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

    // Préparer l'entrée d'historique
    const historyEntry = {
      field:     'status',
      oldValue:  oldStatus,
      newValue:  newStatus,
      changedBy: changedBy,
      changedAt: serverTimestamp(),
      // comment: ""   ← à décommenter si tu veux ajouter un commentaire plus tard
    };

    // Mise à jour du ticket principal
    const updateData = { status: newStatus };

    // Logique existante de prise en charge
    if (oldStatus === 'Ouvert' && newStatus === 'En cours') {
      updateData.takenBy = changedBy;
      updateData.takenAt = serverTimestamp();
    }

    await updateDoc(ticketRef, updateData);

    // Ajout de l'historique
    await addDoc(
      collection(ticketRef, 'history'),
      historyEntry
    );

    toast(`Statut mis à jour : ${newStatus}`);
    sel.setAttribute('data-current', newStatus);

  } catch (err) {
    console.error('[admin] update + history failed', err);
    toast('Échec de la mise à jour : ' + (err?.code || err?.message || 'Erreur inconnue'));
    sel.value = oldStatus; // rollback visuel
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
    await deleteDoc(doc(db, 'tickets', pendingDeleteId));
    toast('Ticket supprimé');
  } catch (e) {
    console.error('[admin] delete', e);
    toast('Suppression refusée : ' + (e?.code || e?.message || e));
  } finally {
    pendingDeleteId = null;
    modalDelete?.hide();
  }
});

// ---------- Initialisation ----------
(async () => {
  const user = await requireAuth(true);
  if (!user) return;

  const admin = await isUserAdmin(user.uid);
  if (!admin) {
    toast('Accès admin requis');
    setTimeout(() => window.location.href = 'tickets.html', 800);
    return;
  }

  // Requête temps réel – tous les tickets
  const qAll = query(collection(db, 'tickets'), orderBy('createdAt', 'desc'));

  onSnapshot(qAll, (snap) => {
    data = snap.docs;
    refreshList();
  }, (err) => {
    console.error('[admin] onSnapshot error:', err);
    if (err.code === 'permission-denied') {
      toast('Permission refusée (vérifiez les règles Firestore)');
    } else if (err.code === 'failed-precondition') {
      toast('Index manquant pour cette requête (console Firebase)');
    } else {
      toast('Erreur : ' + (err.message || err));
    }
    elList.innerHTML = '';
    show(elEmpty, true);
  });
})();
