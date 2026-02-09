// assets/js/ticket-detail.js
// Page de détail d'un ticket avec système de chat

import './app.js';
import { db } from './firebase-init.js';
import { requireAuth, toast, badgeForStatus, badgeForPriority, formatDate } from './app.js';

import {
  doc, getDoc, updateDoc, collection, addDoc, query, where, orderBy, onSnapshot, Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

import { getAuth } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

let currentTicket = null;
let currentUser = null;
let isAdmin = false;

// Récupérer l'ID du ticket depuis l'URL
function getTicketIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  return params.get('id');
}

// Charger le ticket
async function loadTicket(ticketId) {
  console.log('[ticket-detail] Chargement du ticket:', ticketId);
  
  try {
    const ticketRef = doc(db, 'tickets', ticketId);
    const ticketSnap = await getDoc(ticketRef);
    
    if (!ticketSnap.exists()) {
      showError('Ticket introuvable');
      return;
    }
    
    currentTicket = { id: ticketSnap.id, ...ticketSnap.data() };
    console.log('[ticket-detail] Ticket chargé:', currentTicket);
    
    displayTicket(currentTicket);
    loadComments(ticketId);
    
  } catch (error) {
    console.error('[ticket-detail] Erreur de chargement:', error);
    showError('Erreur lors du chargement du ticket: ' + error.message);
  }
}

// Afficher le ticket
function displayTicket(ticket) {
  // Masquer le chargement, afficher le contenu
  document.getElementById('loading').classList.add('d-none');
  document.getElementById('ticket-content').classList.remove('d-none');
  
  // Titre et ID
  document.getElementById('ticket-title').textContent = ticket.title || 'Sans titre';
  document.getElementById('ticket-id').textContent = ticket.id;
  
  // Badges
  const badgesDiv = document.getElementById('ticket-badges');
  badgesDiv.innerHTML = `
    ${badgeForStatus(ticket.status)}
    ${badgeForPriority(ticket.priority)}
  `;
  
  // Dates
  document.getElementById('ticket-created').textContent = formatDate(ticket.createdAt);
  document.getElementById('ticket-updated').textContent = formatDate(ticket.updatedAt || ticket.createdAt);
  
  // Demandeur
  document.getElementById('requester-name').textContent = ticket.userName || 'Utilisateur inconnu';
  
  // Catégorie et type
  document.getElementById('ticket-category').textContent = ticket.category || 'Non spécifiée';
  const typeSpan = document.getElementById('ticket-type');
  if (ticket.type) {
    typeSpan.textContent = ' • ' + ticket.type;
  }
  
  // Assigné à
  const assignedName = ticket.takenBy || ticket.assignedTo || 'Non assigné';
  document.getElementById('assigned-name').textContent = assignedName;
  
  // Description
  document.getElementById('ticket-description').textContent = ticket.description || 'Aucune description fournie.';
  
  // Pièces jointes
  if (ticket.attachments && ticket.attachments.length > 0) {
    displayAttachments(ticket.attachments);
  }
  
  // Actions admin
  if (isAdmin) {
    displayAdminActions(ticket);
  }
}

// Afficher les pièces jointes
function displayAttachments(attachments) {
  const section = document.getElementById('attachments-section');
  const list = document.getElementById('attachments-list');
  
  section.style.display = 'block';
  list.innerHTML = '';
  
  attachments.forEach(att => {
    const item = document.createElement('div');
    item.className = 'attachment-item';
    item.innerHTML = `
      <i class="bi bi-file-earmark-text attachment-icon"></i>
      <div class="flex-grow-1">
        <div class="fw-medium">${att.name || 'Fichier'}</div>
        <small class="text-muted">${att.size || ''}</small>
      </div>
      <a href="${att.url}" target="_blank" class="btn btn-sm btn-outline-primary">
        <i class="bi bi-download"></i> Télécharger
      </a>
    `;
    list.appendChild(item);
  });
}

// Afficher les actions admin
function displayAdminActions(ticket) {
  const actionsSection = document.getElementById('admin-actions');
  actionsSection.classList.remove('d-none');
  
  // Boutons d'action
  const btnTake = document.getElementById('btn-take-ticket');
  const btnResolve = document.getElementById('btn-resolve-ticket');
  const btnProgress = document.getElementById('btn-progress-ticket');
  const btnClose = document.getElementById('btn-close-ticket');
  
  // Adapter les boutons selon le statut
  if (ticket.status === 'Résolu' || ticket.status === 'Fermé') {
    btnTake.disabled = true;
    btnResolve.disabled = true;
    btnProgress.disabled = true;
  }
  
  if (ticket.status === 'Fermé') {
    btnClose.disabled = true;
  }
  
  // Événements
  btnTake.onclick = () => takeTicket();
  btnResolve.onclick = () => updateTicketStatus('Résolu');
  btnProgress.onclick = () => updateTicketStatus('En attente');
  btnClose.onclick = () => closeTicket();
}

