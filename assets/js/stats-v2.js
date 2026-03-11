// assets/js/stats-v2.js
// Page Statistiques V2 - Format GLPI par colonnes (admin only)

import './app.js';
import { db } from './firebase-init.js';
import { requireAuth, toast } from './app.js';

import {
  collection, query, getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Calcul du nombre de jours depuis la création
function daysSince(timestamp) {
  if (!timestamp) return 0;
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// Formater un nom
function formatName(name) {
  if (!name) return '–';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) {
    return `${parts[0]} ${parts[1].charAt(0)}.`;
  }
  return name.length > 15 ? name.substring(0, 15) + '…' : name;
}

// Générer une ligne de ticket
function createTicketRow(ticket, columnType) {
  const row = document.createElement('div');
  row.className = 'ticket-row';
  row.dataset.id = ticket.id;
  row.style.cursor = 'pointer';

  const days = daysSince(ticket.createdAt);

  const idDiv = document.createElement('div');
  idDiv.className = 'ticket-id';
  const idLink = document.createElement('a');
  idLink.href = `ticket-detail.html?id=${ticket.id}`;
  idLink.textContent = ticket.id.substring(0, 5);
  idLink.title = ticket.id;
  idLink.style.textDecoration = 'none';
  idLink.style.color = 'inherit';
  idLink.addEventListener('click', (e) => e.stopPropagation());
  idDiv.appendChild(idLink);
  row.appendChild(idDiv);

  const labelDiv = document.createElement('div');
  labelDiv.className = 'ticket-label';
  labelDiv.textContent = ticket.title || 'Sans titre';
  labelDiv.title = ticket.title || '';
  row.appendChild(labelDiv);

  if (columnType === 'new') {
    const clientDiv = document.createElement('div');
    clientDiv.className = 'ticket-client';
    clientDiv.textContent = formatName(ticket.userName);
    clientDiv.title = ticket.userName || '';
    row.appendChild(clientDiv);
  } else {
    const techDiv = document.createElement('div');
    techDiv.className = 'ticket-tech';
    const techName = ticket.takenBy || ticket.assignedTo || '–';
    const techId = ticket.takenByUid || ticket.assignedToId || '';
    techDiv.innerHTML = `
      ${formatName(techName)}
      ${techId ? `<span class="ticket-tech-id">(${techId.substring(0, 5)})</span>` : ''}
    `;
    techDiv.title = techName;
    row.appendChild(techDiv);
  }

  if (columnType !== 'solved') {
    const daysDiv = document.createElement('div');
    daysDiv.className = 'ticket-days';
    daysDiv.textContent = days;
    row.appendChild(daysDiv);
  }

  row.addEventListener('click', () => {
    window.location.href = `ticket-detail.html?id=${ticket.id}`;
  });

  return row;
}

// Charger les tickets par statut
async function loadTickets() {
  console.log('[stats-v2] Début du chargement des tickets...');

  try {
    const ticketsRef = collection(db, 'tickets');
    const snapshotAll = await getDocs(query(ticketsRef));
    console.log('[stats-v2] Total tickets dans la base:', snapshotAll.size);

    const statusCount = {};
    snapshotAll.forEach(doc => {
      const status = doc.data().status;
      statusCount[status] = (statusCount[status] || 0) + 1;
    });
    console.log('[stats-v2] Répartition par statut:', statusCount);

    const columns = { new: [], assigned: [], progress: [], solved: [] };

    snapshotAll.forEach(doc => {
      const data = doc.data();
      const ticket = { id: doc.id, ...data };
      const status = ticket.status;

      if (status === 'Ouvert') {
        columns.new.push(ticket);
      } else if (status === 'En cours') {
        if (ticket.takenBy || ticket.assignedTo) {
          columns.assigned.push(ticket);
        } else {
          columns.new.push(ticket);
        }
      } else if (status === 'En attente') {
        columns.progress.push(ticket);
      } else if (status === 'Résolu') {
        columns.solved.push(ticket);
      }
    });

    Object.keys(columns).forEach(col => {
      const countEl = document.getElementById(`count-${col}`);
      const listEl = document.getElementById(`list-${col}`);

      if (countEl) countEl.textContent = columns[col].length;

      if (listEl) {
        listEl.innerHTML = '';
        if (columns[col].length === 0) {
          const empty = document.createElement('div');
          empty.className = 'empty-state';
          empty.textContent = 'Aucun ticket';
          listEl.appendChild(empty);
        } else {
          columns[col].forEach(ticket => {
            listEl.appendChild(createTicketRow(ticket, col));
          });
        }
      }
    });

    await loadClosedStats();
    console.log('[stats-v2] Chargement terminé avec succès');

  } catch (error) {
    console.error('[stats-v2] Erreur de chargement:', error);
    toast('Erreur lors du chargement des statistiques: ' + error.message);
  }
}

// Charger les stats de tickets ouverts et fermés par période
async function loadClosedStats() {
  console.log('[stats-v2] Chargement des stats...');

  try {
    const ticketsRef = collection(db, 'tickets');
    const now = new Date();

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

    const weekStart = new Date(now);
    const dayOfWeek = now.getDay() || 7;
    weekStart.setDate(now.getDate() - (dayOfWeek - 1));
    weekStart.setHours(0, 0, 0, 0);

    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    const yearStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0);

    const snapAll = await getDocs(query(ticketsRef));

    let countToday = 0, countWeek = 0, countMonth = 0, countYear = 0, countTotal = 0;
    let countOpenToday = 0, countOpenWeek = 0, countOpenMonth = 0, countOpenYear = 0, countOpenTotal = 0;

    const openStatuses = ['Ouvert', 'En cours', 'En attente', 'Résolu'];

    snapAll.forEach(doc => {
      const data = doc.data();
      const status = data.status;

      // --- Tickets ouverts (basé sur createdAt) ---
      if (openStatuses.includes(status)) {
        countOpenTotal++;
        let openDate = null;
        if (data.createdAt) {
          openDate = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
        }
        if (openDate) {
          if (openDate >= todayStart) countOpenToday++;
          if (openDate >= weekStart) countOpenWeek++;
          if (openDate >= monthStart) countOpenMonth++;
          if (openDate >= yearStart) countOpenYear++;
        }
      }

      // --- Tickets fermés (basé sur closedAt / updatedAt / createdAt) ---
      if (status !== 'Fermé') return;

      countTotal++;

      let closeDate = null;
      if (data.closedAt) {
        closeDate = data.closedAt.toDate ? data.closedAt.toDate() : new Date(data.closedAt);
      } else if (data.updatedAt) {
        closeDate = data.updatedAt.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt);
      } else if (data.createdAt) {
        closeDate = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
      }

      if (closeDate) {
        if (closeDate >= todayStart) countToday++;
        if (closeDate >= weekStart) countWeek++;
        if (closeDate >= monthStart) countMonth++;
        if (closeDate >= yearStart) countYear++;
      }
    });

    // Mise à jour UI — Ouverts
    document.getElementById('footer-open-today').textContent = countOpenToday;
    document.getElementById('footer-open-week').textContent = countOpenWeek;
    document.getElementById('footer-open-month').textContent = countOpenMonth;
    document.getElementById('footer-open-year').textContent = countOpenYear;
    document.getElementById('footer-open-total').textContent = countOpenTotal;

    // Mise à jour UI — Clos
    document.getElementById('footer-closed-today').textContent = countToday;
    document.getElementById('footer-closed-week').textContent = countWeek;
    document.getElementById('footer-closed-month').textContent = countMonth;
    document.getElementById('footer-closed-year').textContent = countYear;
    document.getElementById('footer-closed-total').textContent = countTotal;

    console.log('[stats-v2] Stats:', {
      open: { today: countOpenToday, week: countOpenWeek, month: countOpenMonth, year: countOpenYear, total: countOpenTotal },
      closed: { today: countToday, week: countWeek, month: countMonth, year: countYear, total: countTotal }
    });

  } catch (error) {
    console.error('[stats-v2] Erreur stats:', error);
    ['open', 'closed'].forEach(prefix => {
      ['today', 'week', 'month', 'year', 'total'].forEach(period => {
        const el = document.getElementById(`footer-${prefix}-${period}`);
        if (el) el.textContent = '0';
      });
    });
  }
}

// Bouton refresh
document.getElementById('btn-refresh')?.addEventListener('click', () => {
  loadTickets();
  toast('Données actualisées');
});

// Bootstrap
(async () => {
  console.log('[stats-v2] Initialisation de la page...');

  const user = await requireAuth(true);
  if (!user) {
    console.error('[stats-v2] Aucun utilisateur connecté');
    return;
  }

  if (window.__isAdmin !== true) {
    toast('Accès admin requis');
    setTimeout(() => window.location.href = 'tickets.html', 800);
    return;
  }

  const displayName = user.displayName || user.email?.split('@')[0] || 'User';
  const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  document.getElementById('user-display').textContent = initials;

  await loadTickets();
})();
