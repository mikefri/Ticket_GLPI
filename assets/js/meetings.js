/**
 * ============================================
 * MEETINGS.JS - Logique de la page Préparation des réunions
 * ============================================
 * Ce fichier gère :
 * - La récupération des tickets nationaux depuis Firestore
 * - L'affichage dans le tableau
 * - Le filtrage et les statistiques
 * - Les notes de réunion et la mise à jour du statut
 * - L'export PDF
 */

// ============================================
// IMPORTS FIREBASE (Modular SDK v9+)
// ============================================
import { db, auth } from './firebase-config.js'; // Assurez-vous que ce fichier existe
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  updateDoc,
  arrayUnion,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

// ============================================
// VARIABLES GLOBALES
// ============================================
let allNationalTickets = [];
let currentFilters = {
  meetingStatus: '',
  priority: ''
};
let currentTicketForModal = null;

// ============================================
// ÉLÉMENTS DOM
// ============================================
const DOM = {
  loading: document.getElementById('loading'),
  tableContainer: document.getElementById('meetings-table-container'),
  tableBody: document.getElementById('meetings-table-body'),
  emptyState: document.getElementById('empty'),
  filterMeetingStatus: document.getElementById('filter-meeting-status'),
  filterPriority: document.getElementById('filter-priority'),
  btnResetFilters: document.getElementById('btn-reset-filters'),
  btnExportPdf: document.getElementById('btn-export-pdf'),
  // Statistiques
  statTotal: document.getElementById('stat-total'),
  statPending: document.getElementById('stat-pending'),
  statTreated: document.getElementById('stat-treated'),
  statPostponed: document.getElementById('stat-postponed'),
  // Modal
  meetingNotesModal: document.getElementById('meetingNotesModal'),
  modalTicketTitle: document.getElementById('modal-ticket-title'),
  modalTicketInfo: document.getElementById('modal-ticket-info'),
  meetingNotesTextarea: document.getElementById('meeting-notes-textarea'),
  meetingStatusSelect: document.getElementById('meeting-status-select'),
  btnSaveMeetingNotes: document.getElementById('btn-save-meeting-notes'),
  // Toast
  toastBody: document.getElementById('toast-body'),
  toastElement: document.getElementById('toast')
};

// ============================================
// INITIALISATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  initializeEventListeners();
  loadNationalTickets();
});

function initializeEventListeners() {
  // Filtres
  DOM.filterMeetingStatus.addEventListener('change', handleFilterChange);
  DOM.filterPriority.addEventListener('change', handleFilterChange);
  DOM.btnResetFilters.addEventListener('click', resetFilters);
  
  // Export PDF
  DOM.btnExportPdf.addEventListener('click', exportToPdf);
  
  // Modal - Sauvegarder les notes
  DOM.btnSaveMeetingNotes.addEventListener('click', saveMeetingNotes);
}

