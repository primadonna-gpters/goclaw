import type { AgentStatus } from '../types';
import type { Seat } from './office';
import { TILE_SIZE, OFFICE_COLS, OFFICE_ROWS, COFFEE_MACHINE_POS } from './office';

export type CharacterState = 'idle' | 'typing' | 'walking' | 'cron' | 'error';

export type BehaviorState = 'none' | 'walking_to' | 'doing' | 'walking_back';
export type BehaviorKind = 'none' | 'wander' | 'coffee' | 'chat' | 'window_gaze' | 'stretch';

export interface Activity {
  message: string;
  ts: number;
}

export interface Character {
  id: string;
  name: string;
  sprite: string;
  state: CharacterState;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  seat: Seat;
  frame: number;
  frameTimer: number;
  direction: 'down' | 'up' | 'left' | 'right';
  idleTimer: number;
  errorTimer: number;
  activities: Activity[];
  detail: string;
  sessionCount: number;
  // Alive-idle additions
  breathPhase: number;        // breathing oscillation phase (radians)
  idleMicroTimer: number;     // timer for micro-actions (look around, stretch)
  nextMicroAction: number;    // when to do the next micro-action (ms)
  isStretching: boolean;      // whether character is currently stretching
  stretchTimer: number;       // how long the stretch lasts
  // Behavior system
  behaviorState: BehaviorState;
  behaviorKind: BehaviorKind;
  behaviorTarget: { x: number; y: number } | null;
  behaviorTimer: number;
  behaviorPause: number;      // how long to pause at destination (ms)
}

const WALK_SPEED = 60; // px/s
const IDLE_WANDER_TIME = 8_000; // 8 seconds between behaviors
const ERROR_DURATION = 3000; // 3 seconds
const ANIM_FRAME_MS = 300;
const MICRO_ACTION_MIN = 3000;  // 3s minimum between micro-actions
const MICRO_ACTION_MAX = 8000;  // 8s maximum
const STRETCH_DURATION = 1500;  // 1.5s stretch animation

function randomMicroDelay(): number {
  return MICRO_ACTION_MIN + Math.random() * (MICRO_ACTION_MAX - MICRO_ACTION_MIN);
}

// All characters reference for neighbor lookup — set from main.ts
let allCharactersRef: Map<string, Character> | null = null;

export function setCharactersRef(chars: Map<string, Character>): void {
  allCharactersRef = chars;
}

export function createCharacter(id: string, name: string, sprite: string, seat: Seat): Character {
  const x = seat.chairCol * TILE_SIZE;
  const y = seat.chairRow * TILE_SIZE;
  return {
    id,
    name,
    sprite,
    state: 'idle',
    x,
    y,
    targetX: x,
    targetY: y,
    seat,
    frame: 0,
    frameTimer: 0,
    direction: seat.facing,
    idleTimer: 0,
    errorTimer: 0,
    activities: [],
    detail: '',
    sessionCount: 0,
    breathPhase: Math.random() * Math.PI * 2,
    idleMicroTimer: 0,
    nextMicroAction: randomMicroDelay(),
    isStretching: false,
    stretchTimer: 0,
    behaviorState: 'none',
    behaviorKind: 'none',
    behaviorTarget: null,
    behaviorTimer: 0,
    behaviorPause: 0,
  };
}

function findNearestNeighborSeat(char: Character): { x: number; y: number } | null {
  if (!allCharactersRef) return null;
  let best: Character | null = null;
  let bestDist = Infinity;
  for (const other of allCharactersRef.values()) {
    if (other.id === char.id) continue;
    const dx = other.seat.chairCol - char.seat.chairCol;
    const dy = other.seat.chairRow - char.seat.chairRow;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = other;
    }
  }
  if (!best) return null;
  // Stand next to the neighbor (offset slightly so we don't overlap)
  return {
    x: best.seat.chairCol * TILE_SIZE + (Math.random() > 0.5 ? TILE_SIZE : -TILE_SIZE),
    y: best.seat.chairRow * TILE_SIZE,
  };
}

