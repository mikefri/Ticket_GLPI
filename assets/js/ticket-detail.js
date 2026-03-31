// assets/js/ticket-detail.js
// Page de détail d'un ticket avec système de chat (+ édition et suppression des messages)

import './app.js';
import { db } from './firebase-init.js';
import { requireAuth, toast, badgeForStatus, badgeForPriority, formatDate } from './app.js';

import {
  doc, getDoc, updateDoc, deleteDoc, collection, addDoc, query, orderBy, onSnapshot, Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentTicket = null;
let currentUser = null;
let isAdmin = false;
let unsubscribeComments = null;

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

  const descriptionEl = document.getElementById('ticket-description');
  descriptionEl.innerHTML = linkify(ticket.description) || 'Aucune description fournie.';

  // ✅ Pièces jointes
  if (ticket.attachments && ticket.attachments.length > 0) {
    displayAttachments(ticket.attachments);
  }

  if (isAdmin) {
    displayAdminActions(ticket);
  }
}

// ─────────────────────────────────────────────
// ✅ AFFICHAGE DES PIÈCES JOINTES (Base64)
// ─────────────────────────────────────────────
function displayAttachments(attachments) {
  const section = document.getElementById('attachments-section');
  const list    = document.getElementById('attachments-list');

  section.classList.remove('d-none');
  list.innerHTML = '';

  const images = attachments.filter(a =>
    a.type?.startsWith('image/') || a.data?.startsWith('data:image')
  );

  attachments.forEach((att) => {
    const isImage = att.type?.startsWith('image/') || att.data?.startsWith('data:image');

    if (isImage) {
      const img = document.createElement('img');
      img.src       = att.data;
      img.alt       = att.name || 'Pièce jointe';
      img.title     = att.name || 'Cliquer pour agrandir';
      img.className = 'attach-thumb';
      img.addEventListener('click', () => {
        const idx = images.findIndex(a => a.data === att.data);
        openLightbox(images, idx);
      });
      list.appendChild(img);

    } else {
      // Fichier non-image (PDF, etc.)
      const a = document.createElement('a');
      a.href      = att.data;
      a.download  = att.name || 'fichier';
      a.className = 'attach-file-badge';
      a.innerHTML = `
        <i class="bi bi-file-earmark-arrow-down" style="font-size:1.2rem;flex-shrink:0"></i>
        <div style="overflow:hidden;min-width:0">
          <div class="attach-file-name">${escapeHtml(att.name || 'Fichier')}</div>
          <div style="font-size:0.7rem;opacity:0.5">Télécharger</div>
        </div>
      `;
      list.appendChild(a);
    }
  });
}

// ─────────────────────────────────────────────
// ✅ LIGHTBOX
// ─────────────────────────────────────────────
function openLightbox(images, startIdx) {
  document.getElementById('__lightbox')?.remove();

  let idx = startIdx;

  const overlay = document.createElement('div');
  overlay.id = '__lightbox';

  function render() {
    const cur = images[idx];
    overlay.innerHTML = `
      <div class="lb-topbar">
        <span class="lb-name">
          <i class="bi bi-paperclip me-1"></i>${escapeHtml(cur.name || 'Image')}
          ${images.length > 1 ? `<span class="lb-counter">${idx + 1} / ${images.length}</span>` : ''}
        </span>
        <div class="lb-controls">
          <a href="${cur.data}" download="${escapeHtml(cur.name || 'image')}" class="lb-btn" title="Télécharger">
            <i class="bi bi-download"></i>
          </a>
          <button class="lb-btn" id="lb-close" title="Fermer" style="font-size:1.5rem;line-height:1">&times;</button>
        </div>
      </div>

      <img class="lb-img" src="${cur.data}" alt="${escapeHtml(cur.name || '')}">

      ${images.length > 1 ? `
        <button class="lb-nav lb-prev" ${idx === 0 ? 'disabled' : ''} title="Précédent">
          <i class="bi bi-chevron-left"></i>
        </button>
        <button class="lb-nav lb-next" ${idx === images.length - 1 ? 'disabled' : ''} title="Suivant">
          <i class="bi bi-chevron-right"></i>
        </button>
      ` : ''}
    `;

    overlay.querySelector('#lb-close')?.addEventListener('click', close);
    overlay.querySelector('.lb-prev')?.addEventListener('click', () => { if (idx > 0) { idx--; render(); } });
    overlay.querySelector('.lb-next')?.addEventListener('click', () => { if (idx < images.length - 1) { idx++; render(); } });
  }

  function close() {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }

  function onKey(e) {
    if (e.key === 'Escape')                                 close();
    if (e.key === 'ArrowLeft'  && idx > 0)                 { idx--; render(); }
    if (e.key === 'ArrowRight' && idx < images.length - 1) { idx++; render(); }
  }

  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);

  render();
  document.body.appendChild(overlay);
}