// Prendre en charge un ticket
async function takeTicket() {
  if (!currentTicket || !currentUser) return;
  
  try {
    const ticketRef = doc(db, 'tickets', currentTicket.id);
    const userName = currentUser.displayName || currentUser.email;
    
    await updateDoc(ticketRef, {
      status: 'En cours',
      takenBy: userName,
      takenByUid: currentUser.uid,
      updatedAt: Timestamp.now()
    });
    
    toast('Ticket pris en charge avec succès');
    
    // Recharger
    await loadTicket(currentTicket.id);
    
  } catch (error) {
    console.error('[ticket-detail] Erreur prise en charge:', error);
    toast('Erreur lors de la prise en charge: ' + error.message);
  }
}

// Mettre à jour le statut
async function updateTicketStatus(newStatus) {
  if (!currentTicket) return;
  
  try {
    const ticketRef = doc(db, 'tickets', currentTicket.id);
    
    await updateDoc(ticketRef, {
      status: newStatus,
      updatedAt: Timestamp.now()
    });
    
    toast(`Statut mis à jour : ${newStatus}`);
    
    // Recharger
    await loadTicket(currentTicket.id);
    
  } catch (error) {
    console.error('[ticket-detail] Erreur mise à jour statut:', error);
    toast('Erreur lors de la mise à jour: ' + error.message);
  }
}

// Fermer le ticket
async function closeTicket() {
  if (!currentTicket) return;
  
  if (!confirm('Êtes-vous sûr de vouloir fermer ce ticket ?')) {
    return;
  }
  
  try {
    const ticketRef = doc(db, 'tickets', currentTicket.id);
    
    await updateDoc(ticketRef, {
      status: 'Fermé',
      closedAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    });
    
    toast('Ticket fermé avec succès');
    
    // Recharger
    await loadTicket(currentTicket.id);
    
  } catch (error) {
    console.error('[ticket-detail] Erreur fermeture:', error);
    toast('Erreur lors de la fermeture: ' + error.message);
  }
}

// ===== SYSTÈME DE CHAT AVEC BULLES =====

// Charger et afficher les commentaires en bulles de chat
function loadComments(ticketId) {
  const chatContainer = document.getElementById('chat-messages');
  chatContainer.innerHTML = '';
  
  const commentsRef = collection(db, 'tickets', ticketId, 'comments');
  const q = query(commentsRef, orderBy('createdAt', 'asc'));
  
  onSnapshot(q, (snapshot) => {
    chatContainer.innerHTML = '';
    
    snapshot.forEach((doc) => {
      const comment = doc.data();
      const isCurrentUser = comment.createdBy === currentUser.uid;
      
      const bubble = document.createElement('div');
      bubble.className = `chat-message ${isCurrentUser ? 'user-message' : 'admin-message'}`;
      
      bubble.innerHTML = `
        <div class="chat-bubble">
          <div class="chat-author">${comment.userName || 'Utilisateur'}</div>
          <div class="chat-text">${escapeHtml(comment.text)}</div>
          <div class="chat-time">${formatDate(comment.createdAt)}</div>
        </div>
      `;
      
      chatContainer.appendChild(bubble);
    });
    
    // Auto-scroller vers le bas
    chatContainer.scrollTop = chatContainer.scrollHeight;
  }, (error) => {
    console.error('[ticket-detail] Erreur chargement commentaires:', error);
  });
}

// Échapper le HTML pour éviter les injections
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Ajouter un commentaire
async function addComment(text) {
  if (!currentTicket || !currentUser) return;
  
  if (!text || text.trim() === '') {
    toast('Le message ne peut pas être vide');
    return;
  }
  
  try {
    const commentsRef = collection(db, 'tickets', currentTicket.id, 'comments');
    
    await addDoc(commentsRef, {
      text: text.trim(),
      createdBy: currentUser.uid,
      userName: currentUser.displayName || currentUser.email,
      createdAt: Timestamp.now()
    });
    
    // Vider le champ
    const textarea = document.getElementById('new-comment');
    if (textarea) textarea.value = '';
    
    console.log('[ticket-detail] Message envoyé');
    
  } catch (error) {
    console.error('[ticket-detail] Erreur ajout message:', error);
    toast('Erreur lors de l\'envoi: ' + error.message);
  }
}

// Afficher une erreur
function showError(message) {
  document.getElementById('loading').classList.add('d-none');
  document.getElementById('error').classList.remove('d-none');
  document.getElementById('error-message').textContent = message;
}

// Bouton ajouter commentaire
document.getElementById('btn-add-comment')?.addEventListener('click', () => {
  const text = document.getElementById('new-comment').value;
  addComment(text);
});

// Permettre Ctrl+Enter ou Shift+Enter pour envoyer
document.getElementById('new-comment')?.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.shiftKey) && e.key === 'Enter') {
    const text = e.target.value;
    addComment(text);
  }
});

// Initialisation
(async () => {
  console.log('[ticket-detail] Initialisation...');
  
  // Récupérer l'ID du ticket
  const ticketId = getTicketIdFromUrl();
  if (!ticketId) {
    showError('Aucun ID de ticket fourni dans l\'URL');
    return;
  }
  
  // Authentification
  const user = await requireAuth(true);
  if (!user) {
    showError('Vous devez être connecté pour voir ce ticket');
    return;
  }
  
  currentUser = user;
  isAdmin = window.__isAdmin === true;
  
  console.log('[ticket-detail] Utilisateur:', user.email, 'Admin:', isAdmin);
  
  // Charger le ticket
  await loadTicket(ticketId);
})();
