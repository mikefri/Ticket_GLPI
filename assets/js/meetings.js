/**
 * ============================================================
 *  MEETINGS.JS — Préparation des réunions (tickets nationaux)
 * ============================================================
 *  Dépendances :
 *    - assets/js/firebase-init.js (exporte db & auth)
 *    - Bootstrap 5.3.2 + Bootstrap Icons (chargés dans meetings.html)
 *
 *  Rôles du fichier :
 *    1. Écouter en temps réel les tickets où isNational == true
 *    2. Les afficher dans le tableau de meetings.html
 *    3. Filtrer par statut de réunion et par priorité
 *    4. Calculer les compteurs (statistiques rapides)
 *    5. Gérer les notes de réunion + changement de statut (modal)
 *    6. Permettre l'impression / export de la liste
 * ============================================================
 */

// ------------------------------------------------------------
// 1. IMPORTS FIREBASE (SDK 10.7.1 — même version que firebase-init.js)
// ------------------------------------------------------------
import { db, auth } from './firebase-init.js';
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ------------------------------------------------------------
// 2. CONFIGURATION & ÉTAT GLOBAL
// ------------------------------------------------------------

// Correspondance des champs : adaptez si votre schéma Firestore
// utilise d'autres noms (le code testera chaque alias dans l'ordre).
const FIELD_MAP = {
  title:        ['title', 'titre', 'subject', 'objet'],
  requester:    ['requesterName', 'requester', 'userName', 'demandeur', 'createdByName'],
  category:     ['category', 'categorie'],
  priority:     ['priority', 'priorite'],
  status:       ['status', 'statut'],
  ticketNumber: ['ticketNumber', 'number', 'numero'],
  createdAt:    ['createdAt', 'dateCreation', 'created_at']
};

// Libellés + icônes des statuts de réunion
const MEETING_STATUS = {
  pending:   { label: 'À traiter', icon: 'bi-hourglass-split' },
  treated:   { label: 'Traité',    icon: 'bi-check-circle-fill' },
  postponed: { label: 'Reporté',   icon: 'bi-arrow-repeat' }
};

let allTickets = [];         // Source de vérité : tous les tickets nationaux
let currentTicketId = null;  // Ticket actuellement ouvert dans la modal
let unsubscribe = null;      // Fonction de désabonnement onSnapshot

const filters = {
  meetingStatus: '',
  priority: ''
};

// ------------------------------------------------------------
// 3. RÉFÉRENCES DOM
// ------------------------------------------------------------
const $ = (id) => document.getElementById(id);

const DOM = {
  loading:          $('loading'),
  tableContainer:   $('meetings-table-container'),
  tableBody:        $('meetings-table-body'),
  emptyState:       $('empty'),
  filterStatus:     $('filter-meeting-status'),
  filterPriority:   $('filter-priority'),
  btnResetFilters:  $('btn-reset-filters'),
  btnExportPdf:     $('btn-export-pdf'),
  statTotal:        $('stat-total'),
  statPending:      $('stat-pending'),
  statTreated:      $('stat-treated'),
  statPostponed:    $('stat-postponed'),
  modalElement:     $('meetingNotesModal'),
  modalTitle:       $('modal-ticket-title'),
  modalInfo:        $('modal-ticket-info'),
  modalNotes:       $('meeting-notes-textarea'),
  modalStatus:      $('meeting-status-select'),
  btnSaveNotes:     $('btn-save-meeting-notes'),
  toastElement:     $('toast'),
  toastBody:        $('toast-body')
};

// ------------------------------------------------------------
// 4. INITIALISATION
// ------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  bindEvents();
  subscribeNationalTickets();
});

function bindEvents() {
  DOM.filterStatus.addEventListener('change', onFilterChange);
  DOM.filterPriority.addEventListener('change', onFilterChange);
  DOM.btnResetFilters.addEventListener('click', resetFilters);
  DOM.btnExportPdf.addEventListener('click', () => window.print());
  DOM.btnSaveNotes.addEventListener('click', saveMeetingNotes);

  // Délégation d'événements : un seul listener pour tout le tableau
  DOM.tableBody.addEventListener('click', onTableAction);
}

