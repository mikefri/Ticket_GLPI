// assets/js/stats-tech.js
// Page Statistiques Techniciens - Performance par agent (admin only)

import './app.js';
import { db } from './firebase-init.js';
import { requireAuth, toast } from './app.js';

import {
  collection, query, getDocs
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysBetween(a, b) {
  if (!a || !b) return null;
  const da = a.toDate ? a.toDate() : new Date(a);
  const db2 = b.toDate ? b.toDate() : new Date(b);
  return Math.max(0, Math.floor((db2 - da) / 86400000));
}

function toDate(ts) {
  if (!ts) return null;
  return ts.toDate ? ts.toDate() : new Date(ts);
}

function initials(name) {
  if (!name) return '?';
  return name.trim().split(' ').map(p => p[0]).join('').toUpperCase().substring(0, 2);
}

function formatName(name) {
  if (!name) return '–';
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return `${parts[0]} ${parts[1].charAt(0)}.`;
  return name.length > 18 ? name.substring(0, 18) + '…' : name;
}

// Couleurs cycliques pour les avatars et barres
const COLORS = [
  '#4a9eff', '#4caf50', '#ff8c42', '#9c7aff',
  '#ffc107', '#ef5350', '#26a69a', '#ec407a'
];

// ─── State ──────────────────────────────────────────────────────────────────

let allTickets = [];
let currentPeriod = 'month'; // 'week' | 'month' | 'year' | 'all'

// ─── Period boundaries ──────────────────────────────────────────────────────

function getPeriodStart(period) {
  const now = new Date();
  switch (period) {
    case 'week': {
      const d = new Date(now);
      const dow = now.getDay() || 7;
      d.setDate(now.getDate() - (dow - 1));
      d.setHours(0, 0, 0, 0);
      return d;
    }
    case 'month':
      return new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0);
    case 'year':
      return new Date(now.getFullYear(), 0, 1, 0, 0, 0);
    default: // 'all'
      return new Date(2000, 0, 1);
  }
}

// ─── Data aggregation ───────────────────────────────────────────────────────

function aggregateByTech(tickets, periodStart) {
  // Map: techName → stats
  const map = {};

  tickets.forEach(t => {
    // Technicien principal = takenBy, sinon assignedTo
    const tech = t.takenBy || t.assignedTo || null;
    if (!tech) return;

    if (!map[tech]) {
      map[tech] = {
        name: tech,
        closedTotal: 0,       // tous statuts "Fermé" ou "Résolu"
        closedPeriod: 0,      // fermés dans la période sélectionnée
        closedThisMonth: 0,
        closedThisWeek: 0,
        openNow: 0,           // tickets actuellement ouverts/en cours assignés
        resolveTimes: [],     // jours de résolution (pour moyenne)
      };
    }

    const entry = map[tech];
    const isClosed = t.status === 'Fermé' || t.status === 'Résolu';
    const isOpen   = t.status === 'Ouvert' || t.status === 'En cours' || t.status === 'En attente';

    if (isOpen) {
      entry.openNow++;
    }

    if (isClosed) {
      entry.closedTotal++;

      // Date de fermeture
      const closeDate = toDate(t.closedAt) || toDate(t.updatedAt) || toDate(t.createdAt);

      // Période sélectionnée
      if (closeDate && closeDate >= periodStart) {
        entry.closedPeriod++;
      }

      // Ce mois
      const monthStart = new Date();
      monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);
      monthStart.setDate(1);
      const ms = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      if (closeDate && closeDate >= ms) entry.closedThisMonth++;

      // Cette semaine
      const now2 = new Date();
      const dow = now2.getDay() || 7;
      const ws = new Date(now2);
      ws.setDate(now2.getDate() - (dow - 1));
      ws.setHours(0, 0, 0, 0);
      if (closeDate && closeDate >= ws) entry.closedThisWeek++;

      // Temps de résolution
      const rt = daysBetween(t.createdAt, t.closedAt || t.updatedAt);
      if (rt !== null) entry.resolveTimes.push(rt);
    }
  });

  // Calcul moyenne
  const result = Object.values(map).map(e => ({
    ...e,
    avgDays: e.resolveTimes.length
      ? Math.round(e.resolveTimes.reduce((a, b) => a + b, 0) / e.resolveTimes.length)
      : null
  }));

  // Tri par closedPeriod desc
  result.sort((a, b) => b.closedPeriod - a.closedPeriod);

  return result;
}

// ─── Monthly trend (12 derniers mois) ───────────────────────────────────────

function buildMonthlyTrend(tickets) {
  const now = new Date();
  const months = [];

  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ year: d.getFullYear(), month: d.getMonth(), count: 0, label: '' });
  }

  const labels = ['Jan','Fév','Mar','Avr','Mai','Jun','Jul','Aoû','Sep','Oct','Nov','Déc'];
  months.forEach(m => { m.label = labels[m.month]; });

  tickets.forEach(t => {
    if (t.status !== 'Fermé' && t.status !== 'Résolu') return;
    const closeDate = toDate(t.closedAt) || toDate(t.updatedAt);
    if (!closeDate) return;
    const y = closeDate.getFullYear();
    const mo = closeDate.getMonth();
    const entry = months.find(m => m.year === y && m.month === mo);
    if (entry) entry.count++;
  });

  return months;
}

