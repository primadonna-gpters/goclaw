import type { PixelEvent, AgentState } from './types';
import { WsClient } from './ws/client';
import { GameLoop } from './engine/gameLoop';
import { buildTileMap, getSeat, getSeatCount } from './engine/office';
import { createCharacter, updateCharacter, applyStatus, type Character } from './engine/characters';
import { Renderer } from './engine/renderer';

// --- State ---
const agents = new Map<string, Character>();
let seatIndex = 0;
const tileMap = buildTileMap();

// --- Canvas setup ---
const canvas = document.getElementById('office') as HTMLCanvasElement;
const popup = document.getElementById('popup') as HTMLDivElement;
const renderer = new Renderer(canvas);

// Scale canvas to fit window
function scaleCanvas(): void {
  const maxW = window.innerWidth * 0.95;
  const maxH = window.innerHeight * 0.95;
  const scaleX = maxW / renderer.width;
  const scaleY = maxH / renderer.height;
  const scale = Math.max(2, Math.floor(Math.min(scaleX, scaleY)));
  canvas.style.width = `${renderer.width * scale}px`;
  canvas.style.height = `${renderer.height * scale}px`;
}

scaleCanvas();
window.addEventListener('resize', scaleCanvas);

// --- Agent management ---
function addAgent(agent: AgentState): void {
  if (agents.has(agent.id)) return;
  if (seatIndex >= getSeatCount()) return; // office full

  const seat = getSeat(seatIndex);
  if (!seat) return;

  const char = createCharacter(agent.id, agent.name, agent.sprite, seat);
  char.sessionCount = agent.session_count;
  if (agent.detail) char.detail = agent.detail;
  applyStatus(char, agent.status, agent.detail);

  agents.set(agent.id, char);
  seatIndex++;
}

function removeAgent(agentId: string): void {
  agents.delete(agentId);
}

// --- Event handling ---
function handleEvent(event: PixelEvent): void {
  switch (event.type) {
    case 'snapshot': {
      agents.clear();
      seatIndex = 0;
      if (event.agents) {
        for (const a of event.agents) {
          addAgent(a);
        }
      }
      break;
    }

    case 'agent_status': {
      if (!event.agent_id || !event.status) break;
      const char = agents.get(event.agent_id);
      if (char) {
        applyStatus(char, event.status, event.detail);
      }
      break;
    }

    case 'agent_added': {
      if (event.agent) {
        addAgent(event.agent);
      }
      break;
    }

    case 'agent_removed': {
      if (event.agent_id) {
        removeAgent(event.agent_id);
      }
      break;
    }

    case 'activity': {
      if (event.agent_id && event.message) {
        const char = agents.get(event.agent_id);
        if (char) {
          char.activities.unshift({
            message: event.message,
            ts: Date.now(),
          });
          // Keep last 10
          if (char.activities.length > 10) {
            char.activities.length = 10;
          }
        }
      }
      break;
    }

    case 'cron_fire': {
      if (event.agent_id) {
        const char = agents.get(event.agent_id);
        if (char) {
          applyStatus(char, 'cron', event.detail);
          char.activities.unshift({
            message: `Cron: ${event.detail || 'scheduled task'}`,
            ts: Date.now(),
          });
          if (char.activities.length > 10) {
            char.activities.length = 10;
          }
        }
      }
      break;
    }
  }
}

// --- WebSocket ---
const ws = new WsClient(handleEvent);
ws.connect();

// --- Game loop ---
function update(dt: number): void {
  for (const char of agents.values()) {
    updateCharacter(char, dt);
  }
}

function render(): void {
  renderer.render(tileMap, Array.from(agents.values()));
}

const loop = new GameLoop(update, render);
loop.start();

// --- Click handler for popup ---
canvas.addEventListener('click', (e) => {
  const rect = canvas.getBoundingClientRect();
  const scaleX = renderer.width / rect.width;
  const scaleY = renderer.height / rect.height;
  const canvasX = (e.clientX - rect.left) * scaleX;
  const canvasY = (e.clientY - rect.top) * scaleY;

  const chars = Array.from(agents.values());
  const hit = renderer.hitTest(chars, canvasX, canvasY);

  if (hit) {
    showPopup(e.clientX, e.clientY, hit);
  } else {
    hidePopup();
  }
});

// Close popup on click outside
document.addEventListener('click', (e) => {
  if (e.target !== canvas && !popup.contains(e.target as Node)) {
    hidePopup();
  }
});

const STATUS_ICONS: Record<string, string> = {
  idle: '\u{1F7E2}',    // green circle
  typing: '\u{2328}\u{FE0F}', // keyboard
  tool: '\u{1F527}',    // wrench
  cron: '\u{23F0}',     // alarm clock
  error: '\u{1F534}',   // red circle
};

const STATUS_LABELS: Record<string, string> = {
  idle: 'Idle',
  typing: 'Typing',
  tool: 'Running Tool',
  cron: 'Cron Job',
  error: 'Error',
};

function showPopup(clientX: number, clientY: number, char: Character): void {
  const statusIcon = STATUS_ICONS[char.state] || '';
  const statusLabel = STATUS_LABELS[char.state] || char.state;

  let html = `<h3>${char.name}</h3>`;
  html += `<div class="status">${statusIcon} ${statusLabel}</div>`;
  if (char.detail) {
    html += `<div class="status" style="color:#8b949e">${char.detail}</div>`;
  }
  html += `<div class="status">Sessions: ${char.sessionCount}</div>`;

  if (char.activities.length > 0) {
    html += `<div class="activity">`;
    for (const act of char.activities.slice(0, 5)) {
      const ago = timeAgo(act.ts);
      html += `<div>${ago} - ${escapeHtml(act.message)}</div>`;
    }
    html += `</div>`;
  }

  popup.innerHTML = html;
  popup.classList.add('visible');

  // Position popup near click, but keep in viewport
  const pw = popup.offsetWidth;
  const ph = popup.offsetHeight;
  let px = clientX + 12;
  let py = clientY - 20;
  if (px + pw > window.innerWidth - 10) px = clientX - pw - 12;
  if (py + ph > window.innerHeight - 10) py = window.innerHeight - ph - 10;
  if (py < 10) py = 10;

  popup.style.left = `${px}px`;
  popup.style.top = `${py}px`;
}

function hidePopup(): void {
  popup.classList.remove('visible');
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  return `${Math.floor(diff / 3_600_000)}h ago`;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
