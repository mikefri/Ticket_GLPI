/* =============================================
   CHAT – Actions sur les bulles (édition / suppression)
   À ajouter dans votre assets/css/styles.css
   ============================================= */

/* Conteneur de la bulle : position relative pour ancrer les actions */
.chat-bubble {
  position: relative;
}

/* Boutons d'action (crayon + poubelle) — cachés par défaut */
.chat-actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.18s ease;
  z-index: 10;
}

/* Afficher les actions au survol de la bulle */
.chat-bubble:hover .chat-actions {
  opacity: 1;
  pointer-events: auto;
}

/* Style du bouton d'action */
.btn-chat-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid rgba(0, 0, 0, 0.12);
  border-radius: 6px;
  font-size: 11px;
  cursor: pointer;
  color: #555;
  transition: background 0.12s, color 0.12s, border-color 0.12s, transform 0.1s;
  backdrop-filter: blur(4px);
  line-height: 1;
}

.btn-chat-action:hover {
  background: #fff;
  transform: scale(1.1);
  box-shadow: 0 2px 6px rgba(0,0,0,0.12);
}

/* Crayon → bleu au survol */
.btn-chat-edit:hover {
  color: #0d6efd;
  border-color: #0d6efd;
}

/* Poubelle → rouge au survol */
.btn-chat-delete:hover {
  color: #dc3545 !important;
  border-color: #dc3545;
}

/* Zone d'édition inline */
.chat-edit-area {
  margin-top: 6px;
}

.chat-edit-area textarea {
  font-size: 0.88em;
  resize: none;
  border-radius: 8px;
  border: 1px solid #ced4da;
  transition: border-color 0.15s, box-shadow 0.15s;
  width: 100%;
  box-sizing: border-box;
}

.chat-edit-area textarea:focus {
  border-color: #0d6efd;
  box-shadow: 0 0 0 3px rgba(13, 110, 253, 0.15);
  outline: none;
}

/* Indicateur "(modifié)" après l'heure */
.chat-edited-label {
  font-size: 0.72em;
  color: #999;
  margin-left: 6px;
  font-style: italic;
}

.chat-edited-label .bi {
  font-size: 0.8em;
}

/* Sur les bulles de l'utilisateur courant (droite), adapter la couleur des actions */
.user-message .btn-chat-action {
  background: rgba(255, 255, 255, 0.85);
}
