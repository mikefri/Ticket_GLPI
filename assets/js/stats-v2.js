// assets/js/stats-v2.js
// Page Statistiques V2 - Format GLPI par colonnes (admin only)

import './app.js';
import { db } from './firebase-init.js';
import { requireAuth, toast } from './app.js';

import {
  collection, query, where, orderBy, getDocs, Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Mapping des statuts vers les colonnes
const STATUS_MAP = {
  'Ouvert': 'new',
  'En cours': 'assigned',
  'En attente': 'progress',
  'Résolu': 'solved'
};

// Calcul du nombre de jours depuis la création
function daysSince(timestamp) {
  if (!timestamp) return 0;
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diff = now - date;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// Formater un nom (prendre initiales ou raccourcir)
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
  
  const days = daysSince(ticket.createdAt);
  
  // ID - tronqué à 5 caractères
  const idDiv = document.createElement('div');
  idDiv.className = 'ticket-id';
  idDiv.textContent = ticket.id.substring(0, 5);
  idDiv.title = ticket.id; // ID complet au survol
  row.appendChild(idDiv);
  
  // Libellé
  const labelDiv = document.createElement('div');
  labelDiv.className = 'ticket-label';
  labelDiv.textContent = ticket.title || 'Sans titre';
  labelDiv.title = ticket.title || '';
  row.appendChild(labelDiv);
  
  // Client ou Technicien (selon la colonne)
  if (columnType === 'new') {
    const clientDiv = document.createElement('div');
    clientDiv.className = 'ticket-client';
    clientDiv.textContent = formatName(ticket.userName);
    clientDiv.title = ticket.userName || '';
    row.appendChild(clientDiv);
  } else {
    const techDiv = document.createElement('div');
    techDiv.className = 'ticket-tech';
    
    // Utiliser takenBy en priorité, puis assignedTo
    const techName = ticket.takenBy || ticket.assignedTo || '–';
    const techId = ticket.takenByUid || ticket.assignedToId || '';
    
    techDiv.innerHTML = `
      ${formatName(techName)}
      ${techId ? `<span class="ticket-tech-id">(${techId.substring(0, 5)})</span>` : ''}
    `;
    techDiv.title = techName;
    row.appendChild(techDiv);
  }
  
  // Jours (sauf pour résolus)
  if (columnType !== 'solved') {
    const daysDiv = document.createElement('div');
    daysDiv.className = 'ticket-days';
    daysDiv.textContent = days;
    row.appendChild(daysDiv);
  }
  
  // Click pour ouvrir le détail (optionnel)
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
    
    // D'abord, charger TOUS les tickets pour debug
    const qAll = query(ticketsRef);
    const snapshotAll = await getDocs(qAll);
    console.log('[stats-v2] Total tickets dans la base:', snapshotAll.size);
    
    // Afficher les statuts disponibles
    const statusCount = {};
    snapshotAll.forEach(doc => {
      const status = doc.data().status;
      statusCount[status] = (statusCount[status] || 0) + 1;
    });
    console.log('[stats-v2] Répartition par statut:', statusCount);
    
    // Grouper par colonne
    const columns = {
      new: [],
      assigned: [],
      progress: [],
      solved: []
    };
    
    snapshotAll.forEach(doc => {
      const data = doc.data();
      const ticket = { id: doc.id, ...data };
      const status = ticket.status;
      
      console.log(`[stats-v2] Ticket ${doc.id}: status="${status}", takenBy="${ticket.takenBy || 'N/A'}"`);
      
      // Mapping flexible des statuts
      if (status === 'Ouvert') {
        columns.new.push(ticket);
      } else if (status === 'En cours') {
        // Différencier selon assignation ou prise en charge
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
    
    console.log('[stats-v2] Colonnes après répartition:', {
      new: columns.new.length,
      assigned: columns.assigned.length,
      progress: columns.progress.length,
      solved: columns.solved.length
    });
    
    // Remplir les colonnes
    Object.keys(columns).forEach(col => {
      const countEl = document.getElementById(`count-${col}`);
      const listEl = document.getElementById(`list-${col}`);
      
      if (countEl) {
        countEl.textContent = columns[col].length;
        console.log(`[stats-v2] Colonne ${col}: ${columns[col].length} tickets`);
      }
      
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
    
    // Charger les stats de fermeture
    await loadClosedStats();
    
    console.log('[stats-v2] Chargement terminé avec succès');
    
  } catch (error) {
    console.error('[stats-v2] Erreur de chargement:', error);
    toast('Erreur lors du chargement des statistiques: ' + error.message);
  }
}

// Charger les stats de tickets fermés par période
async function loadClosedStats() {
  console.log('[stats-v2] Chargement des stats de fermeture...');
  
  try {
    const ticketsRef = collection(db, 'tickets');
    
    const now = new Date();
    
    // Aujourd'hui
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    
    // Cette semaine (lundi)
    const weekStart = new Date(now);
    const dayOfWeek = now.getDay() || 7; // Dimanche = 7
    weekStart.setDate(now.getDate() - (dayOfWeek - 1));
    weekStart.setHours(0, 0, 0, 0);
    
    // Ce mois
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    
    // Cette année
    const yearStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0);
    
    // Charger TOUS les tickets pour filtrer ensuite
    const qAll = query(ticketsRef);
    const snapAll = await getDocs(qAll);
    
    console.log('[stats-v2] Total de tous les tickets:', snapAll.size);
    
    let countToday = 0, countWeek = 0, countMonth = 0, countYear = 0, countTotal = 0;
    
    snapAll.forEach(doc => {
      const data = doc.data();
      const status = data.status;
      
      // Considérer comme "fermé" : Résolu OU Fermé
      if (status !== 'Résolu' && status !== 'Fermé') {
        return; // Ignorer les tickets non fermés
      }
      
      countTotal++; // Compter dans le total
      
      // Déterminer la date de fermeture
      let closeDate = null;
      
      if (data.closedAt) {
        closeDate = data.closedAt.toDate ? data.closedAt.toDate() : new Date(data.closedAt);
      } else if (data.updatedAt) {
        // Fallback sur updatedAt
        closeDate = data.updatedAt.toDate ? data.updatedAt.toDate() : new Date(data.updatedAt);
      } else if (data.createdAt) {
        // Dernier fallback
        closeDate = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
      }
      
      if (closeDate) {
        console.log(`[stats-v2] Ticket fermé ${doc.id}: status="${status}", date=${closeDate.toISOString()}`);
        
        if (closeDate >= todayStart) countToday++;
        if (closeDate >= weekStart) countWeek++;
        if (closeDate >= monthStart) countMonth++;
        if (closeDate >= yearStart) countYear++;
      }
    });
    
    // Mise à jour UI
    document.getElementById('footer-closed-today').textContent = countToday;
    document.getElementById('footer-closed-week').textContent = countWeek;
    document.getElementById('footer-closed-month').textContent = countMonth;
    document.getElementById('footer-closed-year').textContent = countYear;
    document.getElementById('footer-closed-total').textContent = countTotal;
    
    console.log('[stats-v2] Stats fermeture:', { 
      today: countToday, 
      week: countWeek, 
      month: countMonth, 
      year: countYear, 
      total: countTotal,
      todayStart: todayStart.toISOString()
    });
    
  } catch (error) {
    console.error('[stats-v2] Erreur stats fermeture:', error);
    // Continuer même en cas d'erreur
    document.getElementById('footer-closed-today').textContent = '0';
    document.getElementById('footer-closed-week').textContent = '0';
    document.getElementById('footer-closed-month').textContent = '0';
    document.getElementById('footer-closed-year').textContent = '0';
    document.getElementById('footer-closed-total').textContent = '0';
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
  
  console.log('[stats-v2] Utilisateur connecté:', user.email);
  
  // Vérif admin
  if (window.__isAdmin !== true) {
    console.warn('[stats-v2] Utilisateur non-admin, redirection...');
    toast('Accès admin requis');
    setTimeout(() => window.location.href = 'tickets.html', 800);
    return;
  }
  
  console.log('[stats-v2] Utilisateur admin confirmé');
  
  // Afficher les initiales de l'utilisateur
  const displayName = user.displayName || user.email?.split('@')[0] || 'User';
  const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  document.getElementById('user-display').textContent = initials;
  
  console.log('[stats-v2] Chargement des données...');
  await loadTickets();
})();
