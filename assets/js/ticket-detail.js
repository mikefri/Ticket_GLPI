// assets/js/ticket-detail.js
import './app.js';
import { db } from './firebase-init.js';
import { requireAuth, toast, badgeForStatus, badgeForPriority, formatDate } from './app.js';

import {
  doc, getDoc, updateDoc, deleteDoc,
  collection, addDoc, query, orderBy, onSnapshot, Timestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

let currentTicket    = null;
let currentUser      = null;
let isAdmin          = false;
let unsubscribeComments = null;

// ─────────────────────────────────────────────
// URL PARAMS
// ─────────────────────────────────────────────
function getTicketIdFromUrl() {
  return new URLSearchParams(window.location.search).get('id');
}

// ─────────────────────────────────────────────
// CHARGEMENT DU TICKET
// ─────────────────────────────────────────────
async function loadTicket(ticketId) {
  try {
    const snap = await getDoc(doc(db, 'tickets', ticketId));
    if (!snap.exists()) { showError('Ticket introuvable'); return; }

    currentTicket = { id: snap.id, ...snap.data() };
    displayTicket(currentTicket);

    if (currentUser) loadComments(ticketId);

  } catch (err) {
    console.error('[ticket-detail] Erreur chargement:', err);
    showError('Erreur lors du chargement du ticket : ' + err.message);
  }
}

// ─────────────────────────────────────────────
// AFFICHAGE DU TICKET
// ─────────────────────────────────────────────
function displayTicket(ticket) {
  document.getElementById('loading').classList.add('d-none');
  document.getElementById('ticket-content').classList.remove('d-none');

  document.getElementById('ticket-title').textContent   = ticket.title || 'Sans titre';
  document.getElementById('ticket-id').textContent      = ticket.id;
  document.getElementById('ticket-created').textContent = formatDate(ticket.createdAt);
  document.getElementById('ticket-updated').textContent = formatDate(ticket.updatedAt || ticket.createdAt);
  document.getElementById('requester-name').textContent = ticket.userName || 'Utilisateur inconnu';
  document.getElementById('assigned-name').textContent  = ticket.takenBy || ticket.assignedTo || 'Non assigné';

  // Badges
  document.getElementById('ticket-badges').innerHTML =
    `${badgeForStatus(ticket.status)} ${badgeForPriority(ticket.priority)}`;

  // Catégorie / Type
  document.getElementById('ticket-category').textContent = ticket.category || 'Non spécifiée';
  const typeSpan = document.getElementById('ticket-type');
  typeSpan.textContent = ticket.type ? ' · ' + ticket.type : '';

  // Description
  document.getElementById('ticket-description').innerHTML =
    linkify(ticket.description) || 'Aucune description fournie.';

  // Pièces jointes
  if (ticket.attachments && ticket.attachments.length > 0) {
    displayAttachments(ticket.attachments);
  }

  // Actions admin
  if (isAdmin) displayAdminActions(ticket);
}

// ─────────────────────────────────────────────
// PIÈCES JOINTES (Base64)
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
      a.className = 'attach-file';
      a.innerHTML = `
        <i class="bi bi-file-earmark-arrow-down"></i>
        <div style="overflow:hidden;min-width:0">
          <div class="attach-file-name">${escapeHtml(att.name || 'Fichier')}</div>
          <div class="attach-file-sub">Télécharger</div>
        </div>
      `;
      list.appendChild(a);
    }
  });
}

