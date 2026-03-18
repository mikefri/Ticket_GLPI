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

/* --- Matrice SLA --- */
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

/* --- 1) Choix du type --- */
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

/* --- 2) Priorité + SLA --- */
function refreshPriority() {
  if (!impactEl || !urgencyEl || !priorityEl || !slaEl) return;
  const p = computePriority(impactEl.value, urgencyEl.value);
  priorityEl.value = p;
  slaEl.textContent = (SLA_BY_PRIORITY[p] || 24) + ' h';
}
impactEl?.addEventListener('change', refreshPriority);
urgencyEl?.addEventListener('change', refreshPriority);
refreshPriority();

/* --- 3) Autocomplete "Nom complet" --- */
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
    console.error('[autocomplete] Erreur:', err);
  }
}

/* --- 4) NOUVEAU : Prévisualisation des fichiers sélectionnés --- */
document.getElementById('attachments')?.addEventListener('change', (e) => {
  const preview = document.getElementById('preview-attachments');
  if (!preview) return;
  preview.innerHTML = '';

  [...e.target.files].forEach((file) => {
    // Vérification taille
    if (file.size > 500 * 1024) {
      const alert = document.createElement('div');
      alert.className = 'alert alert-warning py-1 px-2 small mb-0';
      alert.innerHTML = `<i class="bi bi-exclamation-triangle me-1"></i>${file.name} dépasse 2 Mo et sera ignoré.`;
      preview.appendChild(alert);
      return;
    }

    if (file.type.startsWith('image/')) {
      const wrap = document.createElement('div');
      wrap.className = 'position-relative';

      const img = document.createElement('img');
      img.src = URL.createObjectURL(file);
      img.style.cssText = 'height:80px;width:80px;object-fit:cover;border-radius:8px;border:1px solid #ddd';
      img.title = file.name;

      wrap.appendChild(img);
      preview.appendChild(wrap);
    } else {
      const badge = document.createElement('span');
      badge.className = 'badge bg-secondary p-2 d-flex align-items-center gap-1';
      badge.innerHTML = `<i class="bi bi-file-earmark"></i>${file.name}`;
      preview.appendChild(badge);
    }
  });
});

/* --- 5) NOUVEAU : Conversion fichier → Base64 --- */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(reader.result); // "data:image/png;base64,iVBOR..."
    reader.onerror = () => reject(new Error(`Impossible de lire : ${file.name}`));
    reader.readAsDataURL(file);
  });
}

async function getAttachmentsBase64() {
  const input = document.getElementById('attachments');
  if (!input || !input.files.length) return [];

  const result = [];
  for (const file of input.files) {
    if (file.size > 500 * 1024) continue; // ignore les fichiers trop lourds

    const base64 = await fileToBase64(file);
    result.push({
      name: file.name,
      type: file.type,
      size: file.size,
      data: base64  // la donnée complète encodée en Base64
    });
  }
  return result;
}

/* --- 6) Auth requise + init --- */
(async () => {
  const user = await requireAuth(true);
  if (!user) {
    if (hintLogin) hintLogin.classList.remove('d-none');
    const submitBtn = form?.querySelector('button[type="submit"]');
    if (submitBtn) submitBtn.disabled = true;
    return;
  }

  await initUserAutocomplete();

  const userNameInput = document.getElementById('userName');
  if (userNameInput) {
    if (user.displayName) {
      userNameInput.value = user.displayName;
    } else {
      try {
        const { getDoc, doc } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js");
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (snap.exists() && snap.data().displayName) {
          userNameInput.value = snap.data().displayName;
        }
      } catch (err) {
        console.error('[prefill] Erreur:', err);
      }
    }
  }
})();

/* --- 7) Soumission --- */
form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const user = auth.currentUser;
  if (!user) return;

  if (!typeHidden?.value) { toast('Veuillez sélectionner un type de ticket.'); return; }
  if (!categoryEl?.value)  { toast('Veuillez choisir une catégorie.'); return; }

  const userNameValue = document.getElementById('userName')?.value.trim();
  if (!userNameValue) { toast('Veuillez saisir votre nom complet.'); return; }

  // Bouton en chargement
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Envoi…';

  try {
    // Récupération des pièces jointes en Base64
    const attachments = await getAttachmentsBase64();

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
      attachments               // ← tableau Base64 ajouté ici
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
    document.getElementById('preview-attachments').innerHTML = '';

    toast('✅ Ticket créé avec succès');
  } catch (err) {
    console.error('[create-ticket] Erreur:', err);
    toast('❌ Erreur : ' + (err?.message || err));
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
});