// ============================================
// CHARGEMENT DES TICKETS NATIONAUX
// ============================================
function loadNationalTickets() {
  const ticketsCollection = collection(db, 'tickets');
  const q = query(ticketsCollection, where('isNational', '==', true));
  
  onSnapshot(q, (snapshot) => {
    allNationalTickets = [];
    
    snapshot.forEach((doc) => {
      allNationalTickets.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    // Trier par date de création décroissante
    allNationalTickets.sort((a, b) => {
      const dateA = a.createdAt?.toDate() || new Date(0);
      const dateB = b.createdAt?.toDate() || new Date(0);
      return dateB - dateA;
    });
    
    updateStatistics();
    renderTickets();
    hideLoading();
  }, (error) => {
    console.error('Erreur lors du chargement des tickets nationaux:', error);
    showToast('Erreur lors du chargement des tickets', 'danger');
    hideLoading();
  });
}

// ============================================
// AFFICHAGE DES TICKETS
// ============================================
function renderTickets() {
  const filteredTickets = applyFilters(allNationalTickets);
  
  if (filteredTickets.length === 0) {
    DOM.tableContainer.classList.add('d-none');
    DOM.emptyState.classList.remove('d-none');
    return;
  }
  
  DOM.emptyState.classList.add('d-none');
  DOM.tableContainer.classList.remove('d-none');
  DOM.tableBody.innerHTML = '';
  
  filteredTickets.forEach((ticket, index) => {
    const row = createTicketRow(ticket, index);
    DOM.tableBody.appendChild(row);
  });
}

function createTicketRow(ticket, index) {
  const tr = document.createElement('tr');
  tr.className = 'fade-in';
  tr.style.animationDelay = `${index * 0.05}s`;
  
  tr.innerHTML = `
    <td>
      <span class="fw-bold text-primary">#${ticket.ticketNumber || ticket.id.substring(0, 6)}</span>
    </td>
    <td>
      <div class="d-flex flex-column">
        <span class="fw-semibold">${escapeHtml(ticket.title || 'Sans titre')}</span>
        <small class="text-muted">${formatDate(ticket.createdAt)}</small>
      </div>
    </td>
    <td>
      <div class="d-flex align-items-center">
        <div class="avatar-circle me-2" style="width: 28px; height: 28px; font-size: 0.7rem;">
          ${getInitials(ticket.requesterName || 'U')}
        </div>
        <span>${escapeHtml(ticket.requesterName || 'Utilisateur')}</span>
      </div>
    </td>
    <td>
      <span class="badge bg-light text-dark border">${escapeHtml(ticket.category || 'Autre')}</span>
    </td>
    <td>
      ${renderPriorityBadge(ticket.priority)}
    </td>
    <td>
      <span class="badge bg-primary">${escapeHtml(ticket.status || 'Ouvert')}</span>
    </td>
    <td>
      ${renderMeetingStatusBadge(ticket.meetingStatus || 'pending')}
    </td>
    <td class="no-print">
      <div class="btn-action-group">
        <button class="btn btn-outline-primary" onclick="openMeetingNotesModal('${ticket.id}')" 
                title="Ajouter des notes de réunion" data-bs-toggle="tooltip">
          <i class="bi bi-journal-text"></i>
        </button>
        <button class="btn btn-outline-success" onclick="markAsTreated('${ticket.id}')" 
                title="Marquer comme traité" data-bs-toggle="tooltip">
          <i class="bi bi-check-circle"></i>
        </button>
        <a href="ticket-detail.html?id=${ticket.id}" class="btn btn-outline-secondary" 
           title="Voir le détail" data-bs-toggle="tooltip">
          <i class="bi bi-eye"></i>
        </a>
      </div>
    </td>
  `;
  
  return tr;
}

// ============================================
// FILTRAGE
// ============================================
function applyFilters(tickets) {
  return tickets.filter(ticket => {
    // Filtre par statut de réunion
    if (currentFilters.meetingStatus && ticket.meetingStatus !== currentFilters.meetingStatus) {
      return false;
    }
    
    // Filtre par priorité
    if (currentFilters.priority && ticket.priority !== currentFilters.priority) {
      return false;
    }
    
    return true;
  });
}

function handleFilterChange() {
  currentFilters.meetingStatus = DOM.filterMeetingStatus.value;
  currentFilters.priority = DOM.filterPriority.value;
  renderTickets();
}

function resetFilters() {
  currentFilters = { meetingStatus: '', priority: '' };
  DOM.filterMeetingStatus.value = '';
  DOM.filterPriority.value = '';
  renderTickets();
}

// ============================================
// STATISTIQUES
// ============================================
function updateStatistics() {
  const total = allNationalTickets.length;
  const pending = allNationalTickets.filter(t => (t.meetingStatus || 'pending') === 'pending').length;
  const treated = allNationalTickets.filter(t => t.meetingStatus === 'treated').length;
  const postponed = allNationalTickets.filter(t => t.meetingStatus === 'postponed').length;
  
  animateCounter(DOM.statTotal, total);
  animateCounter(DOM.statPending, pending);
  animateCounter(DOM.statTreated, treated);
  animateCounter(DOM.statPostponed, postponed);
}

function animateCounter(element, target) {
  const duration = 500;
  const start = parseInt(element.textContent) || 0;
  const increment = (target - start) / (duration / 16);
  let current = start;
  
  const timer = setInterval(() => {
    current += increment;
    if ((increment > 0 && current >= target) || (increment < 0 && current <= target)) {
      element.textContent = target;
      clearInterval(timer);
    } else {
      element.textContent = Math.floor(current);
    }
  }, 16);
}

// ============================================
// MODAL - NOTES DE RÉUNION
// ============================================
window.openMeetingNotesModal = function(ticketId) {
  const ticket = allNationalTickets.find(t => t.id === ticketId);
  if (!ticket) return;
  
  currentTicketForModal = ticket;
  
  DOM.modalTicketTitle.textContent = ticket.title || 'Sans titre';
  DOM.modalTicketInfo.textContent = `Ticket #${ticket.ticketNumber || ticket.id.substring(0, 6)} • ${formatDate(ticket.createdAt)}`;
  DOM.meetingNotesTextarea.value = ticket.meetingNotes || '';
  DOM.meetingStatusSelect.value = ticket.meetingStatus || 'pending';
  
  const modal = new bootstrap.Modal(DOM.meetingNotesModal);
  modal.show();
};

window.markAsTreated = async function(ticketId) {
  if (!confirm('Marquer ce ticket comme traité pour la réunion ?')) return;
  
  try {
    await updateTicketMeetingStatus(ticketId, 'treated');
    showToast('Ticket marqué comme traité', 'success');
  } catch (error) {
    console.error('Erreur:', error);
    showToast('Erreur lors de la mise à jour', 'danger');
  }
};

async function saveMeetingNotes() {
  if (!currentTicketForModal) return;
  
  const notes = DOM.meetingNotesTextarea.value.trim();
  const status = DOM.meetingStatusSelect.value;
  
  DOM.btnSaveMeetingNotes.disabled = true;
  DOM.btnSaveMeetingNotes.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Enregistrement...';
  
  try {
    const ticketRef = doc(db, 'tickets', currentTicketForModal.id);
    
    await updateDoc(ticketRef, {
      meetingNotes: notes,
      meetingStatus: status,
      meetingUpdatedAt: serverTimestamp(),
      meetingUpdatedBy: auth.currentUser?.uid || null
    });
    
    showToast('Notes de réunion enregistrées', 'success');
    
    // Fermer le modal
    const modal = bootstrap.Modal.getInstance(DOM.meetingNotesModal);
    if (modal) modal.hide();
    
  } catch (error) {
    console.error('Erreur lors de la sauvegarde:', error);
    showToast('Erreur lors de la sauvegarde', 'danger');
  } finally {
    DOM.btnSaveMeetingNotes.disabled = false;
    DOM.btnSaveMeetingNotes.innerHTML = '<i class="bi bi-save me-1"></i> Enregistrer';
  }
}

// ============================================
// MISE À JOUR FIRESTORE
// ============================================
async function updateTicketMeetingStatus(ticketId, status) {
  const ticketRef = doc(db, 'tickets', ticketId);
  
  await updateDoc(ticketRef, {
    meetingStatus: status,
    meetingUpdatedAt: serverTimestamp(),
    meetingUpdatedBy: auth.currentUser?.uid || null
  });
}

// ============================================
// EXPORT PDF
// ============================================
function exportToPdf() {
  // Utiliser window.print() qui est déjà configuré avec les styles @media print
  window.print();
  
  // Alternative : utiliser jsPDF pour un export plus personnalisé
  // Décommentez si vous souhaitez utiliser jsPDF :
  /*
  import('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js')
    .then(module => {
      const { jsPDF } = module;
      const doc = new jsPDF();
      
      doc.setFontSize(16);
      doc.text('Préparation de réunion - Tickets Nationaux', 14, 20);
      doc.setFontSize(10);
      doc.text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, 14, 28);
      
      // Ajouter le tableau ici...
      
      doc.save('reunion-tickets-nationaux.pdf');
    });
  */
}

// ============================================
// FONCTIONS UTILITAIRES
// ============================================
function renderPriorityBadge(priority) {
  const priorityMap = {
    'Critique': 'critique',
    'Haute': 'haute',
    'Moyenne': 'moyenne',
    'Basse': 'basse'
  };
  
  const className = priorityMap[priority] || 'basse';
  return `<span class="badge-priority ${className}">${escapeHtml(priority || 'Basse')}</span>`;
}

function renderMeetingStatusBadge(status) {
  const statusMap = {
    'pending': { label: 'À traiter', icon: 'bi-hourglass-split' },
    'treated': { label: 'Traité', icon: 'bi-check-circle-fill' },
    'postponed': { label: 'Reporté', icon: 'bi-arrow-repeat' }
  };
  
  const statusInfo = statusMap[status] || statusMap['pending'];
  return `<span class="badge-meeting-status ${status}">
    <i class="bi ${statusInfo.icon}"></i>
    ${statusInfo.label}
  </span>`;
}

function formatDate(timestamp) {
  if (!timestamp) return 'N/A';
  
  try {
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return 'N/A';
  }
}

function getInitials(name) {
  if (!name) return 'U';
  return name
    .split(' ')
    .map(part => part.charAt(0))
    .join('')
    .toUpperCase()
    .substring(0, 2);
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function hideLoading() {
  DOM.loading.classList.add('d-none');
}

function showToast(message, type = 'info') {
  DOM.toastBody.textContent = message;
  
  const toastEl = DOM.toastElement;
  toastEl.classList.remove('border-primary', 'border-success', 'border-danger', 'border-warning');
  toastEl.classList.add(`border-${type}`);
  
  const toast = new bootstrap.Toast(toastEl, { delay: 3000 });
  toast.show();
}