// ─────────────────────────────────────────────
// LIGHTBOX
// ─────────────────────────────────────────────
function openLightbox(images, startIdx) {
  document.getElementById('__lightbox')?.remove();

  let idx = startIdx;

  const overlay = document.createElement('div');
  overlay.id = '__lightbox';

  function render() {
    const cur = images[idx];
    overlay.innerHTML = `
      <div class="lb-bar">
        <span class="lb-title">
          <i class="bi bi-paperclip me-1"></i>${escapeHtml(cur.name || 'Image')}
          ${images.length > 1 ? `<span class="lb-counter">${idx + 1} / ${images.length}</span>` : ''}
        </span>
        <div class="lb-actions">
          <a href="${cur.data}" download="${escapeHtml(cur.name || 'image')}" class="lb-btn" title="Télécharger">
            <i class="bi bi-download"></i>
          </a>
          <button class="lb-btn" id="lb-close" title="Fermer" style="font-size:1.5rem">&times;</button>
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
    if (e.key === 'Escape')                                   close();
    if (e.key === 'ArrowLeft'  && idx > 0)                   { idx--; render(); }
    if (e.key === 'ArrowRight' && idx < images.length - 1)   { idx++; render(); }
  }

  // Fermer en cliquant sur le fond
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey);

  render();
  document.body.appendChild(overlay);
}

// ─────────────────────────────────────────────
// ACTIONS ADMIN
// ─────────────────────────────────────────────
function displayAdminActions(ticket) {
  const section = document.getElementById('admin-actions');
  section.classList.remove('d-none');

  const btnTake     = document.getElementById('btn-take-ticket');
  const btnResolve  = document.getElementById('btn-resolve-ticket');
  const btnProgress = document.getElementById('btn-progress-ticket');
  const btnClose    = document.getElementById('btn-close-ticket');

  const closed = ticket.status === 'Résolu' || ticket.status === 'Fermé';
  btnTake.disabled     = closed;
  btnResolve.disabled  = closed;
  btnProgress.disabled = closed;
  btnClose.disabled    = ticket.status === 'Fermé';

  btnTake.onclick     = takeTicket;
  btnResolve.onclick  = () => updateTicketStatus('Résolu');
  btnProgress.onclick = () => updateTicketStatus('En attente');
  btnClose.onclick    = closeTicket;
}

async function takeTicket() {
  if (!currentTicket || !currentUser) return;
  try {
    await updateDoc(doc(db, 'tickets', currentTicket.id), {
      status: 'En cours',
      takenBy: currentUser.displayName || currentUser.email,
      takenByUid: currentUser.uid,
      updatedAt: Timestamp.now()
    });
    toast('Ticket pris en charge avec succès');
    await loadTicket(currentTicket.id);
  } catch (err) {
    toast('Erreur : ' + err.message);
  }
}

async function updateTicketStatus(newStatus) {
  if (!currentTicket) return;
  try {
    await updateDoc(doc(db, 'tickets', currentTicket.id), {
      status: newStatus, updatedAt: Timestamp.now()
    });
    toast(`Statut mis à jour : ${newStatus}`);
    await loadTicket(currentTicket.id);
  } catch (err) {
    toast('Erreur : ' + err.message);
  }
}

async function closeTicket() {
  if (!currentTicket) return;
  if (!confirm('Êtes-vous sûr de vouloir fermer ce ticket ?')) return;
  try {
    await updateDoc(doc(db, 'tickets', currentTicket.id), {
      status: 'Fermé', closedAt: Timestamp.now(), updatedAt: Timestamp.now()
    });
    toast('Ticket fermé avec succès');
    await loadTicket(currentTicket.id);
  } catch (err) {
    toast('Erreur : ' + err.message);
  }
}

// ─────────────────────────────────────────────
// CHAT
// ─────────────────────────────────────────────
function loadComments(ticketId) {
  const container = document.getElementById('chat-messages');
  if (!container) return;

  unsubscribeComments?.();
  container.innerHTML = `<div class="chat-empty"><i class="bi bi-hourglass-split"></i><p>Chargement…</p></div>`;

  try {
    const q = query(collection(db, 'tickets', ticketId, 'comments'), orderBy('createdAt', 'asc'));

    unsubscribeComments = onSnapshot(q, (snapshot) => {
      container.innerHTML = '';

      if (snapshot.empty) {
        container.innerHTML = `
          <div class="chat-empty">
            <i class="bi bi-chat-dots"></i>
            <p>Aucun message pour le moment.<br><small>Soyez le premier à écrire !</small></p>
          </div>`;
        return;
      }

      snapshot.forEach((docSnap) => {
        const comment   = docSnap.data();
        const commentId = docSnap.id;
        const isMe      = currentUser && comment.createdBy === currentUser.uid;
        const canAct    = isMe || isAdmin;

        const bubble = document.createElement('div');
        bubble.className = `chat-message ${isMe ? 'user-message' : 'admin-message'}`;
        bubble.innerHTML = `
          <div class="chat-bubble">
            ${canAct ? `
              <div class="chat-actions">
                <button class="btn-chat-action btn-chat-edit"   title="Modifier"><i class="bi bi-pencil-fill"></i></button>
                <button class="btn-chat-action btn-chat-delete" title="Supprimer"><i class="bi bi-trash-fill"></i></button>
              </div>` : ''}
            <div class="chat-author">${escapeHtml(comment.userName || 'Utilisateur')}</div>
            <div class="chat-text" id="chat-text-${commentId}">${linkify(comment.text || '')}</div>
            <div class="chat-edit-area d-none" id="chat-edit-${commentId}">
              <textarea class="form-control form-control-sm mb-2" rows="2">${escapeHtml(comment.text || '')}</textarea>
              <div class="d-flex gap-2">
                <button class="btn btn-sm btn-success btn-save-edit"><i class="bi bi-check-lg me-1"></i>Sauvegarder</button>
                <button class="btn btn-sm btn-secondary btn-cancel-edit"><i class="bi bi-x-lg me-1"></i>Annuler</button>
              </div>
            </div>
            <div class="chat-time">
              ${formatCommentDate(comment.createdAt)}
              ${comment.editedAt ? `<span class="chat-edited-label"><i class="bi bi-pencil"></i> modifié</span>` : ''}
            </div>
          </div>`;

        // Modifier
        bubble.querySelector('.btn-chat-edit')?.addEventListener('click', () => {
          document.getElementById(`chat-text-${commentId}`)?.classList.add('d-none');
          const area = document.getElementById(`chat-edit-${commentId}`);
          area?.classList.remove('d-none');
          const ta = area?.querySelector('textarea');
          if (ta) { ta.focus(); ta.selectionStart = ta.selectionEnd = ta.value.length; }
        });

        // Annuler édition
        bubble.querySelector('.btn-cancel-edit')?.addEventListener('click', () => {
          document.getElementById(`chat-text-${commentId}`)?.classList.remove('d-none');
          document.getElementById(`chat-edit-${commentId}`)?.classList.add('d-none');
        });

        // Sauvegarder édition
        bubble.querySelector('.btn-save-edit')?.addEventListener('click', async () => {
          const ta      = bubble.querySelector('.chat-edit-area textarea');
          const newText = ta?.value?.trim();
          if (!newText) { toast('Le message ne peut pas être vide'); return; }
          const btn = bubble.querySelector('.btn-save-edit');
          btn.disabled = true; btn.innerHTML = '<i class="bi bi-hourglass-split"></i>';
          try {
            await updateDoc(doc(db, 'tickets', currentTicket.id, 'comments', commentId), {
              text: newText, editedAt: Timestamp.now()
            });
            await updateDoc(doc(db, 'tickets', currentTicket.id), { updatedAt: Timestamp.now() });
            toast('Message modifié');
          } catch (err) {
            toast('Erreur : ' + err.message);
            btn.disabled = false; btn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Sauvegarder';
          }
        });

        // Raccourcis clavier dans le textarea d'édition
        bubble.querySelector('.chat-edit-area textarea')?.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); bubble.querySelector('.btn-save-edit')?.click(); }
          if (e.key === 'Escape') bubble.querySelector('.btn-cancel-edit')?.click();
        });

        // Supprimer
        bubble.querySelector('.btn-chat-delete')?.addEventListener('click', async () => {
          if (!confirm('Supprimer ce message définitivement ?')) return;
          try {
            await deleteDoc(doc(db, 'tickets', currentTicket.id, 'comments', commentId));
            await updateDoc(doc(db, 'tickets', currentTicket.id), { updatedAt: Timestamp.now() });
            toast('Message supprimé');
          } catch (err) {
            toast('Erreur : ' + err.message);
          }
        });

        container.appendChild(bubble);
      });

      container.scrollTop = container.scrollHeight;

    }, (err) => {
      console.error('[chat] onSnapshot error:', err);
      container.innerHTML = `<div class="alert alert-danger m-3"><i class="bi bi-exclamation-triangle me-1"></i>Erreur : ${err.message}</div>`;
    });

  } catch (err) {
    console.error('[chat] query error:', err);
    container.innerHTML = `<div class="alert alert-danger m-3">Erreur : ${err.message}</div>`;
  }
}

async function addComment(text) {
  if (!currentTicket) { toast('Ticket non chargé'); return; }
  if (!currentUser)   { toast('Vous devez être connecté'); return; }
  if (!text?.trim())  { toast('Le message ne peut pas être vide'); return; }

  const btn      = document.getElementById('btn-add-comment');
  const textarea = document.getElementById('new-comment');

  btn.disabled = true; btn.innerHTML = '<i class="bi bi-hourglass-split"></i>';

  try {
    await addDoc(collection(db, 'tickets', currentTicket.id, 'comments'), {
      text:      text.trim(),
      createdBy: currentUser.uid,
      userName:  currentUser.displayName || currentUser.email || 'Utilisateur',
      createdAt: Timestamp.now()
    });
    textarea.value = '';
    resetTextareaHeight();
    await updateDoc(doc(db, 'tickets', currentTicket.id), { updatedAt: Timestamp.now() });
  } catch (err) {
    toast('Erreur lors de l\'envoi : ' + err.message);
  } finally {
    btn.disabled = false; btn.innerHTML = '<i class="bi bi-send-fill"></i>';
  }
}

// ─────────────────────────────────────────────
// UTILITAIRES
// ─────────────────────────────────────────────
function formatCommentDate(ts) {
  if (!ts) return '';
  try {
    const d = ts.toDate ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : new Date(ts);
    return d.toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' });
  } catch { return ''; }
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;' }[m]));
}

function linkify(text) {
  if (!text) return '';
  return escapeHtml(text).replace(/(https?:\/\/[^\s<>"']+)/g, url =>
    `<a href="${url}" target="_blank" rel="noopener noreferrer" style="color:var(--accent2)">${url}</a>`
  );
}

function resetTextareaHeight() {
  const ta = document.getElementById('new-comment');
  if (ta) { ta.style.height = 'auto'; ta.style.height = '44px'; }
}

function showError(msg) {
  document.getElementById('loading').classList.add('d-none');
  document.getElementById('error').classList.remove('d-none');
  document.getElementById('error-message').textContent = msg;
}

// ─────────────────────────────────────────────
// EVENT LISTENERS
// ─────────────────────────────────────────────
document.getElementById('btn-add-comment')?.addEventListener('click', () => {
  addComment(document.getElementById('new-comment')?.value);
});

document.getElementById('new-comment')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment(e.target.value); }
});

document.getElementById('new-comment')?.addEventListener('input', function () {
  this.style.height = 'auto';
  this.style.height = Math.min(Math.max(this.scrollHeight, 44), 150) + 'px';
});

// ─────────────────────────────────────────────
// INITIALISATION
// ─────────────────────────────────────────────
(async () => {
  const ticketId = getTicketIdFromUrl();
  if (!ticketId) { showError('Aucun ID de ticket fourni dans l\'URL'); return; }

  const user = await requireAuth(true);
  if (!user) { showError('Vous devez être connecté pour voir ce ticket'); return; }

  currentUser = user;
  isAdmin     = window.__isAdmin === true;

  await loadTicket(ticketId);
})();