// ─── KPI global ─────────────────────────────────────────────────────────────

function computeGlobalKpi(tickets) {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const dow = now.getDay() || 7;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - (dow - 1));
  weekStart.setHours(0, 0, 0, 0);

  let totalClosed = 0, closedMonth = 0, closedWeek = 0;
  const techSet = new Set();

  tickets.forEach(t => {
    const tech = t.takenBy || t.assignedTo;
    if (tech) techSet.add(tech);

    if (t.status === 'Fermé' || t.status === 'Résolu') {
      totalClosed++;
      const cd = toDate(t.closedAt) || toDate(t.updatedAt);
      if (cd) {
        if (cd >= monthStart) closedMonth++;
        if (cd >= weekStart) closedWeek++;
      }
    }
  });

  return {
    totalClosed,
    closedMonth,
    closedWeek,
    techCount: techSet.size
  };
}

// ─── Render functions ────────────────────────────────────────────────────────

function renderKpi(kpi) {
  document.getElementById('kpi-total-closed').textContent  = kpi.totalClosed;
  document.getElementById('kpi-month-closed').textContent  = kpi.closedMonth;
  document.getElementById('kpi-week-closed').textContent   = kpi.closedWeek;
  document.getElementById('kpi-tech-count').textContent    = kpi.techCount;
}

function renderTable(techList) {
  const body = document.getElementById('perf-table-body');
  body.innerHTML = '';

  if (!techList.length) {
    body.innerHTML = '<div class="loading-row">Aucune donnée disponible pour cette période.</div>';
    return;
  }

  const maxClosed = Math.max(...techList.map(t => t.closedPeriod), 1);

  techList.forEach((tech, idx) => {
    const colorIdx = idx % COLORS.length;
    const color = COLORS[colorIdx];
    const pct = Math.round((tech.closedPeriod / maxClosed) * 100);

    const rankHtml = idx < 3
      ? `<div class="rank-badge rank-${idx + 1}">${idx + 1}</div>`
      : `<div class="rank-badge">${idx + 1}</div>`;

    const avgHtml = tech.avgDays !== null
      ? `<span class="avg-value">${tech.avgDays}</span><span class="avg-unit">j</span>`
      : `<span style="color:var(--text-muted);font-size:.75rem">–</span>`;

    const row = document.createElement('div');
    row.className = 'perf-row';
    row.innerHTML = `
      ${rankHtml}

      <div class="tech-name-cell">
        <div class="tech-avatar av-${colorIdx}">${initials(tech.name)}</div>
        <span class="tech-full-name" title="${tech.name}">${formatName(tech.name)}</span>
      </div>

      <div class="perf-cell total">${tech.closedTotal}</div>
      <div class="perf-cell month">${tech.closedPeriod}</div>
      <div class="perf-cell open">${tech.openNow}</div>

      <div class="avg-cell">${avgHtml}</div>

      <div class="load-cell">
        <div class="load-bar-bg">
          <div class="load-bar-fill" style="width:${pct}%;background:${color}"></div>
        </div>
        <div class="load-pct">${pct}%</div>
      </div>
    `;
    body.appendChild(row);
  });
}

function renderDistribution(techList) {
  const panel = document.getElementById('dist-list');
  panel.innerHTML = '';

  const total = techList.reduce((s, t) => s + t.closedPeriod, 0) || 1;

  techList.slice(0, 8).forEach((tech, idx) => {
    const color = COLORS[idx % COLORS.length];
    const pct = Math.round((tech.closedPeriod / total) * 100);

    const item = document.createElement('div');
    item.className = 'dist-item';
    item.innerHTML = `
      <div class="dist-item-header">
        <span class="dist-name" title="${tech.name}">${formatName(tech.name)}</span>
        <span class="dist-count">${tech.closedPeriod} <span style="color:var(--text-muted);font-weight:400;font-size:.7rem">(${pct}%)</span></span>
      </div>
      <div class="dist-bar-bg">
        <div class="dist-bar-fill" style="width:${pct}%;background:${color}"></div>
      </div>
    `;
    panel.appendChild(item);
  });

  if (!techList.length) {
    panel.innerHTML = '<div style="color:var(--text-muted);font-size:.82rem;padding:8px 0">Aucune donnée</div>';
  }
}