// ------------------------------------------------------------
// 5. ÉCOUTE TEMPS RÉEL FIRESTORE
// ------------------------------------------------------------
function subscribeNationalTickets() {
  const q = query(collection(db, 'tickets'), where('isNational', '==', true));

  unsubscribe = onSnapshot(q, (snapshot) => {
    allTickets = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

    // Tri client : plus récent d'abord (évite un index composite Firestore)
    allTickets.sort((a, b) => toDate(b.createdAt) - toDate(a.createdAt));

    refreshStats();
    renderTable();
    hideLoading();
  }, (error) => {
    console.error('[meetings] Erreur Firestore :', error);
    showToast('Erreur lors du chargement des tickets nationaux.', 'danger');
    hideLoading();
  });
}

// ------------------------------------------------------------
// 6. AFFICHAGE
// ------------------------------------------------------------
function renderTable() {
  const tickets = applyFilters(allTickets);

  if (tickets.length === 0) {
    DOM.tableContainer.classList.add('d-none');
    DOM.emptyState.classList.remove('d-none');
    return;
  }

  DOM.emptyState.classList.add('d-none');
  DOM.tableContainer.classList.remove('d-none');

  DOM.tableBody.innerHTML = tickets.map(buildRow).join('');
  initTooltips();
}

function buildRow(ticket) {
  const id          = ticket.id;
  const number      = getField(ticket, 'ticketNumber') || id.substring(0, 6).toUpperCase();
  const title       = getField(ticket, 'title') || 'Sans titre';
  const requester   = getField(ticket, 'requester') || 'Utilisateur';
  const category    = getField(ticket, 'category') || 'Autre';
  const priority    = getField(ticket, 'priority') || 'Moyenne';
  const status      = getField(ticket, 'status') || 'Ouvert';
  const meetStatus  = ticket.meetingStatus || 'pending';

  return `
    <tr class="fade-in" data-id="${id}">
      <td><span class="fw-bold text-primary">#${escapeHtml(number)}</span></td>
      <td>
        <div class="d-flex flex-column">
          <span class="fw-semibold">${escapeHtml(title)}</span>
          <small class="text-muted">${formatDate(getField(ticket, 'createdAt'))}</small>
        </div>
      </td>
      <td>
        <div class="d-flex align-items-center">
          <div class="avatar-circle me-2" style="width:28px;height:28px;font-size:.7rem;">
            ${initials(requester)}
          </div>
          <span>${escapeHtml(requester)}</span>
        </div>
      </td>
      <td><span class="badge bg-light text-dark border">${escapeHtml(category)}</span></td>
      <td>${priorityBadge(priority)}</td>
      <td><span class="badge bg-primary">${escapeHtml(status)}</span></td>
      <td>${meetingBadge(meetStatus)}</td>
      <td class="no-print">
        <div class="btn-action-group">
          <button class="btn btn-outline-primary" data-action="notes" data-id="${id}"
                  title="Notes de réunion" data-bs-toggle="tooltip">
            <i class="bi bi-journal-text"></i>
          </button>
          <button class="btn btn-outline-success" data-action="treated" data-id="${id}"
                  title="Marquer comme traité" data-bs-toggle="tooltip">
            <i class="bi bi-check-circle"></i>
          </button>
          <button class="btn btn-outline-danger" data-action="unflag" data-id="${id}"
                  title="Retirer du scope national" data-bs-toggle="tooltip">
            <i class="bi bi-flag"></i>
          </button>
          <a href="ticket-detail.html?id=${id}" class="btn btn-outline-secondary"
             title="Voir le ticket" data-bs-toggle="tooltip">
            <i class="bi bi-eye"></i>
          </a>
        </div>
      </td>
    </tr>`;
}