function findNearestWindowSpot(char: Character): { x: number; y: number } {
  // Walk up to the baseboard row (row 3) at the nearest window column
  const windowCols = [4, 10, 17, 23]; // center of each window
  let nearestCol = windowCols[0];
  let minDist = Infinity;
  for (const wc of windowCols) {
    const d = Math.abs(char.seat.chairCol - wc);
    if (d < minDist) {
      minDist = d;
      nearestCol = wc;
    }
  }
  return {
    x: nearestCol * TILE_SIZE,
    y: 3 * TILE_SIZE, // just below the baseboard
  };
}

function pickBehavior(char: Character): void {
  const roll = Math.random();
  const seatX = char.seat.chairCol * TILE_SIZE;
  const seatY = char.seat.chairRow * TILE_SIZE;

  if (roll < 0.30) {
    // WANDER (30%): walk to a random nearby spot
    const wanderX = clamp(
      seatX + (Math.random() - 0.5) * 120,
      TILE_SIZE * 2,
      (OFFICE_COLS - 2) * TILE_SIZE,
    );
    const wanderY = clamp(
      seatY + (Math.random() - 0.5) * 72,
      TILE_SIZE * 4,
      (OFFICE_ROWS - 2) * TILE_SIZE,
    );
    char.behaviorKind = 'wander';
    char.behaviorTarget = { x: wanderX, y: wanderY };
    char.behaviorPause = 500; // brief pause before walking back
    char.behaviorState = 'walking_to';
    char.targetX = wanderX;
    char.targetY = wanderY;
    char.state = 'walking';
  } else if (roll < 0.50) {
    // COFFEE RUN (20%): walk to the coffee machine
    const coffeePx = COFFEE_MACHINE_POS.col * TILE_SIZE;
    const coffeePy = (COFFEE_MACHINE_POS.row + 1) * TILE_SIZE; // stand in front
    char.behaviorKind = 'coffee';
    char.behaviorTarget = { x: coffeePx, y: coffeePy };
    char.behaviorPause = 3000; // 3s at coffee machine
    char.behaviorState = 'walking_to';
    char.targetX = coffeePx;
    char.targetY = coffeePy;
    char.state = 'walking';
  } else if (roll < 0.70) {
    // CHAT WITH NEIGHBOR (20%): walk to nearest character's seat
    const neighborSpot = findNearestNeighborSeat(char);
    if (neighborSpot) {
      char.behaviorKind = 'chat';
      char.behaviorTarget = { x: neighborSpot.x, y: neighborSpot.y };
      char.behaviorPause = 2000; // 2s chatting
      char.behaviorState = 'walking_to';
      char.targetX = neighborSpot.x;
      char.targetY = neighborSpot.y;
      char.state = 'walking';
    } else {
      // No neighbor found, fallback to wander
      pickWanderFallback(char, seatX, seatY);
    }
  } else if (roll < 0.85) {
    // WINDOW GAZE (15%): walk to nearest window
    const windowSpot = findNearestWindowSpot(char);
    char.behaviorKind = 'window_gaze';
    char.behaviorTarget = { x: windowSpot.x, y: windowSpot.y };
    char.behaviorPause = 2000; // 2s gazing
    char.behaviorState = 'walking_to';
    char.targetX = windowSpot.x;
    char.targetY = windowSpot.y;
    char.state = 'walking';
  } else {
    // STRETCH AT DESK (15%): stay at desk, stretch
    char.behaviorKind = 'stretch';
    char.behaviorState = 'doing';
    char.behaviorTarget = null;
    char.behaviorTimer = 0;
    char.behaviorPause = STRETCH_DURATION;
    char.isStretching = true;
    char.stretchTimer = 0;
  }
}

