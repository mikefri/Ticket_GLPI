// assets/js/create-ticket.js
import { db, auth } from './firebase-init.js';
import { requireAuth, toast } from './app.js';
import { collection, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* --- Catégories par défaut --- */
const CATEGORY_MAP = {
  "Demande": [
    "Initialisation pasword RFX",
    "Droits d'accès OT/RFX",
    "Création d'emplacement",
    "Changement / évolution",
    "Autre"
  ],
  "Incident": [
    "Imprimante",
    "Logiciel",
    "PBI",
    "Réseau",
    "Autre"
  ]
};

/* --- Matrice SLA : Impact × Urgence -> Priorité + délai cible --- */
const ORDER = { "Faible":1, "Moyen":2, "Fort":3, "Critique":4 };
const SLA_BY_PRIORITY = { "Critique":4, "Haute":8, "Normal":24, "Faible":72 };

function computePriority(impact, urgency) {
  const a = ORDER[impact] || 2;
  const b = ORDER[urgency] || 2;
  if (a >= 4 || b >= 4) return "Critique";
  if ((a >= 3 && b >= 2) || (b >= 3 && a >= 2)) return "Haute";
  if (a >= 2 || b >= 2) return "Normal";
  return "Faible";
}

/* --- Elements UI --- */
const formCard   = document.getElementById('ticket-form-card');
const typeHidden = document.getElementById('type-hidden');
const categoryEl = document.getElementById('category');
const impactEl   = document.getElementById('impact');
const urgencyEl  = document.getElementById('urgency');
const priorityEl = document.getElementById('priority');
const slaEl      = document.getElementById('sla-target');
const form       = document.getElementById('form-create');
const hintLogin  = document.getElementById('hint-login');

/* --- 1) Choix du type -> affichage formulaire + catégories --- */
const radios = document.querySelectorAll('input[name="ttype"]');

function fillCategories(type) {
  if (!categoryEl) return;
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
    if (typeHidden) typeHidden.value = type;
    fillCategories(type);
    if (formCard) {
      formCard.classList.remove('d-none');
      formCard.scrollIntoView({ behavior: 'smooth' });
    }
  });
});

/* --- 2) Calcul auto priorité + SLA --- */
function refreshPriority() {
  if (!impactEl || !urgencyEl || !priorityEl || !slaEl) return;
  const p = computePriority(impactEl.value, urgencyEl.value);
  priorityEl.value = p;
  slaEl.textContent = (SLA_BY_PRIORITY[p] || 24) + ' h';
}
impactEl?.addEventListener('change', refreshPriority);
urgencyEl?.addEventListener('change', refreshPriority);
refreshPriority();

/* --- 3) Autocomplete "Nom complet" depuis Firestore --- */
async function initUserAutocomplete() {
  try {
    const snap = await getDocs(collection(db, 'users'));
    const names = [];
    snap.forEach(d => {
      const name = d.data().displayName;
      if (name) names.push(name);
    });

    // Créer et injecter le datalist
    const datalist = document.createElement('datalist');
    datalist.id = 'users-list';
    names.sort().forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      datalist.appendChild(opt);
    });
    document.body.appendChild(datalist);

    // Lier au champ input
    const userNameInput = document.getElementById('userName');
    if (userNameInput) {
      userNameInput.setAttribute('list', 'users-list');
    }
  } catch (err) {
    console.error('[autocomplete] Erreur chargement users:', err);
  }
}

/* --- 4) Auth requise + init autocomplete --- */
(async () => {
  const user = await requireAuth(true);
  if (!user) {
    if (hintLogin) hintLogin.classList.remove('d-none');
    const submitBtn = form?.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    return;
  }

  // Activer l'autocomplete
  await initUserAutocomplete();

  // Pré-remplir avec le nom du user connecté
  const userNameInput = document.getElementById('userName');
  if (userNameInput) {
    if (user.displayName) {
      userNameInput.value = user.displayName;
    } else {
      // Fallback : chercher dans Firestore
      try {
        const { getDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists() && snap.data().displayName) {
          userNameInput.value = snap.data().displayName;
        }
      } catch (err) {
        console.error('[prefill] Erreur Firestore:', err);
      }
    }
  }
})();

/* --- 5) Soumission --- */
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const user = auth.currentUser;
  if (!user) return;

  if (!typeHidden || !typeHidden.value) {
    toast('Veuillez sélectionner un type de ticket.');
    return;
  }
  if (!categoryEl || !categoryEl.value) {
    toast('Veuillez choisir une catégorie.');
    return;
  }

  const userNameValue = document.getElementById('userName')?.value.trim();
  if (!userNameValue) {
    toast('Veuillez saisir votre nom complet.');
    return;
  }

  const payload = {
    title:        document.getElementById('title').value.trim(),
    description:  document.getElementById('description').value.trim(),
    userName:     userNameValue,
    category:     categoryEl.value,
    type:         typeHidden.value,
    impact:       impactEl.value,
    urgency:      urgencyEl.value,
    priority:     priorityEl.value,
    slaTargetHours: SLA_BY_PRIORITY[priorityEl.value] || 24,
    status:       'Ouvert',
    createdAt:    serverTimestamp(),
    createdBy:    user.uid,
    email:        user.email || 'unknown@local'
  };

  try {
    await addDoc(collection(db, 'tickets'), payload);

    // Reset UI
    form.reset();
    if (priorityEl) priorityEl.value = 'Normal';
    if (slaEl) slaEl.textContent = '24 h';
    if (typeHidden) typeHidden.value = '';
    if (categoryEl) categoryEl.innerHTML = '<option value="">Choisir…</option>';
    document.querySelectorAll('input[name="ttype"]').forEach(x => { x.checked = false; });
    if (formCard) formCard.classList.add('d-none');

    toast('Ticket créé avec succès');
  } catch (err) {
    console.error('[create-ticket] addDoc failed:', err);
    toast('Erreur: ' + (err?.message || err));
  }
});