function renderChart(trendData) {
  const canvas = document.getElementById('chart-monthly');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const W = canvas.offsetWidth || 280;
  const H = canvas.offsetHeight || 130;
  canvas.width = W * window.devicePixelRatio;
  canvas.height = H * window.devicePixelRatio;
  ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
  ctx.clearRect(0, 0, W, H);

  const counts = trendData.map(m => m.count);
  const maxVal = Math.max(...counts, 1);
  const padLeft = 28, padRight = 8, padTop = 12, padBottom = 8;
  const chartW = W - padLeft - padRight;
  const chartH = H - padTop - padBottom;
  const step = chartW / (counts.length - 1);

  // Grid lines
  ctx.strokeStyle = 'rgba(255,255,255,.04)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padTop + (chartH / 4) * i;
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(W - padRight, y);
    ctx.stroke();
  }

  // Y axis labels
  ctx.fillStyle = 'rgba(255,255,255,.25)';
  ctx.font = `500 9px 'IBM Plex Mono', monospace`;
  ctx.textAlign = 'right';
  for (let i = 0; i <= 2; i++) {
    const val = Math.round(maxVal * (1 - i / 2));
    const y = padTop + (chartH / 2) * i;
    ctx.fillText(val, padLeft - 4, y + 3);
  }

  // Build points
  const pts = counts.map((v, i) => ({
    x: padLeft + i * step,
    y: padTop + chartH - (v / maxVal) * chartH
  }));

  // Area fill
  const grad = ctx.createLinearGradient(0, padTop, 0, H);
  grad.addColorStop(0, 'rgba(74,158,255,.25)');
  grad.addColorStop(1, 'rgba(74,158,255,.01)');
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const cp1x = pts[i - 1].x + step / 3;
    const cp2x = pts[i].x - step / 3;
    ctx.bezierCurveTo(cp1x, pts[i - 1].y, cp2x, pts[i].y, pts[i].x, pts[i].y);
  }
  ctx.lineTo(pts[pts.length - 1].x, H);
  ctx.lineTo(pts[0].x, H);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Line
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) {
    const cp1x = pts[i - 1].x + step / 3;
    const cp2x = pts[i].x - step / 3;
    ctx.bezierCurveTo(cp1x, pts[i - 1].y, cp2x, pts[i].y, pts[i].x, pts[i].y);
  }
  ctx.strokeStyle = '#4a9eff';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Dots
  pts.forEach(p => {
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#4a9eff';
    ctx.fill();
    ctx.strokeStyle = '#1a1a1a';
    ctx.lineWidth = 2;
    ctx.stroke();
  });

  // Chart month labels (every 3)
  const labelsEl = document.getElementById('chart-labels');
  if (labelsEl) {
    labelsEl.innerHTML = trendData
      .filter((_, i) => i % 3 === 0 || i === trendData.length - 1)
      .map(m => `<span class="chart-label">${m.label}</span>`)
      .join('');
  }
}

// ─── Update period label in table header ────────────────────────────────────

function updatePeriodLabel() {
  const labels = { week: 'Cette semaine', month: 'Ce mois', year: 'Cette année', all: 'Total' };
  const el = document.getElementById('period-col-label');
  if (el) el.textContent = labels[currentPeriod] || 'Période';
}

// ─── Full render cycle ───────────────────────────────────────────────────────

function render() {
  const periodStart = getPeriodStart(currentPeriod);
  const techList = aggregateByTech(allTickets, periodStart);
  const kpi = computeGlobalKpi(allTickets);
  const trend = buildMonthlyTrend(allTickets);

  renderKpi(kpi);
  renderTable(techList);
  renderDistribution(techList);
  renderChart(trend);
  updatePeriodLabel();
}

// ─── Load data ───────────────────────────────────────────────────────────────

async function loadData() {
  console.log('[stats-tech] Chargement des tickets...');

  const body = document.getElementById('perf-table-body');
  if (body) body.innerHTML = '<div class="loading-row">Chargement en cours…</div>';

  try {
    const snap = await getDocs(collection(db, 'tickets'));
    allTickets = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    console.log('[stats-tech] Tickets chargés:', allTickets.length);
    render();
  } catch (err) {
    console.error('[stats-tech] Erreur:', err);
    toast('Erreur de chargement : ' + err.message);
  }
}

// ─── Event listeners ────────────────────────────────────────────────────────

document.querySelectorAll('.period-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.period-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentPeriod = btn.dataset.period;
    render();
  });
});

document.getElementById('btn-refresh-tech')?.addEventListener('click', () => {
  loadData();
  toast('Données actualisées');
});

// Redraw chart on resize
window.addEventListener('resize', () => {
  if (allTickets.length) renderChart(buildMonthlyTrend(allTickets));
});

// ─── Bootstrap ───────────────────────────────────────────────────────────────

(async () => {
  console.log('[stats-tech] Initialisation...');

  const user = await requireAuth(true);
  if (!user) return;

  if (window.__isAdmin !== true) {
    toast('Accès admin requis');
    setTimeout(() => window.location.href = 'tickets.html', 800);
    return;
  }

  const displayName = user.displayName || user.email?.split('@')[0] || 'User';
  const ini = displayName.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  document.getElementById('user-display').textContent = ini;

  await loadData();
})();
