// assets/js/create-ticket.js
import { db, auth } from './firebase-init.js';
import { requireAuth, toast } from './app.js';
import { collection, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

/* --- Configuration Cloudinary --- */
const CLOUDINARY_CLOUD_NAME = 'ddf1gxdms';
const CLOUDINARY_UPLOAD_PRESET = 'tickets_upload';
const CLOUDINARY_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

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
const formCard     = document.getElementById('ticket-form-card');
const typeHidden   = document.getElementById('type-hidden');
const categoryEl   = document.getElementById('category');
const impactEl     = document.getElementById('impact');
const urgencyEl    = document.getElementById('urgency');
const priorityEl   = document.getElementById('priority');
const slaEl        = document.getElementById('sla-target');
const form         = document.getElementById('form-create');
const hintLogin    = document.getElementById('hint-login');
const attachmentEl = document.getElementById('attachment');
const previewDiv   = document.getElementById('attachment-preview');
const previewImg   = document.getElementById('preview-img');
const btnRemove    = document.getElementById('btn-remove-attachment');

/* --- Aperçu image en temps réel --- */
attachmentEl?.addEventListener('change', () => {
  const file = attachmentEl.files[0];

  if (!file) {
    previewDiv?.classList.add('d-none');
    return;
  }

  // Vérification taille max 5 Mo
  if (file.size > 5 * 1024 * 1024) {
    toast('Image trop lourde (max 5 Mo). Veuillez choisir une autre image.');
    attachmentEl.value = '';
    previewDiv?.classList.add('d-none');
    return;
  }

  // Afficher l'aperçu
  const reader = new FileReader();
  reader.onload = (e) => {
    if (previewImg) previewImg.src = e.target.result;
    previewDiv?.classList.remove('d-none');
  };
  reader.readAsDataURL(file);
});

/* --- Supprimer la pièce jointe --- */
btnRemove?.addEventListener('click', () => {
  if (attachmentEl) attachmentEl.value = '';
  if (previewImg) previewImg.src = '';
  previewDiv?.classList.add('d-none');
});

/* --- Upload image vers Cloudinary --- */
async function uploadToCloudinary(file) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('folder', 'tickets');

  const response = await fetch(CLOUDINARY_URL, {
    method: 'POST',
    body: formData
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err?.error?.message || 'Erreur upload Cloudinary');
  }

  const data = await response.json();
  return data.secure_url; // URL HTTPS de l'image
}

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

    const datalist = document.createElement('datalist');
    datalist.id = 'users-list';
    names.sort().forEach(name => {
      const opt = document.createElement('option');
      opt.value = name;
      datalist.appendChild(opt);
    });
    document.body.appendChild(datalist);

    const userNameInput = document.getElementById('userName');
    if (userNameInput) userNameInput.setAttribute('list', 'users-list');
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

  await initUserAutocomplete();

  // Pré-remplir avec le nom du user connecté
  const userNameInput = document.getElementById('userName');
  if (userNameInput) {
    if (user.displayName) {
      userNameInput.value = user.displayName;
    } else {
      try {
        const snap = await getDocs(collection(db, 'users'));
        snap.forEach(d => {
          if (d.id === user.uid && d.data().displayName) {
            userNameInput.value = d.data().displayName;
          }
        });
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

  if (!typeHidden?.value) {
    toast('Veuillez sélectionner un type de ticket.');
    return;
  }
  if (!categoryEl?.value) {
    toast('Veuillez choisir une catégorie.');
    return;
  }

  const userNameValue = document.getElementById('userName')?.value.trim();
  if (!userNameValue) {
    toast('Veuillez saisir votre nom complet.');
    return;
  }

  // Désactiver le bouton pendant l'envoi
  const submitBtn = form.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Envoi en cours…';
  }

  try {
    // Upload image sur Cloudinary si présente
    let attachmentURL = null;
    const file = attachmentEl?.files[0];
    if (file) {
      try {
        toast('Upload de l\'image en cours…');
        attachmentURL = await uploadToCloudinary(file);
      } catch (uploadErr) {
        console.error('[upload] Erreur Cloudinary:', uploadErr);
        toast('Erreur lors de l\'upload de l\'image : ' + uploadErr.message);
        // On continue quand même sans l'image
      }
    }

    // Créer le ticket dans Firestore avec l'URL Cloudinary
    const payload = {
      title:          document.getElementById('title').value.trim(),
      description:    document.getElementById('description').value.trim(),
      userName:       userNameValue,
      category:       categoryEl.value,
      type:           typeHidden.value,
      impact:         impactEl.value,
      urgency:        urgencyEl.value,
      priority:       priorityEl.value,
      slaTargetHours: SLA_BY_PRIORITY[priorityEl.value] || 24,
      status:         'Ouvert',
      createdAt:      serverTimestamp(),
      createdBy:      user.uid,
      email:          user.email || 'unknown@local',
      attachmentURL:  attachmentURL  // null si pas d'image
    };

    await addDoc(collection(db, 'tickets'), payload);

    // Reset UI
    form.reset();
    if (priorityEl) priorityEl.value = 'Normal';
    if (slaEl) slaEl.textContent = '24 h';
    if (typeHidden) typeHidden.value = '';
    if (categoryEl) categoryEl.innerHTML = '<option value="">Choisir…</option>';
    document.querySelectorAll('input[name="ttype"]').forEach(x => { x.checked = false; });
    if (formCard) formCard.classList.add('d-none');
    if (previewDiv) previewDiv.classList.add('d-none');
    if (previewImg) previewImg.src = '';

    toast('✅ Ticket créé avec succès !');

  } catch (err) {
    console.error('[create-ticket] addDoc failed:', err);
    toast('Erreur: ' + (err?.message || err));
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="bi bi-send me-1"></i>Créer le ticket';
    }
  }
});
