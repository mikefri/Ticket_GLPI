// assets/js/stats.js
// Page Statistiques (admin only)

import './app.js'; // navbar + badge + requireAuth + toast
import { db } from './firebase-init.js';
import { requireAuth, toast } from './app.js';

import {
  collection, query, where, orderBy, getDocs,
  Timestamp, getCountFromServer
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const PERIOD_SELECT = document.getElementById('period');

// KPIs
const kpi = {
  total:  document.getElementById('kpi-total'),
  open:   document.getElementById('kpi-open'),
  prog:   document.getElementById('kpi-progress'),
  wait:   document.getElementById('kpi-wait'),
  done:   document.getElementById('kpi-done'),
  closed: document.getElementById('kpi-closed')
};

// Charts
let chStatus = null, chCategory = null, chTimeline = null;

// Libs
const STATUSES  = ['Ouvert','En cours','En attente','Résolu','Fermé'];

function show(el, yes=true){ if (el) el.classList.toggle('d-none', !yes); }

// Période -> date de début (ou null)
function getStartDate(periodValue){
  if (periodValue === 'all') return null;
  const days = parseInt(periodValue, 10) || 30;
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - days + 1); // inclure aujourd’hui
  return Timestamp.fromDate(new Date(start.getFullYear(), start.getMonth(), start.getDate(), 0, 0, 0));
}

// Compte des tickets pour une requête
async function countQuery(q) {
  const snap = await getCountFromServer(q);
  return snap.data().count || 0;
}

// Charge les KPIs (global ou borné par date)
async function loadKPIs(startTs) {
  const base = collection(db, 'tickets');

  // total
  let qTotal = base;
  if (startTs) qTotal = query(base, where('createdAt', '>=', startTs));
  const total = await countQuery(qTotal);

  // Par statut
  const counts = {};
  await Promise.all(STATUSES.map(async (s) => {
    let qS = query(base, where('status', '==', s));
    if (startTs) qS = query(base, where('status','==',s), where('createdAt','>=', startTs));
    counts[s] = await countQuery(qS);
  }));

  // MAJ UI
  if (kpi.total)  kpi.total.textContent  = total;
  if (kpi.open)   kpi.open.textContent   = counts['Ouvert'];
  if (kpi.prog)   kpi.prog.textContent   = counts['En cours'];
  if (kpi.wait)   kpi.wait.textContent   = counts['En attente'];
  if (kpi.done)   kpi.done.textContent   = counts['Résolu'];
  if (kpi.closed) kpi.closed.textContent = counts['Fermé'];

  return { total, counts };
}

// Répartition par catégorie (barres) – bornée par date si startTs
async function loadCategoryBreakdown(startTs){
  const base = collection(db, 'tickets');
  let qCat = base;
  if (startTs) qCat = query(base, where('createdAt','>=', startTs));

  // On télécharge seulement ce qu’il faut pour la période (catégorie et createdAt)
  // (Astuce : si tu veux encore réduire, stocke des compteurs en back ou utilise Data Connect)
  const cols = [];
  const snap = await getDocs(qCat);
  snap.forEach(d => {
    const t = d.data();
    if (t?.category) cols.push(t.category);
  });
  const byCat = cols.reduce((acc, c) => (acc[c] = (acc[c]||0)+1, acc), {});
  return byCat;
}

// Timeline (tickets/jour) – bornée par date
async function loadTimeline(startTs){
  const base = collection(db, 'tickets');
  let qRange = base;
  if (startTs) qRange = query(base, where('createdAt','>=', startTs), orderBy('createdAt','asc'));
  else         qRange = query(base, orderBy('createdAt','asc'));

  const snap = await getDocs(qRange);
  const perDay = new Map(); // 'YYYY-MM-DD' -> count

  const toKey = (d) => {
    const y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  };

  snap.forEach(doc => {
    const t = doc.data();
    if (!t?.createdAt) return;
    const d = t.createdAt.toDate ? t.createdAt.toDate() : new Date(t.createdAt);
    const key = toKey(d);
    perDay.set(key, (perDay.get(key)||0)+1);
  });

  // Compléter les jours manquants si période bornée
  if (startTs) {
    const start = startTs.toDate();
    const today = new Date();
    for (let d = new Date(start.getFullYear(), start.getMonth(), start.getDate()); d <= today; d.setDate(d.getDate()+1)) {
      const key = toKey(d);
      if (!perDay.has(key)) perDay.set(key, 0);
    }
  }

  const labels = [...perDay.keys()].sort();
  const values = labels.map(k => perDay.get(k));
  return { labels, values };
}

// ----- Charts helpers -----
function mkChart(ctx, cfg){
  if (ctx.__chart) { ctx.__chart.destroy(); }
  ctx.__chart = new Chart(ctx, cfg);
  return ctx.__chart;
}

function palette(n){
  const base = ['#0ea5a5','#1d4ed8','#eab308','#ef4444','#22c55e','#a855f7','#14b8a6','#f97316'];
  const arr = [];
  for (let i=0;i<n;i++) arr.push(base[i % base.length]);
  return arr;
}

// ----- Main refresh -----
async function refresh(){
  const period = PERIOD_SELECT.value;
  const startTs = getStartDate(period);

  try {
    const { counts } = await loadKPIs(startTs);

    // Graph statut
    const ctxS = document.getElementById('chartStatus');
    if (ctxS) mkChart(ctxS, {
      type: 'doughnut',
      data: {
        labels: STATUSES,
        datasets: [{ data: STATUSES.map(s => counts[s]||0), backgroundColor: palette(STATUSES.length) }]
      },
      options: { plugins: { legend: { position: 'bottom' } } }
    });

    // Catégories
    const byCat = await loadCategoryBreakdown(startTs);
    const catLabels = Object.keys(byCat);
    const catVals   = catLabels.map(k => byCat[k]);
    const ctxC = document.getElementById('chartCategory');
    if (ctxC) mkChart(ctxC, {
      type: 'bar',
      data: { labels: catLabels, datasets: [{ label: 'Tickets', data: catVals, backgroundColor: palette(catLabels.length) }] },
      options: {
        responsive: true,
        scales: { y: { beginAtZero: true, ticks: { precision:0 } } },
        plugins: { legend: { display: false } }
      }
    });

    // Timeline
    const { labels, values } = await loadTimeline(startTs);
    const ctxT = document.getElementById('chartTimeline');
    if (ctxT) mkChart(ctxT, {
      type: 'line',
      data: { labels, datasets: [{ label: 'Tickets / jour', data: values, borderColor: '#0ea5a5', backgroundColor: 'rgba(14,165,165,.15)', fill: true, tension: .25 }] },
      options: {
        responsive: true,
        scales: { y: { beginAtZero: true, ticks: { precision:0 } } },
        plugins: { legend: { display: false } }
      }
    });

  } catch (e) {
    console.error('[stats] refresh failed', e);
    toast('Erreur de chargement des statistiques');
  }
}

// ----- Bootstrap page -----
(async () => {
  const user = await requireAuth(true);
  if (!user) return;

  // Vérification admin rapide via flag posé par app.js
  if (window.__isAdmin !== true) {
    toast('Accès admin requis');
    setTimeout(() => window.location.href = 'tickets.html', 800);
    return;
  }

  await refresh();
  PERIOD_SELECT.addEventListener('change', refresh);
})();
