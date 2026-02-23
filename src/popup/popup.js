/**
 * Popup UI — state machine:
 *   loading → error
 *   loading → preview → submitting → done
 *   done → (re-run) → submitting → done
 */

import { slotName, SLOT } from '../utils/slot-utils.js';

// NBA season ends in the year after it starts (Oct → June).
// ESPN identifies seasons by their ending year.
const _now = new Date();
const SEASON_YEAR = _now.getMonth() >= 9 ? _now.getFullYear() + 1 : _now.getFullYear();

// ── DOM refs ──────────────────────────────────────────────────────────────────
const states = {
  loading: document.getElementById('state-loading'),
  error: document.getElementById('state-error'),
  preview: document.getElementById('state-preview'),
  submitting: document.getElementById('state-submitting'),
  done: document.getElementById('state-done'),
};

const el = {
  errorMessage: document.getElementById('error-message'),
  previewTeamName: document.getElementById('preview-team-name'),
  previewGameDays: document.getElementById('preview-game-days'),
  irSection: document.getElementById('ir-section'),
  irList: document.getElementById('ir-list'),
  injuredBenchSection: document.getElementById('injured-bench-section'),
  injuredBenchList: document.getElementById('injured-bench-list'),
  btnRun: document.getElementById('btn-run'),
  progressLabel: document.getElementById('progress-label'),
  progressFill: document.getElementById('progress-fill'),
  doneMessage: document.getElementById('done-message'),
  doneErrors: document.getElementById('done-errors'),
  btnRerun: document.getElementById('btn-rerun'),
};

// ── State ─────────────────────────────────────────────────────────────────────
let previewData = null; // cached from GET_PREVIEW response

// ── Init ──────────────────────────────────────────────────────────────────────
(async function init() {
  showState('loading');

  let auth;
  try {
    auth = await readAuth();
  } catch (err) {
    return showError(err.message);
  }

  let leagueId;
  try {
    leagueId = await getLeagueIdFromActiveTab();
  } catch (err) {
    return showError('Navigate to your ESPN Fantasy Basketball league page first.');
  }

  try {
    const response = await sendMessage({
      type: 'GET_PREVIEW',
      leagueId,
      seasonYear: SEASON_YEAR,
      auth,
    });

    if (!response.ok) {
      return showError(response.error || 'Failed to load preview.');
    }

    previewData = { ...response, leagueId, auth };
    renderPreview(response);
    showState('preview');
  } catch (err) {
    showError(`Failed to contact service worker: ${err.message}`);
  }
})();

// ── Button handlers ───────────────────────────────────────────────────────────
el.btnRun.addEventListener('click', startSetup);
el.btnRerun.addEventListener('click', startSetup);

async function startSetup() {
  if (!previewData) return;

  showState('submitting');
  setProgress(0, previewData.gameDayCount || 1);

  const port = chrome.runtime.connect({ name: 'lineup-progress' });
  port.onMessage.addListener(msg => {
    if (msg.type === 'PROGRESS') {
      setProgress(msg.completed, msg.total);
    }
  });

  try {
    const response = await sendMessage({
      type: 'RUN_SETUP',
      leagueId: previewData.leagueId,
      teamId: previewData.teamId,
      seasonYear: SEASON_YEAR,
      currentScoringPeriodId: previewData.currentScoringPeriodId,
      auth: previewData.auth,
    });

    port.disconnect();

    if (response.ok) {
      showDone(response.submitted, response.errors || []);
    } else {
      showError(response.error || 'Lineup setup failed.');
    }
  } catch (err) {
    port.disconnect();
    showError(`Setup failed: ${err.message}`);
  }
}

// ── Render helpers ────────────────────────────────────────────────────────────
function renderPreview(data) {
  el.previewTeamName.textContent = data.teamName || '—';
  el.previewGameDays.textContent = data.gameDayCount ?? '—';

  const irAssignments = data.irAssignments || [];
  const irOnly = irAssignments.filter(a => a.assignedSlot === SLOT.IR);
  const benchInjured = irAssignments.filter(a => a.assignedSlot === SLOT.BENCH);

  el.irList.innerHTML = '';
  if (irOnly.length > 0) {
    for (const { player } of irOnly) {
      el.irList.appendChild(makePlayerRow(player.name, 'IR'));
    }
    el.irSection.classList.remove('hidden');
  } else {
    el.irSection.classList.add('hidden');
  }

  el.injuredBenchList.innerHTML = '';
  if (benchInjured.length > 0) {
    for (const { player } of benchInjured) {
      el.injuredBenchList.appendChild(makePlayerRow(player.name, 'Bench', true));
    }
    el.injuredBenchSection.classList.remove('hidden');
  } else {
    el.injuredBenchSection.classList.add('hidden');
  }
}

function makePlayerRow(name, slotLabel, isBench = false) {
  const row = document.createElement('div');
  row.className = 'player-row';
  row.innerHTML = `
    <span class="player-name">${escapeHtml(name)}</span>
    <span class="player-slot${isBench ? ' bench' : ''}">${slotLabel}</span>
  `;
  return row;
}

function setProgress(completed, total) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  el.progressFill.style.width = `${pct}%`;
  el.progressLabel.textContent = `Day ${completed} of ${total}…`;
}

function showDone(submitted, errors) {
  el.doneMessage.textContent = `${submitted} lineup day${submitted !== 1 ? 's' : ''} submitted.`;
  if (errors.length > 0) {
    el.doneErrors.textContent = `${errors.length} day${errors.length !== 1 ? 's' : ''} failed (see console).`;
    el.doneErrors.classList.remove('hidden');
  } else {
    el.doneErrors.classList.add('hidden');
  }
  showState('done');
}

// ── State management ──────────────────────────────────────────────────────────
function showState(name) {
  for (const [key, el] of Object.entries(states)) {
    el.classList.toggle('hidden', key !== name);
  }
}

function showError(message) {
  el.errorMessage.textContent = message;
  showState('error');
}

// ── Auth helpers ──────────────────────────────────────────────────────────────
async function readAuth() {
  const [s2Cookie, swidCookie] = await Promise.all([
    getCookie('https://fantasy.espn.com', 'espn_s2'),
    getCookie('https://fantasy.espn.com', 'SWID'),
  ]);

  if (!s2Cookie || !swidCookie) {
    throw new Error('Not logged in to ESPN. Please log in at espn.com first.');
  }

  return { espnS2: s2Cookie.value, swid: swidCookie.value };
}

function getCookie(url, name) {
  return new Promise((resolve, reject) => {
    chrome.cookies.get({ url, name }, cookie => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(cookie);
    });
  });
}

// ── Tab / league helpers ──────────────────────────────────────────────────────
async function getLeagueIdFromActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url) throw new Error('No active tab URL.');

  const match = tab.url.match(/[?&]leagueId=(\d+)/);
  if (!match) throw new Error('No leagueId in URL.');

  return Number(match[1]);
}

// ── Messaging ─────────────────────────────────────────────────────────────────
function sendMessage(msg) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(msg, response => {
      if (chrome.runtime.lastError) reject(new Error(chrome.runtime.lastError.message));
      else resolve(response);
    });
  });
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