// ------------------------------------------------------------
// 7. ACTIONS DU TABLEAU (délégation)
// ------------------------------------------------------------
function onTableAction(event) {
  const button = event.target.closest('[data-action]');
  if (!button) return;

  const { action, id } = button.dataset;

  switch (action) {
    case 'notes':   openNotesModal(id); break;
    case 'treated': markAsTreated(id);  break;
    case 'unflag':  unflagNational(id); break;
  }
}

async function markAsTreated(id) {
  if (!confirm('Marquer ce ticket comme traité pour la réunion ?')) return;
  await updateMeetingFields(id, { meetingStatus: 'treated' }, 'Ticket marqué comme traité.');
}

async function unflagNational(id) {
  if (!confirm('Retirer ce ticket du scope national ? Il disparaîtra de cette liste.')) return;

  try {
    await updateDoc(doc(db, 'tickets', id), {
      isNational: false,
      meetingUpdatedAt: serverTimestamp(),
      meetingUpdatedBy: auth.currentUser?.uid || null
    });
    showToast('Ticket retiré du scope national.', 'success');
  } catch (error) {
    console.error('[meetings] Erreur unflag :', error);
    showToast('Erreur lors du retrait du scope national.', 'danger');
  }
}

// ------------------------------------------------------------
// 8. MODAL — NOTES DE RÉUNION
// ------------------------------------------------------------
function openNotesModal(id) {
  const ticket = allTickets.find((t) => t.id === id);
  if (!ticket) return;

  currentTicketId = id;

  DOM.modalTitle.textContent = getField(ticket, 'title') || 'Sans titre';
  DOM.modalInfo.textContent  =
    `Ticket #${getField(ticket, 'ticketNumber') || id.substring(0, 6)} • ` +
    `Créé le ${formatDate(getField(ticket, 'createdAt'))}`;
  DOM.modalNotes.value       = ticket.meetingNotes || '';
  DOM.modalStatus.value      = ticket.meetingStatus || 'pending';

  getModal().show();
}

async function saveMeetingNotes() {
  if (!currentTicketId) return;

  setSaveButtonLoading(true);

  try {
    await updateDoc(doc(db, 'tickets', currentTicketId), {
      meetingNotes:  DOM.modalNotes.value.trim(),
      meetingStatus: DOM.modalStatus.value,
      meetingUpdatedAt: serverTimestamp(),
      meetingUpdatedBy: auth.currentUser?.uid || null
    });

    showToast('Notes de réunion enregistrées.', 'success');
    getModal().hide();
  } catch (error) {
    console.error('[meetings] Erreur sauvegarde notes :', error);
    showToast('Erreur lors de l’enregistrement des notes.', 'danger');
  } finally {
    setSaveButtonLoading(false);
    currentTicketId = null;
  }
}

function setSaveButtonLoading(loading) {
  DOM.btnSaveNotes.disabled = loading;
  DOM.btnSaveNotes.innerHTML = loading
    ? '<span class="spinner-border spinner-border-sm me-1"></span>Enregistrement…'
    : '<i class="bi bi-save me-1"></i> Enregistrer';
}

// ------------------------------------------------------------
// 9. MISE À JOUR GÉNÉRIQUE FIRESTORE
// ------------------------------------------------------------
async function updateMeetingFields(id, fields, successMessage) {
  try {
    await updateDoc(doc(db, 'tickets', id), {
      ...fields,
      meetingUpdatedAt: serverTimestamp(),
      meetingUpdatedBy: auth.currentUser?.uid || null
    });
    if (successMessage) showToast(successMessage, 'success');
  } catch (error) {
    console.error('[meetings] Erreur mise à jour :', error);
    showToast('Erreur lors de la mise à jour.', 'danger');
  }
}

// ------------------------------------------------------------
// 10. FILTRES
// ------------------------------------------------------------
function onFilterChange() {
  filters.meetingStatus = DOM.filterStatus.value;
  filters.priority      = DOM.filterPriority.value;
  renderTable();
}

