/* ============================================
   MEETINGS.CSS - Styles pour la page Préparation des réunions
   ============================================ */

/* ===== Page Header ===== */
.page-header h1 {
  color: #1e293b;
  font-weight: 700;
}

/* ===== Statistiques rapides ===== */
.stat-card {
  border-radius: 12px;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.stat-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

.stat-card h3 {
  font-weight: 700;
  font-size: 1.75rem;
}

/* ===== Tableau des réunions ===== */
.table-meetings {
  border-radius: 8px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

.table-meetings thead th {
  background-color: #f8f9fa;
  border-bottom: 2px solid #dee2e6;
  font-weight: 600;
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: #6c757d;
  padding: 0.75rem 1rem;
}

.table-meetings tbody td {
  vertical-align: middle;
  padding: 0.875rem 1rem;
  border-bottom: 1px solid #f1f3f5;
}

.table-meetings tbody tr:hover {
  background-color: rgba(13, 110, 253, 0.02);
}

.table-meetings tbody tr:last-child td {
  border-bottom: none;
}

/* ===== Badges de priorité ===== */
.badge-priority {
  padding: 0.35rem 0.65rem;
  border-radius: 50px;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.badge-priority.critique {
  background-color: #dc3545;
  color: white;
}

.badge-priority.haute {
  background-color: #fd7e14;
  color: white;
}

.badge-priority.moyenne {
  background-color: #ffc107;
  color: #1e293b;
}

.badge-priority.basse {
  background-color: #20c997;
  color: white;
}

/* ===== Badges de statut réunion ===== */
.badge-meeting-status {
  padding: 0.35rem 0.65rem;
  border-radius: 50px;
  font-size: 0.7rem;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

.badge-meeting-status.pending {
  background-color: #fff3cd;
  color: #856404;
}

.badge-meeting-status.treated {
  background-color: #d1e7dd;
  color: #0f5132;
}

.badge-meeting-status.postponed {
  background-color: #f8d7da;
  color: #842029;
}

/* ===== Badge National ===== */
.badge-national {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 0.35rem 0.65rem;
  border-radius: 50px;
  font-size: 0.7rem;
  font-weight: 600;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}

/* ===== Boutons d'action ===== */
.btn-action-group {
  display: flex;
  gap: 0.25rem;
}

.btn-action-group .btn {
  padding: 0.375rem 0.5rem;
  font-size: 0.875rem;
  line-height: 1;
}

.btn-action-group .btn:hover {
  transform: scale(1.1);
  transition: transform 0.15s ease;
}

/* ===== État vide ===== */
.empty-state {
  text-align: center;
  padding: 4rem 2rem;
  background: #f8f9fa;
  border-radius: 12px;
  border: 2px dashed #dee2e6;
}

.empty-state-icon {
  width: 80px;
  height: 80px;
  margin: 0 auto 1rem;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.empty-state-icon i {
  font-size: 2.5rem;
  color: white;
}

/* ===== Barre de filtres ===== */
.filters-bar {
  background: #ffffff;
  border: 1px solid #e9ecef;
  border-radius: 12px;
  padding: 1rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
}

/* ===== Modal Notes de réunion ===== */
#meetingNotesModal .modal-content {
  border-radius: 12px;
  border: none;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
}

#meetingNotesModal .modal-header {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border-radius: 12px 12px 0 0;
  padding: 1rem 1.5rem;
}

#meetingNotesModal .modal-header .btn-close {
  filter: brightness(0) invert(1);
}

#meetingNotesModal .modal-body {
  padding: 1.5rem;
}

#meetingNotesModal textarea {
  border-radius: 8px;
  border: 1px solid #dee2e6;
  resize: vertical;
  min-height: 150px;
}

#meetingNotesModal textarea:focus {
  border-color: #667eea;
  box-shadow: 0 0 0 0.2rem rgba(102, 126, 234, 0.25);
}

/* ===== Tooltip sur les actions ===== */
.btn-action-group .btn {
  position: relative;
}

/* ===== Responsive ===== */
@media (max-width: 768px) {
  .page-header h1 {
    font-size: 1.25rem;
  }
  
  .stat-card h3 {
    font-size: 1.25rem;
  }
  
  .table-meetings {
    font-size: 0.85rem;
  }
  
  .table-meetings thead th {
    font-size: 0.7rem;
    padding: 0.5rem;
  }
  
  .table-meetings tbody td {
    padding: 0.5rem;
  }
  
  .btn-action-group {
    flex-direction: column;
    gap: 0.15rem;
  }
}

/* ===== Impression ===== */
@media print {
  .no-print {
    display: none !important;
  }
  
  .navbar,
  footer,
  .toast-container,
  .filters-bar,
  .btn-action-group {
    display: none !important;
  }
  
  main.container {
    max-width: 100%;
    padding: 0;
    margin: 0;
  }
  
  .page-header {
    margin-bottom: 1rem;
    padding-bottom: 0.5rem;
    border-bottom: 2px solid #1e293b;
  }
  
  .table-meetings {
    font-size: 0.75rem;
    box-shadow: none;
    border: 1px solid #dee2e6;
  }
  
  .table-meetings thead th {
    background-color: #f8f9fa !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  
  .badge-priority,
  .badge-meeting-status,
  .badge-national {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    border: 1px solid rgba(0, 0, 0, 0.2);
  }
  
  .stat-card {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    border: 1px solid #dee2e6;
  }
}

/* ===== Animation de chargement ===== */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.fade-in {
  animation: fadeIn 0.4s ease forwards;
}

/* ===== Scrollbar personnalisée ===== */
.table-responsive::-webkit-scrollbar {
  height: 6px;
}

.table-responsive::-webkit-scrollbar-track {
  background: #f1f3f5;
  border-radius: 3px;
}

.table-responsive::-webkit-scrollbar-thumb {
  background: #adb5bd;
  border-radius: 3px;
}

.table-responsive::-webkit-scrollbar-thumb:hover {
  background: #6c757d;
}