// Afficher les actions admin
function displayAdminActions(ticket) {
  const actionsSection = document.getElementById('admin-actions');
  actionsSection.classList.remove('d-none');

  const btnTake     = document.getElementById('btn-take-ticket');
  const btnResolve  = document.getElementById('btn-resolve-ticket');
  const btnProgress = document.getElementById('btn-progress-ticket');
  const btnClose    = document.getElementById('btn-close-ticket');

  if (ticket.status === 'Résolu' || ticket.status === 'Fermé') {
    btnTake.disabled = true;
    btnResolve.disabled = true;
    btnProgress.disabled = true;
  }

  if (ticket.status === 'Fermé') {
    btnClose.disabled = true;
  }

  btnTake.onclick     = () => takeTicket();
  btnResolve.onclick  = () => updateTicketStatus('Résolu');
  btnProgress.onclick = () => updateTicketStatus('En attente');
  btnClose.onclick    = () => closeTicket();
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

  if (!confirm('Êtes-vous sûr de vouloir fermer ce ticket ?')) return;

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

// ===== SYSTÈME DE CHAT =====

function loadComments(ticketId) {
  console.log('[chat] Chargement des commentaires pour ticket:', ticketId);

  const chatContainer = document.getElementById('chat-messages');
  if (!chatContainer) {
    console.error('[chat] Element #chat-messages non trouvé !');
    return;
  }

  if (unsubscribeComments) {
    unsubscribeComments();
  }

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
        const commentId = docSnap.id;
        console.log('[chat] Message:', comment);

        const isCurrentUser = currentUser && comment.createdBy === currentUser.uid;
        const canAct = isCurrentUser || isAdmin;

        const editedLabel = comment.editedAt
          ? `<span class="chat-edited-label"><i class="bi bi-pencil"></i> modifié</span>`
          : '';

        const bubble = document.createElement('div');
        bubble.className = `chat-message ${isCurrentUser ? 'user-message' : 'admin-message'}`;

        bubble.innerHTML = `
          <div class="chat-bubble">
            ${canAct ? `
              <div class="chat-actions">
                <button class="btn-chat-action btn-chat-edit" title="Modifier">
                  <i class="bi bi-pencil-fill"></i>
                </button>
                <button class="btn-chat-action btn-chat-delete" title="Supprimer">
                  <i class="bi bi-trash-fill"></i>
                </button>
              </div>
            ` : ''}
            <div class="chat-author">${escapeHtml(comment.userName || 'Utilisateur')}</div>
            <div class="chat-text" id="chat-text-${commentId}">${linkify(comment.text || '')}</div>
            <div class="chat-edit-area d-none" id="chat-edit-${commentId}">
              <textarea class="form-control form-control-sm mb-2" rows="2" style="resize:none;overflow:hidden;">${escapeHtml(comment.text || '')}</textarea>
              <div class="d-flex gap-2">
                <button class="btn btn-sm btn-success btn-save-edit">
                  <i class="bi bi-check-lg me-1"></i>Sauvegarder
                </button>
                <button class="btn btn-sm btn-secondary btn-cancel-edit">
                  <i class="bi bi-x-lg me-1"></i>Annuler
                </button>
              </div>
            </div>
            <div class="chat-time">${formatCommentDate(comment.createdAt)}${editedLabel}</div>
          </div>
        `;

        // ── Ouvrir l'édition : on cale la hauteur du textarea sur son contenu ──
        bubble.querySelector('.btn-chat-edit')?.addEventListener('click', () => {
          document.getElementById(`chat-text-${commentId}`)?.classList.add('d-none');
          const editArea = document.getElementById(`chat-edit-${commentId}`);
          editArea?.classList.remove('d-none');
          const ta = editArea?.querySelector('textarea');
          if (ta) {
            // Auto-size pour conserver la hauteur de la bulle
            ta.style.height = 'auto';
            ta.style.height = Math.max(ta.scrollHeight, 60) + 'px';
            ta.focus();
            ta.selectionStart = ta.selectionEnd = ta.value.length;
          }
        });

        bubble.querySelector('.btn-cancel-edit')?.addEventListener('click', () => {
          document.getElementById(`chat-text-${commentId}`)?.classList.remove('d-none');
          document.getElementById(`chat-edit-${commentId}`)?.classList.add('d-none');
        });

        bubble.querySelector('.btn-save-edit')?.addEventListener('click', async () => {
          const textarea = bubble.querySelector('.chat-edit-area textarea');
          const newText = textarea?.value?.trim();
          if (!newText) { toast('Le message ne peut pas être vide'); return; }

          const saveBtn = bubble.querySelector('.btn-save-edit');
          saveBtn.disabled = true;
          saveBtn.innerHTML = '<i class="bi bi-hourglass-split"></i>';

          try {
            await updateDoc(doc(db, 'tickets', currentTicket.id, 'comments', commentId), {
              text: newText,
              editedAt: Timestamp.now()
            });
            await updateDoc(doc(db, 'tickets', currentTicket.id), { updatedAt: Timestamp.now() });
            toast('Message modifié');
          } catch (error) {
            console.error('[chat] Erreur modification:', error);
            toast('Erreur: ' + error.message);
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Sauvegarder';
          }
        });

        bubble.querySelector('.chat-edit-area textarea')?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            bubble.querySelector('.btn-save-edit')?.click();
          }
          if (e.key === 'Escape') {
            bubble.querySelector('.btn-cancel-edit')?.click();
          }
        });

        bubble.querySelector('.btn-chat-delete')?.addEventListener('click', async () => {
          if (!confirm('Supprimer ce message définitivement ?')) return;
          try {
            await deleteDoc(doc(db, 'tickets', currentTicket.id, 'comments', commentId));
            await updateDoc(doc(db, 'tickets', currentTicket.id), { updatedAt: Timestamp.now() });
            toast('Message supprimé');
          } catch (error) {
            console.error('[chat] Erreur suppression:', error);
            toast('Erreur: ' + error.message);
          }
        });

        chatContainer.appendChild(bubble);
      });

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

