/**
 * ============================================================
 *  MEETINGS.JS — Préparation des réunions (tickets nationaux)
 *  + Colonne Description
 *  + Remontées Mi Digital (horodatage + historique + suppression admin)
 *  + Export Excel (SheetJS)
 *  + Extraction du n° de ticket groom
 * ============================================================
 */

// ------------------------------------------------------------
// 1. IMPORTS FIREBASE (SDK 10.7.1)
// ------------------------------------------------------------
import { db, auth } from './firebase-init.js';
import {
  collection, query, where, onSnapshot, doc, updateDoc, serverTimestamp,
  arrayUnion, Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ------------------------------------------------------------
// 2. CONFIGURATION & ÉTAT GLOBAL
// ------------------------------------------------------------
const FIELD_MAP = {
  title:        ['title', 'titre', 'subject', 'objet'],
  requester:    ['requesterName', 'requester', 'userName', 'demandeur', 'createdByName'],
  category:     ['category', 'categorie'],
  priority:     ['priority', 'priorite'],
  status:       ['status', 'statut'],
  ticketNumber: ['ticketNumber', 'number', 'numero'],
  createdAt:    ['createdAt', 'dateCreation', 'created_at'],
  description:  ['description', 'desc', 'details']
};

const MEETING_STATUS = {
  pending:   { label: 'À traiter', icon: 'bi-hourglass-split' },
  treated:   { label: 'Traité',    icon: 'bi-check-circle-fill' },
  postponed: { label: 'Reporté',   icon: 'bi-arrow-repeat' }
};

let allTickets = [];
let unsubscribe = null;

// Etat de la modal Mi Digital
let currentMiTicketId = null;
let currentMiSorted = [];

const filters = { meetingStatus: '', priority: '' };

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
  btnExportExcel:   $('btn-export-excel'),
  statTotal:        $('stat-total'),
  statPending:      $('stat-pending'),
  statTreated:      $('stat-treated'),
  miModal:          $('miDigitalModal'),
  miModalTitle:     $('mi-modal-title'),
  miModalList:      $('mi-modal-list'),
  btnClearMi:       $('btn-clear-mi-history'),
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
  DOM.btnExportExcel.addEventListener('click', exportToExcel);
  DOM.tableBody.addEventListener('click', onTableAction);

  // Suppression d'une entrée Mi Digital (délégation dans la modal)
  DOM.miModalList.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-del-idx]');
    if (!btn) return;
    deleteMiEntry(parseInt(btn.dataset.delIdx, 10));
  });

  // Vider tout l'historique (admin)
  DOM.btnClearMi?.addEventListener('click', clearMiHistory);
}

// Rôle admin (défini par app.js)
function isAdminUser() {
  return window.__isAdmin === true;
}

