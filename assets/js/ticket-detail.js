// assets/js/ticket-detail.js
// Page de détail d'un ticket avec système de chat

import './app.js';
import { db } from './firebase-init.js';
import { requireAuth, toast, badgeForStatus, badgeForPriority, formatDate } from './app.js';

import {
  doc, getDoc, updateDoc, collection, addDoc, query, orderBy, onSnapshot, Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentTicket = null;
let currentUser = null;
let isAdmin = false;
let unsubscribeComments = null; // Pour gérer le listener

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
    
    // Charger les commentaires APRÈS avoir vérifié currentUser
    if (currentUser) {
      loadComments(ticketId);
    } else {
      console.error('[ticket-detail] currentUser non défini !');
    }
    
  } catch (error) {
    console.error('[ticket-detail] Erreur de chargement:', error);
    showError('Erreur lors du chargement du ticket: ' + error.message);
  }
}

// Afficher le ticket
function displayTicket(ticket) {
  document.getElementById('loading').classList.add('d-none');
  document.getElementById('ticket-content').classList.remove('d-none');
  
  document.getElementById('ticket-title').textContent = ticket.title || 'Sans titre';
  document.getElementById('ticket-id').textContent = ticket.id;
  
  const badgesDiv = document.getElementById('ticket-badges');
  badgesDiv.innerHTML = `
    ${badgeForStatus(ticket.status)}
    ${badgeForPriority(ticket.priority)}
  `;
  
  document.getElementById('ticket-created').textContent = formatDate(ticket.createdAt);
  document.getElementById('ticket-updated').textContent = formatDate(ticket.updatedAt || ticket.createdAt);
  
  document.getElementById('requester-name').textContent = ticket.userName || 'Utilisateur inconnu';
  
  document.getElementById('ticket-category').textContent = ticket.category || 'Non spécifiée';
  const typeSpan = document.getElementById('ticket-type');
  if (ticket.type) {
    typeSpan.textContent = ' • ' + ticket.type;
  }
  
  const assignedName = ticket.takenBy || ticket.assignedTo || 'Non assigné';
  document.getElementById('assigned-name').textContent = assignedName;
  
  document.getElementById('ticket-description').textContent = ticket.description || 'Aucune description fournie.';
  
  if (ticket.attachments && ticket.attachments.length > 0) {
    displayAttachments(ticket.attachments);
  }
  
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
  
  const btnTake = document.getElementById('btn-take-ticket');
  const btnResolve = document.getElementById('btn-resolve-ticket');
  const btnProgress = document.getElementById('btn-progress-ticket');
  const btnClose = document.getElementById('btn-close-ticket');
  
  if (ticket.status === 'Résolu' || ticket.status === 'Fermé') {
    btnTake.disabled = true;
    btnResolve.disabled = true;
    btnProgress.disabled = true;
  }
  
  if (ticket.status === 'Fermé') {
    btnClose.disabled = true;
  }
  
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
    await loadTicket(currentTicket.id);
    
  } catch (error) {
    console.error('[ticket-detail] Erreur fermeture:', error);
    toast('Erreur lors de la fermeture: ' + error.message);
  }
}

// ===== SYSTÈME DE CHAT CORRIGÉ =====

// Charger et afficher les commentaires en bulles de chat
function loadComments(ticketId) {
  console.log('[chat] Chargement des commentaires pour ticket:', ticketId);
  
  const chatContainer = document.getElementById('chat-messages');
  if (!chatContainer) {
    console.error('[chat] Element #chat-messages non trouvé !');
    return;
  }
  
  // Annuler l'ancien listener si présent
  if (unsubscribeComments) {
    unsubscribeComments();
  }
  
  // Afficher un message de chargement
  chatContainer.innerHTML = '<div class="text-center text-muted py-3"><i class="bi bi-hourglass-split"></i> Chargement des messages...</div>';
  
  try {
    const commentsRef = collection(db, 'tickets', ticketId, 'comments');
    const q = query(commentsRef, orderBy('createdAt', 'asc'));
    
    unsubscribeComments = onSnapshot(q, (snapshot) => {
      console.log('[chat] Snapshot reçu, nb docs:', snapshot.size);
      
      chatContainer.innerHTML = '';
      
      if (snapshot.empty) {
        chatContainer.innerHTML = `
          <div class="text-center text-muted py-4">
            <i class="bi bi-chat-dots fs-1 d-block mb-2"></i>
            Aucun message pour le moment.<br>
            <small>Soyez le premier à écrire !</small>
          </div>
        `;
        return;
      }
      
      snapshot.forEach((docSnap) => {
        const comment = docSnap.data();
        console.log('[chat] Message:', comment);
        
        // Vérifier si c'est le message de l'utilisateur actuel
        const isCurrentUser = currentUser && comment.createdBy === currentUser.uid;
        
        const bubble = document.createElement('div');
        bubble.className = `chat-message ${isCurrentUser ? 'user-message' : 'admin-message'}`;
        
        bubble.innerHTML = `
          <div class="chat-bubble">
            <div class="chat-author">${escapeHtml(comment.userName || 'Utilisateur')}</div>
            <div class="chat-text">${escapeHtml(comment.text || '')}</div>
            <div class="chat-time">${formatCommentDate(comment.createdAt)}</div>
          </div>
        `;
        
        chatContainer.appendChild(bubble);
      });
      
      // Auto-scroll vers le bas
      chatContainer.scrollTop = chatContainer.scrollHeight;
      
    }, (error) => {
      console.error('[chat] Erreur onSnapshot:', error);
      chatContainer.innerHTML = `
        <div class="alert alert-danger m-3">
          <i class="bi bi-exclamation-triangle"></i> 
          Erreur de chargement des messages: ${error.message}
        </div>
      `;
    });
    
  } catch (error) {
    console.error('[chat] Erreur création query:', error);
    chatContainer.innerHTML = `
      <div class="alert alert-danger m-3">
        Erreur: ${error.message}
      </div>
    `;
  }
}