function pickWanderFallback(char: Character, seatX: number, seatY: number): void {
  const wanderX = clamp(
    seatX + (Math.random() - 0.5) * 120,
    TILE_SIZE * 2,
    (OFFICE_COLS - 2) * TILE_SIZE,
  );
  const wanderY = clamp(
    seatY + (Math.random() - 0.5) * 72,
    TILE_SIZE * 4,
    (OFFICE_ROWS - 2) * TILE_SIZE,
  );
  char.behaviorKind = 'wander';
  char.behaviorTarget = { x: wanderX, y: wanderY };
  char.behaviorPause = 500;
  char.behaviorState = 'walking_to';
  char.targetX = wanderX;
  char.targetY = wanderY;
  char.state = 'walking';
}

function resetBehavior(char: Character): void {
  char.behaviorState = 'none';
  char.behaviorKind = 'none';
  char.behaviorTarget = null;
  char.behaviorTimer = 0;
  char.behaviorPause = 0;
}

export function updateCharacter(char: Character, dt: number): void {
  // Always advance breathing phase
  char.breathPhase += dt * 0.003;
  if (char.breathPhase > Math.PI * 200) char.breathPhase -= Math.PI * 200;

  switch (char.state) {
    case 'idle': {
      // Stretch animation (from stretch behavior)
      if (char.isStretching) {
        char.stretchTimer += dt;
        if (char.stretchTimer >= STRETCH_DURATION) {
          char.isStretching = false;
          char.stretchTimer = 0;
          char.direction = char.seat.facing;
          resetBehavior(char);
        }
        break;
      }

      // "Doing" phase of behavior (pausing at destination)
      if (char.behaviorState === 'doing') {
        char.behaviorTimer += dt;

        // Direction during behavior
        if (char.behaviorKind === 'window_gaze') {
          char.direction = 'up'; // looking up at window
        } else if (char.behaviorKind === 'coffee') {
          char.direction = 'up'; // facing coffee machine
        } else if (char.behaviorKind === 'chat') {
          // Face the neighbor — just cycle randomly for animation
          if (char.behaviorTimer > 500 && Math.random() < 0.02) {
            const dirs: Array<'down' | 'up' | 'left' | 'right'> = ['down', 'up', 'left', 'right'];
            char.direction = dirs[Math.floor(Math.random() * dirs.length)];
          }
        }

        if (char.behaviorTimer >= char.behaviorPause) {
          // Done pausing, walk back to seat
          char.behaviorState = 'walking_back';
          char.targetX = char.seat.chairCol * TILE_SIZE;
          char.targetY = char.seat.chairRow * TILE_SIZE;
          char.state = 'walking';
        }
        break;
      }

      char.idleTimer += dt;
      char.idleMicroTimer += dt;

      // Micro-actions: look around
      if (char.idleMicroTimer >= char.nextMicroAction) {
        char.idleMicroTimer = 0;
        char.nextMicroAction = randomMicroDelay();

        // Look around: change direction briefly
        const dirs: Array<'down' | 'up' | 'left' | 'right'> = ['down', 'up', 'left', 'right'];
        const filtered = dirs.filter(d => d !== char.direction);
        char.direction = filtered[Math.floor(Math.random() * filtered.length)];
      }

      // Trigger behavior after idle time
      if (char.idleTimer >= IDLE_WANDER_TIME) {
        char.idleTimer = 0;
        pickBehavior(char);
      }
      break;
    }

    case 'typing':
    case 'cron': {
      char.frameTimer += dt;
      if (char.frameTimer >= ANIM_FRAME_MS) {
        char.frameTimer -= ANIM_FRAME_MS;
        char.frame = (char.frame + 1) % 2;
      }
      break;
    }

    case 'walking': {
      const dx = char.targetX - char.x;
      const dy = char.targetY - char.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 2) {
        char.x = char.targetX;
        char.y = char.targetY;

        // Behavior-aware arrival logic
        if (char.behaviorState === 'walking_to') {
          // Arrived at destination — switch to "doing" (pause)
          char.behaviorState = 'doing';
          char.behaviorTimer = 0;
          char.state = 'idle'; // idle but doing behavior
        } else if (char.behaviorState === 'walking_back') {
          // Back at seat — fully idle
          char.state = 'idle';
          char.direction = char.seat.facing;
          char.frame = 0;
          resetBehavior(char);
        } else {
          // Legacy: no behavior active — just check if we need to walk back to seat
          const seatX = char.seat.chairCol * TILE_SIZE;
          const seatY = char.seat.chairRow * TILE_SIZE;
          if (Math.abs(char.x - seatX) > 2 || Math.abs(char.y - seatY) > 2) {
            char.targetX = seatX;
            char.targetY = seatY;
          } else {
            char.state = 'idle';
            char.direction = char.seat.facing;
            char.frame = 0;
          }
        }
      } else {
        const move = (WALK_SPEED * dt) / 1000;
        const nx = dx / dist;
        const ny = dy / dist;
        char.x += nx * move;
        char.y += ny * move;

        // Update direction
        if (Math.abs(dx) > Math.abs(dy)) {
          char.direction = dx > 0 ? 'right' : 'left';
        } else {
          char.direction = dy > 0 ? 'down' : 'up';
        }

        // Walk animation: 4 frames
        char.frameTimer += dt;
        if (char.frameTimer >= 150) {
          char.frameTimer -= 150;
          char.frame = (char.frame + 1) % 4;
        }
      }
      break;
    }

    case 'error': {
      char.errorTimer += dt;
      if (char.errorTimer >= ERROR_DURATION) {
        char.errorTimer = 0;
        char.state = 'idle';
        char.frame = 0;
      }
      break;
    }
  }
}