// ------------------------------------------------------------
// 5. ÉCOUTE TEMPS RÉEL FIRESTORE
// ------------------------------------------------------------
function subscribeNationalTickets() {
  const q = query(collection(db, 'tickets'), where('isNational', '==', true));

  unsubscribe = onSnapshot(q, (snapshot) => {
    allTickets = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
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
  const category    = getField(ticket, 'category') || 'Autre';
  const priority    = getField(ticket, 'priority') || 'Moyenne';
  const status      = getField(ticket, 'status') || 'Ouvert';
  const meetStatus  = ticket.meetingStatus || 'pending';
  const description = getField(ticket, 'description') || 'Aucune description';

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
        <div class="desc-cell" title="${escapeHtml(description)}">
          ${escapeHtml(truncate(description, 160))}
        </div>
      </td>
      <td><span class="badge bg-light text-dark border">${escapeHtml(category)}</span></td>
      <td>${priorityBadge(priority)}</td>
      <td><span class="badge bg-primary">${escapeHtml(status)}</span></td>
      <td>${meetingBadge(meetStatus)}</td>
      <td>${miDigitalCell(ticket)}</td>
      <td>${groomCell(ticket.groomLink)}</td>
      <td class="no-print">
        <div class="btn-action-group">
          <button class="btn btn-outline-info" data-action="midigital" data-id="${id}"
                  title="Remontée Mi Digital (ajouter une date)" data-bs-toggle="tooltip">
            <i class="bi bi-megaphone"></i>
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
    case 'treated':   markAsTreated(id);      break;
    case 'unflag':    unflagNational(id);     break;
    case 'midigital': recordMiDigital(id);    break;
    case 'mihistory': openMiDigitalModal(id); break;
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
      meetingStatus: null,
      meetingNotes: null,
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
// 8. REMONTÉES MI DIGITAL (ajout + historique + suppression admin)
// ------------------------------------------------------------
async function recordMiDigital(id) {
  if (!confirm('Enregistrer une remontée Mi Digital pour ce ticket ?\nUne date horodatée sera ajoutée à l\'historique.')) return;

  try {
    const entry = {
      at: Timestamp.now(),
      by: auth.currentUser?.displayName || auth.currentUser?.email || 'Inconnu'
    };

    await updateDoc(doc(db, 'tickets', id), {
      miDigitalDates: arrayUnion(entry),
      meetingUpdatedAt: serverTimestamp(),
      meetingUpdatedBy: auth.currentUser?.uid || null
    });

    const ticket = allTickets.find((t) => t.id === id);
    const count = (Array.isArray(ticket?.miDigitalDates) ? ticket.miDigitalDates.length : 0) + 1;
    showToast(`Remontée Mi Digital enregistrée (${count}ᵉ date de l'historique).`, 'success');
  } catch (error) {
    console.error('[meetings] Erreur remontée Mi Digital :', error);
    showToast('Erreur lors de l’enregistrement de la remontée.', 'danger');
  }
}

function openMiDigitalModal(id) {
  const ticket = allTickets.find((t) => t.id === id);
  if (!ticket) return;

  currentMiTicketId = id;
  DOM.miModalTitle.textContent = getField(ticket, 'title') || 'Sans titre';

  renderMiModalList();

  // Le bouton "Vider l'historique" n'est visible que pour les admins
  DOM.btnClearMi?.classList.toggle('d-none', !isAdminUser());

  bootstrap.Modal.getOrCreateInstance(DOM.miModal).show();
}

function renderMiModalList() {
  const ticket = allTickets.find((t) => t.id === currentMiTicketId);
  const dates = ticket && Array.isArray(ticket.miDigitalDates) ? [...ticket.miDigitalDates] : [];
  dates.sort((a, b) => toDate(b.at) - toDate(a.at));
  currentMiSorted = dates;

  const admin = isAdminUser();

  if (!dates.length) {
    DOM.miModalList.innerHTML = `
      <div class="text-muted text-center py-3">
        <i class="bi bi-megaphone fs-3 d-block mb-2"></i>
        Aucune remontée Mi Digital enregistrée.
      </div>`;
    DOM.btnClearMi?.classList.add('d-none');
    return;
  }

  DOM.miModalList.innerHTML = dates.map((d, i) => `
    <div class="list-group-item d-flex justify-content-between align-items-center">
      <span>
        <i class="bi bi-megaphone-fill me-2 text-info"></i>
        <strong>${formatDateTime(d.at)}</strong>
      </span>
      <span class="d-flex align-items-center">
        <small class="text-muted">
          ${escapeHtml(d.by || '—')}
          ${i === 0 ? '<span class="badge bg-info text-dark ms-1">dernier</span>' : ''}
        </small>
        ${admin ? `
          <button type="button" class="btn btn-sm btn-outline-danger ms-2"
                  data-del-idx="${i}" title="Supprimer cette remontée">
            <i class="bi bi-trash"></i>
          </button>` : ''}
      </span>
    </div>`).join('');
}

// Supprime UNE entrée de l'historique (admin uniquement)
async function deleteMiEntry(idx) {
  if (!isAdminUser()) return;

  const ticket = allTickets.find((t) => t.id === currentMiTicketId);
  if (!ticket || !Array.isArray(ticket.miDigitalDates)) return;

  const entry = currentMiSorted[idx];
  if (!entry) return;

  if (!confirm('Supprimer cette remontée Mi Digital ?')) return;

  // Retire exactement cette entrée (même référence d'objet)
  const newArray = ticket.miDigitalDates.filter((e) => e !== entry);

  try {
    ticket.miDigitalDates = newArray;      // màj locale → re-rendu immédiat
    renderMiModalList();

    await updateDoc(doc(db, 'tickets', ticket.id), {
      miDigitalDates: newArray,
      meetingUpdatedAt: serverTimestamp(),
      meetingUpdatedBy: auth.currentUser?.uid || null
    });

    showToast('Remontée Mi Digital supprimée.', 'success');
  } catch (error) {
    console.error('[meetings] Erreur suppression entrée Mi Digital :', error);
    showToast('Erreur lors de la suppression.', 'danger');
  }
}

// Vide TOUT l'historique (admin uniquement)
async function clearMiHistory() {
  if (!isAdminUser()) return;

  const ticket = allTickets.find((t) => t.id === currentMiTicketId);
  if (!ticket) return;

  if (!confirm('Vider TOUT l\'historique des remontées Mi Digital pour ce ticket ?\nCette action est irréversible.')) return;

  try {
    ticket.miDigitalDates = [];            // màj locale → re-rendu immédiat
    renderMiModalList();

    await updateDoc(doc(db, 'tickets', ticket.id), {
      miDigitalDates: [],
      meetingUpdatedAt: serverTimestamp(),
      meetingUpdatedBy: auth.currentUser?.uid || null
    });

    showToast('Historique Mi Digital vidé.', 'success');
  } catch (error) {
    console.error('[meetings] Erreur vidage historique Mi Digital :', error);
    showToast('Erreur lors du vidage de l’historique.', 'danger');
  }
}

function miDigitalCell(ticket) {
  const dates = Array.isArray(ticket.miDigitalDates) ? ticket.miDigitalDates : [];
  if (!dates.length) return '<span class="text-muted">—</span>';

  const sorted = [...dates].sort((a, b) => toDate(b.at) - toDate(a.at));
  return `
    <button type="button" class="badge-midigital" data-action="mihistory" data-id="${ticket.id}"
            title="Voir l'historique des remontées Mi Digital">
      <i class="bi bi-megaphone-fill"></i> ×${dates.length}
      <span class="mi-last">${formatDate(sorted[0].at)}</span>
    </button>`;
}

// ------------------------------------------------------------
// 9. EXPORT EXCEL (SheetJS)
// ------------------------------------------------------------
function loadSheetJs() {
  return new Promise((resolve, reject) => {
    if (window.XLSX) { resolve(); return; }
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

function lastMiDate(ticket) {
  const dates = Array.isArray(ticket.miDigitalDates) ? ticket.miDigitalDates : [];
  if (!dates.length) return '';
  const sorted = [...dates].sort((a, b) => toDate(b.at) - toDate(a.at));
  return formatDateTime(sorted[0].at);
}

async function exportToExcel() {
  const tickets = applyFilters(allTickets);   // exporte ce qui est affiché (filtres appliqués)

  if (!tickets.length) {
    showToast('Aucun ticket à exporter.', 'warning');
    return;
  }

  const btn = DOM.btnExportExcel;
  const btnHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Génération…';

  try {
    await loadSheetJs();
    const XLSX = window.XLSX;

    // ── Feuille 1 : les tickets ──
    const rows = tickets.map((t) => ({
      'ID': getField(t, 'ticketNumber') || t.id,
      'Titre': getField(t, 'title') || '',
      'Description': truncate(getField(t, 'description') || '', 500),
      'Demandeur': getField(t, 'requester') || '',
      'Catégorie': getField(t, 'category') || '',
      'Priorité': getField(t, 'priority') || '',
      'Statut': getField(t, 'status') || '',
      'Statut réunion': (MEETING_STATUS[t.meetingStatus] || MEETING_STATUS.pending).label,
      'Nb remontées Mi Digital': Array.isArray(t.miDigitalDates) ? t.miDigitalDates.length : 0,
      'Dernière remontée Mi Digital': lastMiDate(t),
      'N° ticket groom': extractGroomNumber(t.groomLink) || '',
      'Lien groom': t.groomLink || '',
      'Notes de réunion': t.meetingNotes || '',
      'Créé le': formatDateTime(getField(t, 'createdAt'))
    }));

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 10 }, { wch: 40 }, { wch: 60 }, { wch: 18 }, { wch: 12 },
      { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 12 }, { wch: 24 },
      { wch: 14 }, { wch: 45 }, { wch: 50 }, { wch: 20 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Tickets nationaux');

    // ── Feuille 2 : historique des remontées Mi Digital ──
    const histRows = [];
    tickets.forEach((t) => {
      (Array.isArray(t.miDigitalDates) ? t.miDigitalDates : []).forEach((d) => {
        histRows.push({
          'ID': getField(t, 'ticketNumber') || t.id,
          'Titre': getField(t, 'title') || '',
          'Date de remontée': formatDateTime(d.at),
          'Par': d.by || ''
        });
      });
    });

    if (histRows.length) {
      const ws2 = XLSX.utils.json_to_sheet(histRows);
      ws2['!cols'] = [{ wch: 10 }, { wch: 45 }, { wch: 24 }, { wch: 25 }];
      XLSX.utils.book_append_sheet(wb, ws2, 'Historique MiDigital');
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `reunion-tickets-nationaux-${dateStr}.xlsx`);

    showToast('Export Excel généré avec succès.', 'success');
  } catch (error) {
    console.error('[meetings] Erreur export Excel :', error);
    showToast('Erreur lors de l’export Excel.', 'danger');
  } finally {
    btn.disabled = false;
    btn.innerHTML = btnHtml;
  }
}

// ------------------------------------------------------------
// 10. MISE À JOUR GÉNÉRIQUE FIRESTORE
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
// 11. FILTRES
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
// 12. STATISTIQUES (3 compteurs)
// ------------------------------------------------------------
function refreshStats() {
  const count = (status) =>
    allTickets.filter((t) => (t.meetingStatus || 'pending') === status).length;

  animateCounter(DOM.statTotal,   allTickets.length);
  animateCounter(DOM.statPending, count('pending'));
  animateCounter(DOM.statTreated, count('treated'));
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
// 13. UTILITAIRES
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

function truncate(text, max) {
  if (!text) return '';
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return clean.length > max ? clean.slice(0, max).trimEnd() + '…' : clean;
}

function toDate(value) {
  if (!value) return new Date(0);
  if (value.toDate) return value.toDate();
  const d = new Date(value);
  return isNaN(d) ? new Date(0) : d;
}

function formatDate(value) {
  if (!value) return 'N/A';
  return toDate(value).toLocaleDateString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric'
  });
}

function formatDateTime(value) {
  if (!value) return 'N/A';
  return toDate(value).toLocaleString('fr-FR', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
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

function extractGroomNumber(link) {
  if (!link) return null;
  let m = link.match(/\/demandes\/(\d+)/i);
  if (m) return m[1];
  m = link.match(/\/(\d{4,})(?:[\/?#]|$)/);
  if (m) return m[1];
  m = link.match(/(\d{4,})/);
  return m ? m[1] : null;
}

function groomCell(link) {
  if (!link) return '<span class="text-muted">—</span>';
  const num = extractGroomNumber(link);
  const label = num ? '#' + num : 'Groom';
  return `
    <a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer"
       class="groom-link" title="Ouvrir le ticket groom : ${escapeHtml(link)}">
      <i class="bi bi-link-45deg"></i> ${escapeHtml(label)}
    </a>`;
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
// 14. NETTOYAGE
// ------------------------------------------------------------
window.addEventListener('beforeunload', () => {
  if (unsubscribe) unsubscribe();
});