function resetFilters() {
  filters.meetingStatus = '';
  filters.priority      = '';
  DOM.filterStatus.value   = '';
  DOM.filterPriority.value = '';
  renderTable();
}

function applyFilters(tickets) {
  return tickets.filter((t) => {
    const meetStatus = t.meetingStatus || 'pending';
    if (filters.meetingStatus && meetStatus !== filters.meetingStatus) return false;
    if (filters.priority && getField(t, 'priority') !== filters.priority) return false;
    return true;
  });
}

// ------------------------------------------------------------
// 11. STATISTIQUES
// ------------------------------------------------------------
function refreshStats() {
  const count = (status) =>
    allTickets.filter((t) => (t.meetingStatus || 'pending') === status).length;

  animateCounter(DOM.statTotal,     allTickets.length);
  animateCounter(DOM.statPending,   count('pending'));
  animateCounter(DOM.statTreated,   count('treated'));
  animateCounter(DOM.statPostponed, count('postponed'));
}

function animateCounter(element, target) {
  if (!element) return;
  const start    = parseInt(element.textContent, 10) || 0;
  const duration = 400;
  const steps    = 20;
  const increment = (target - start) / steps;
  let current = start;
  let step = 0;

  const timer = setInterval(() => {
    step++;
    current += increment;
    if (step >= steps) {
      element.textContent = target;
      clearInterval(timer);
    } else {
      element.textContent = Math.round(current);
    }
  }, duration / steps);
}

// ------------------------------------------------------------
// 12. UTILITAIRES
// ------------------------------------------------------------
function getField(ticket, key) {
  const aliases = FIELD_MAP[key] || [key];
  for (const alias of aliases) {
    if (ticket[alias] !== undefined && ticket[alias] !== null && ticket[alias] !== '') {
      return ticket[alias];
    }
  }
  return null;
}

function toDate(value) {
  if (!value) return new Date(0);
  if (value.toDate) return value.toDate();       // Timestamp Firestore
  const d = new Date(value);
  return isNaN(d) ? new Date(0) : d;
}

function formatDate(value) {
  if (!value) return 'N/A';
  return toDate(value).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

function initials(name) {
  if (!name) return 'U';
  return name.split(' ').map((p) => p.charAt(0)).join('').toUpperCase().substring(0, 2);
}

function escapeHtml(text) {
  if (text === null || text === undefined) return '';
  const div = document.createElement('div');
  div.textContent = String(text);
  return div.innerHTML;
}

function priorityBadge(priority) {
  const cls = (priority || 'Moyenne').toLowerCase();
  return `<span class="badge-priority ${escapeHtml(cls)}">${escapeHtml(priority)}</span>`;
}

function meetingBadge(status) {
  const info = MEETING_STATUS[status] || MEETING_STATUS.pending;
  return `
    <span class="badge-meeting-status ${escapeHtml(status)}">
      <i class="bi ${info.icon}"></i> ${info.label}
    </span>`;
}

function getModal() {
  return bootstrap.Modal.getOrCreateInstance(DOM.modalElement);
}

function initTooltips() {
  if (!window.bootstrap?.Tooltip) return;
  DOM.tableBody.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) => {
    bootstrap.Tooltip.getOrCreateInstance(el, { delay: { show: 300, hide: 100 } });
  });
}

function hideLoading() {
  DOM.loading?.classList.add('d-none');
}

function showToast(message, type = 'info') {
  if (!DOM.toastElement) return;
  DOM.toastBody.textContent = message;
  DOM.toastElement.classList.remove('border-primary', 'border-success', 'border-danger', 'border-warning');
  DOM.toastElement.classList.add(`border-${type}`);
  bootstrap.Toast.getOrCreateInstance(DOM.toastElement, { delay: 3000 }).show();
}

// ------------------------------------------------------------
// 13. NETTOYAGE (si l'utilisateur quitte la page)
// ------------------------------------------------------------
window.addEventListener('beforeunload', () => {
  if (unsubscribe) unsubscribe();
});