/** Get the breathing y-offset for subtle bobbing animation */
export function getBreathOffset(char: Character): number {
  if (char.state === 'idle' || char.state === 'typing' || char.state === 'cron') {
    return Math.sin(char.breathPhase) * 0.8;
  }
  return 0;
}

/** Get whether the character is currently stretching */
export function isStretching(char: Character): boolean {
  return char.isStretching;
}

/** Get stretch progress 0..1 */
export function getStretchProgress(char: Character): number {
  if (!char.isStretching) return 0;
  return Math.min(1, char.stretchTimer / STRETCH_DURATION);
}

/** Check if character is at the coffee machine doing behavior */
export function isAtCoffeeMachine(char: Character): boolean {
  return char.behaviorKind === 'coffee' && char.behaviorState === 'doing';
}

export function applyStatus(char: Character, status: AgentStatus, detail?: string): void {
  if (detail !== undefined) {
    char.detail = detail;
  }

  switch (status) {
    case 'idle':
      if (char.state === 'walking') return; // let walk finish
      char.state = 'idle';
      char.frame = 0;
      char.idleTimer = 0;
      char.isStretching = false;
      resetBehavior(char);
      break;
    case 'typing':
    case 'tool':
      char.state = 'typing';
      char.frame = 0;
      char.frameTimer = 0;
      char.idleTimer = 0;
      char.isStretching = false;
      resetBehavior(char);
      returnToSeat(char);
      break;
    case 'cron':
      char.state = 'cron';
      char.frame = 0;
      char.frameTimer = 0;
      char.idleTimer = 0;
      char.isStretching = false;
      resetBehavior(char);
      returnToSeat(char);
      break;
    case 'error':
      char.state = 'error';
      char.errorTimer = 0;
      char.idleTimer = 0;
      char.isStretching = false;
      resetBehavior(char);
      returnToSeat(char);
      break;
  }
}

function returnToSeat(char: Character): void {
  const seatX = char.seat.chairCol * TILE_SIZE;
  const seatY = char.seat.chairRow * TILE_SIZE;
  if (Math.abs(char.x - seatX) > 2 || Math.abs(char.y - seatY) > 2) {
    char.x = seatX;
    char.y = seatY;
  }
  char.targetX = seatX;
  char.targetY = seatY;
  char.direction = char.seat.facing;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
