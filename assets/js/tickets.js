// assets/js/tickets.js
// Gestion de la liste des tickets de l'utilisateur avec filtrage et navigation

import './app.js';
import { db } from './firebase-init.js';
import { requireAuth, badgeForStatus, badgeForPriority, formatDate, toast } from './app.js';

import {
  collection, query, where, orderBy, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// Éléments du DOM
const elList = document.getElementById('list');
const elEmpty = document.getElementById('empty');
const elLoading = document.getElementById('loading');
const filterStatus = document.getElementById('filter-status');
const filterCategory = document.getElementById('filter-category');
const btnResetFilters = document.getElementById('btn-reset-filters');

let unsub = null;
let currentUser = null;

/**
 * Génère le HTML pour une carte de ticket cliquable
 */
function renderTicketCard(docSnap) {
  const ticket = docSnap.data();
  const id = docSnap.id;

  // Échapper le HTML dans la description
  const descriptionSafe = (ticket.description || '').replace(/</g, '&lt;').substring(0, 100);
  const descriptionDisplay = descriptionSafe.length < (ticket.description || '').length 
    ? descriptionSafe + '...' 
    : descriptionSafe;

  return `
    <a href="ticket-detail.html?id=${encodeURIComponent(id)}" class="ticket-card text-decoration-none">
      <div class="card h-100">
        <div class="card-body d-flex flex-column">
          
          <!-- En-tête: titre et date -->
          <div class="d-flex justify-content-between align-items-start mb-3">
            <h5 class="card-title mb-0 flex-grow-1">${escapeHtml(ticket.title)}</h5>
            <div class="ticket-date">
              <small class="text-muted">${formatDate(ticket.createdAt)}</small>
            </div>
          </div>

          <!-- Badges: statut, priorité, catégorie -->
          <div class="ticket-badges mb-3">
            ${badgeForStatus(ticket.status)}
            ${badgeForPriority(ticket.priority)}
            <span class="badge bg-light text-dark">
              <i class="bi bi-tag-fill me-1"></i>${escapeHtml(ticket.category || 'Non spécifiée')}
            </span>
            ${ticket.type ? `<span class="badge bg-light text-dark">${escapeHtml(ticket.type)}</span>` : ''}
          </div>

          <!-- Description -->
          <p class="card-text text-muted flex-grow-1 mb-3">
            ${descapeHtml(descriptionDisplay)}
          </p>

          <!-- Identifiant du ticket -->
          <div class="ticket-footer">
            <small class="text-muted">
              <i class="bi bi-hash me-1"></i>Ticket #${escapeHtml(id)}
            </small>
          </div>

        </div>

        <!-- Arrow d'action au survol -->
        <div class="ticket-arrow">
          <i class="bi bi-chevron-right"></i>
        </div>
      </div>
    </a>
  `;
}

/**
 * Construit la query Firestore en fonction des filtres
 */
function buildQuery(user) {
  const clauses = [
    where('createdBy', '==', user.uid)
  ];

  if (filterStatus.value) {
    clauses.push(where('status', '==', filterStatus.value));
  }

  if (filterCategory.value) {
    clauses.push(where('category', '==', filterCategory.value));
  }

  // Tri par date de création (plus récent en premier)
  clauses.push(orderBy('createdAt', 'desc'));

  return query(collection(db, 'tickets'), ...clauses);
}

/**
 * Attache un listener Firestore et affiche les tickets
 */
async function attachListener(user) {
  if (unsub) {
    unsub();
  }

  elLoading.classList.remove('d-none');
  elList.innerHTML = '';
  elEmpty.classList.add('d-none');

  try {
    const q = buildQuery(user);

    unsub = onSnapshot(
      q,
      (snap) => {
        // Cacher le chargement
        elLoading.classList.add('d-none');
        elList.innerHTML = '';

        // Si aucun ticket
        if (snap.empty) {
          elEmpty.classList.remove('d-none');
          return;
        }

        // Afficher les tickets
        elEmpty.classList.add('d-none');
        snap.forEach((docSnap) => {
          elList.insertAdjacentHTML('beforeend', renderTicketCard(docSnap));
        });

        // Ajouter des event listeners sur les cartes
        attachCardListeners();
      },
      (err) => {
        // Gestion des erreurs
        console.error('[tickets] Erreur onSnapshot:', err);
        elLoading.classList.add('d-none');

        let message = 'Erreur de chargement des tickets';

        if (err?.code === 'failed-precondition' || err?.message?.includes('index')) {
          message = 'Cette recherche nécessite un index Firestore. Consultez la console pour plus de détails.';
        } else if (err?.code === 'permission-denied') {
          message = 'Permissions insuffisantes. Vérifiez vos droits d\'accès.';
        } else if (err?.message) {
          message += ': ' + err.message;
        }

        toast(message);
        elEmpty.classList.remove('d-none');
      }
    );

  } catch (error) {
    console.error('[tickets] Erreur buildQuery:', error);
    elLoading.classList.add('d-none');
    toast('Erreur lors de la construction de la requête: ' + error.message);
    elEmpty.classList.remove('d-none');
  }
}

/**
 * Ajoute les event listeners sur les cartes de tickets
 */
function attachCardListeners() {
  const cards = document.querySelectorAll('.ticket-card');
  
  cards.forEach((card) => {
    card.addEventListener('click', (e) => {
      // Éviter la navigation double si on clique sur le lien
      if (e.target.closest('a')) {
        return;
      }
      // Sinon, simuler un clic sur le lien
      card.click();
    });

    // Animation au survol
    card.addEventListener('mouseenter', () => {
      card.style.transform = 'translateY(-2px)';
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = 'translateY(0)';
    });
  });
}

/**
 * Réinitialise les filtres
 */
function resetFilters() {
  filterStatus.value = '';
  filterCategory.value = '';
  
  if (currentUser) {
    attachListener(currentUser);
  }
}

/**
 * Échappe le HTML
 */
function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, (m) => map[m]);
}

/**
 * Dés-échappe le HTML si nécessaire (pour l'affichage)
 */
function descapeHtml(text) {
  const map = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#039;': "'"
  };
  return String(text).replace(/&amp;|&lt;|&gt;|&quot;|&#039;/g, (m) => map[m]);
}

// ===== EVENT LISTENERS =====

filterStatus.addEventListener('change', () => {
  if (currentUser) {
    attachListener(currentUser);
  }
});

filterCategory.addEventListener('change', () => {
  if (currentUser) {
    attachListener(currentUser);
  }
});

btnResetFilters.addEventListener('click', resetFilters);

// ===== INITIALISATION =====
(async () => {
  console.log('[tickets] ===== INITIALISATION =====');

  // Vérifier l'authentification
  const user = await requireAuth(true);
  
  if (!user) {
    console.error('[tickets] Utilisateur non authentifié');
    toast('Vous devez être connecté pour voir vos tickets');
    return;
  }

  currentUser = user;
  console.log('[tickets] Utilisateur connecté:', user.email);

  // Charger les tickets
  await attachListener(user);

  console.log('[tickets] ===== INITIALISATION TERMINÉE =====');
})();