// ===== UTILITAIRES =====

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
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  } catch (e) {
    console.error('[chat] Erreur formatage date:', e);
    return '';
  }
}

function escapeHtml(text) {
  if (!text) return '';
  const map = { '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

function linkify(text) {
  if (!text) return '';
  const urlRegex = /(https?:\/\/[^\s<>"']+)/g;
  return escapeHtml(text).replace(urlRegex, url =>
    `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`
  );
}

function resetTextareaHeight() {
  const textarea = document.getElementById('new-comment');
  if (textarea) {
    textarea.style.height = 'auto';
    textarea.style.height = '90px';
  }
}

async function addComment(text) {
  console.log('[chat] Tentative ajout message:', text);

  if (!currentTicket) { toast('Erreur: ticket non chargé'); return; }
  if (!currentUser)   { toast('Erreur: vous devez être connecté'); return; }
  if (!text || text.trim() === '') { toast('Le message ne peut pas être vide'); return; }

  const btnSend = document.getElementById('btn-add-comment');
  const textarea = document.getElementById('new-comment');

  try {
    if (btnSend) {
      btnSend.disabled = true;
      btnSend.innerHTML = '<i class="bi bi-hourglass-split"></i>';
    }

    await addDoc(collection(db, 'tickets', currentTicket.id, 'comments'), {
      text: text.trim(),
      createdBy: currentUser.uid,
      userName: currentUser.displayName || currentUser.email || 'Utilisateur',
      createdAt: Timestamp.now()
    });

    console.log('[chat] Message ajouté avec succès');
    if (textarea) { textarea.value = ''; resetTextareaHeight(); }
    await updateDoc(doc(db, 'tickets', currentTicket.id), { updatedAt: Timestamp.now() });

  } catch (error) {
    console.error('[chat] Erreur ajout message:', error);
    toast('Erreur lors de l\'envoi: ' + error.message);
  } finally {
    if (btnSend) {
      btnSend.disabled = false;
      btnSend.innerHTML = '<i class="bi bi-send-fill"></i>';
    }
  }
}

function showError(message) {
  document.getElementById('loading').classList.add('d-none');
  document.getElementById('error').classList.remove('d-none');
  document.getElementById('error-message').textContent = message;
}

// ===== EVENT LISTENERS =====

document.getElementById('btn-add-comment')?.addEventListener('click', () => {
  const textarea = document.getElementById('new-comment');
  if (textarea) addComment(textarea.value);
});

document.getElementById('new-comment')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    addComment(e.target.value);
  }
});

document.getElementById('new-comment')?.addEventListener('input', function () {
  this.style.height = 'auto';
  const newHeight = Math.min(this.scrollHeight, 200);
  this.style.height = Math.max(newHeight, 90) + 'px';
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

  const user = await requireAuth(true);
  console.log('[ticket-detail] Utilisateur après requireAuth:', user);

  if (!user) {
    showError('Vous devez être connecté pour voir ce ticket');
    return;
  }

  currentUser = user;
  isAdmin = window.__isAdmin === true;

  console.log('[ticket-detail] currentUser défini:', currentUser.email);
  console.log('[ticket-detail] isAdmin:', isAdmin);

  await loadTicket(ticketId);

  console.log('[ticket-detail] ===== INITIALISATION TERMINÉE =====');
})();