// Formater la date des commentaires
function formatCommentDate(timestamp) {
  if (!timestamp) return '';
  
  try {
    let date;
    if (timestamp.toDate) {
      date = timestamp.toDate();
    } else if (timestamp.seconds) {
      date = new Date(timestamp.seconds * 1000);
    } else {
      date = new Date(timestamp);
    }
    
    return date.toLocaleString('fr-FR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (e) {
    console.error('[chat] Erreur formatage date:', e);
    return '';
  }
}

// Échapper le HTML
function escapeHtml(text) {
  if (!text) return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

// Ajouter un commentaire
async function addComment(text) {
  console.log('[chat] Tentative ajout message:', text);
  
  if (!currentTicket) {
    console.error('[chat] Pas de ticket courant');
    toast('Erreur: ticket non chargé');
    return;
  }
  
  if (!currentUser) {
    console.error('[chat] Pas d\'utilisateur connecté');
    toast('Erreur: vous devez être connecté');
    return;
  }
  
  if (!text || text.trim() === '') {
    toast('Le message ne peut pas être vide');
    return;
  }
  
  const btnSend = document.getElementById('btn-add-comment');
  const textarea = document.getElementById('new-comment');
  
  try {
    // Désactiver le bouton pendant l'envoi
    if (btnSend) {
      btnSend.disabled = true;
      btnSend.innerHTML = '<i class="bi bi-hourglass-split"></i> Envoi...';
    }
    
    const commentsRef = collection(db, 'tickets', currentTicket.id, 'comments');
    
    await addDoc(commentsRef, {
      text: text.trim(),
      createdBy: currentUser.uid,
      userName: currentUser.displayName || currentUser.email || 'Utilisateur',
      createdAt: Timestamp.now()
    });
    
    console.log('[chat] Message ajouté avec succès');
    
    // Vider le champ
    if (textarea) textarea.value = '';
    
    // Mettre à jour la date de dernière modification du ticket
    const ticketRef = doc(db, 'tickets', currentTicket.id);
    await updateDoc(ticketRef, {
      updatedAt: Timestamp.now()
    });
    
  } catch (error) {
    console.error('[chat] Erreur ajout message:', error);
    toast('Erreur lors de l\'envoi: ' + error.message);
  } finally {
    // Réactiver le bouton
    if (btnSend) {
      btnSend.disabled = false;
      btnSend.innerHTML = '<i class="bi bi-send-fill me-1"></i> Envoyer';
    }
  }
}

// Afficher une erreur
function showError(message) {
  document.getElementById('loading').classList.add('d-none');
  document.getElementById('error').classList.remove('d-none');
  document.getElementById('error-message').textContent = message;
}

// ===== EVENT LISTENERS =====

// Bouton envoyer
document.getElementById('btn-add-comment')?.addEventListener('click', () => {
  const textarea = document.getElementById('new-comment');
  if (textarea) {
    addComment(textarea.value);
  }
});

// Entrée avec Ctrl+Enter ou juste Enter
document.getElementById('new-comment')?.addEventListener('keydown', (e) => {
  // Enter sans Shift = envoyer
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    addComment(e.target.value);
  }
});

// ===== INITIALISATION =====
(async () => {
  console.log('[ticket-detail] ===== INITIALISATION =====');
  
  const ticketId = getTicketIdFromUrl();
  console.log('[ticket-detail] Ticket ID depuis URL:', ticketId);
  
  if (!ticketId) {
    showError('Aucun ID de ticket fourni dans l\'URL');
    return;
  }
  
  // Authentification
  const user = await requireAuth(true);
  console.log('[ticket-detail] Utilisateur après requireAuth:', user);
  
  if (!user) {
    showError('Vous devez être connecté pour voir ce ticket');
    return;
  }
  
  // IMPORTANT: définir currentUser AVANT de charger le ticket
  currentUser = user;
  isAdmin = window.__isAdmin === true;
  
  console.log('[ticket-detail] currentUser défini:', currentUser.email);
  console.log('[ticket-detail] isAdmin:', isAdmin);
  
  // Charger le ticket
  await loadTicket(ticketId);
  
  console.log('[ticket-detail] ===== INITIALISATION TERMINÉE =====');
})();
