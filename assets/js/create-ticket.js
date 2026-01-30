// assets/js/create-ticket.js
import { db, auth } from './firebase-init.js';
import { requireAuth, toast } from './app.js';
import {
  collection, addDoc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* --------------------------
   Catégories par défaut (provisoires)
   -> Tu me donneras plus tard tes listes réelles par type,
      je remplacerai simplement les tableaux ci-dessous.
---------------------------*/
const CATEGORY_MAP = {
  "Demande": [
    "Dotation matériel", "Droits d’accès", "Installation logiciel",
    "Prêt de matériel", "Changement / évolution", "Autre"
  ],
  "Incident": [
    "Application", "Logiciel", "Matériel",
    "Réseau", "Sécurité", "Autre"
  ]
};

/* --------------------------
   Matrice SLA (automatique)
   Impact × Urgence -> Priorité + Délai cible (heures)
---------------------------*/
const ORDER = { "Faible":1, "Moyen":2, "Fort":3, "Critique":4 };
const SLA_BY_PRIORITY = { "Critique":4, "Haute":8, "Normal":24, "Faible":72 };

function computePriority(impact, urgency) {
  const a = ORDER[impact] || 2; // défaut = Moyen
  const b = ORDER[urgency] || 2;

  if (a >= 4 || b >= 4) return "Critique";
  if ((a >= 3 && b >= 2) || (b >= 3 && a >= 2)) return "Haute";
  if (a >= 2 || b >= 2) return "Normal";
  return "Faible";
}

/* --------------------------
   UI elements
---------------------------*/
const formCard   = document.getElementById('ticket-form-card');
const typeHidden = document.getElementById('type-hidden');
const categoryEl = document.getElementById('category');
const impactEl   = document.getElementById('impact');
const urgencyEl  = document.getElementById('urgency');
const priorityEl = document.getElementById('priority');
const slaEl      = document.getElementById('sla-target');
const form       = document.getElementById('form-create');
const hintLogin  = document.getElementById('hint-login');

/* --------------------------
   1) Affichage formulaire après choix du type
   + injection des catégories par défaut
---------------------------*/
const radios = document.querySelectorAll('input[name="ttype"]');

function fillCategories(type) {
  categoryEl.innerHTML = '<option value="">Choisir…</option>';
  (CATEGORY_MAP[type] || []).forEach(label => {
    const opt = document.createElement('option');
    opt.value = label; opt.textContent = label;
    categoryEl.appendChild(opt);
  });
}

radios.forEach(r => {
  r.addEventListener('change', () => {
    const type = r.value;
    typeHidden.value = type;
    fillCategories(type);
    formCard.classList.remove('d-none');
    formCard.scrollIntoView({ behavior: 'smooth' });
  });
});

/* --------------------------
   2) Calcul automatique de la priorité + SLA
---------------------------*/
function refreshPriority() {
  const p = computePriority(impactEl.value, urgencyEl.value);
  priorityEl.value = p;
  slaEl.textContent = (SLA_BY_PRIORITY[p] || 24) + ' h';
}
impactEl?.addEventListener('change', refreshPriority);
urgencyEl?.addEventListener('change', refreshPriority);
// init valeur
refreshPriority();

/* --------------------------
   3) Protection : nécessite authentification
---------------------------*/
(async () => {
  const user = await requireAuth(true);
  if (!user) {
    hintLogin?.classList.remove('d-none');
    form?.querySelector('button[type="submit"]').disabled = true;
    return;
  }
})();

/* --------------------------
   4) Soumission : envoi vers Firestore
---------------------------*/
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const user = auth.currentUser;
  if (!user) return;

  if (!typeHidden.value) {
    toast('Veuillez sélectionner un type de ticket.');
    return;
  }
  if (!categoryEl.value) {
    toast('Veuillez choisir une catégorie.');
    return;
  }

  const payload = {
    // noyau du ticket
    title: document.getElementById('title').value.trim(),
    description: document.getElementById('description').value.trim(),
    category: categoryEl.value,
    type: typeHidden.value,

    // SLA auto
    impact: impactEl.value,
    urgency: urgencyEl.value,
    priority: priorityEl.value,                     // calculée
    slaTargetHours: SLA_BY_PRIORITY[priorityEl.value] || 24,

    // technique
    status: 'Ouvert',
    createdAt: serverTimestamp(),
    createdBy: user.uid,
    email: user.email || 'unknown@local'           // évite les refus si rules exigent "email"
  };

  try {
    await addDoc(collection(db, 'tickets'), payload);
    form.reset();
    // re-init UI
    priorityEl.value = 'Normal';
    slaEl.textContent = '24 h';
    typeHidden.value = '';
    categoryEl.innerHTML = '<option value="">Choisir…</option>';
    document.querySelectorAll('input[name="ttype"]').forEach(r => r.checked = false);
    formCard.classList.add('d-none');

    toast('Ticket créé avec succès');
  } catch (err) {
    console.error('[create-ticket] addDoc failed:', err);
    toast('Erreur: ' + (err?.message || err));
  }
});
