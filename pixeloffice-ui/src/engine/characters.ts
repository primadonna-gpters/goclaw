import type { AgentStatus } from '../types';
import type { Seat } from './office';
import { TILE_SIZE, OFFICE_COLS, OFFICE_ROWS } from './office';

export type CharacterState = 'idle' | 'typing' | 'walking' | 'cron' | 'error';

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
  wanderDelay: number;        // random delay before each wander (ms)
  breathPhase: number;        // breathing oscillation phase (radians)
  idleMicroTimer: number;     // timer for micro-actions (look around, stretch)
  nextMicroAction: number;    // when to do the next micro-action (ms)
  isStretching: boolean;      // whether character is currently stretching
  stretchTimer: number;       // how long the stretch lasts
}

const WALK_SPEED = 60; // px/s (increased from 40)
const IDLE_WANDER_TIME = 15_000; // 15 seconds (reduced from 5 minutes)
const ERROR_DURATION = 3000; // 3 seconds
const ANIM_FRAME_MS = 300;
const MICRO_ACTION_MIN = 3000;  // 3s minimum between micro-actions
const MICRO_ACTION_MAX = 8000;  // 8s maximum
const STRETCH_DURATION = 1500;  // 1.5s stretch animation

function randomWanderDelay(): number {
  return 5000 + Math.random() * 10000; // 5-15s random delay
}

function randomMicroDelay(): number {
  return MICRO_ACTION_MIN + Math.random() * (MICRO_ACTION_MAX - MICRO_ACTION_MIN);
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
    wanderDelay: randomWanderDelay(),
    breathPhase: Math.random() * Math.PI * 2, // randomize so they don't breathe in sync
    idleMicroTimer: 0,
    nextMicroAction: randomMicroDelay(),
    isStretching: false,
    stretchTimer: 0,
  };
}

export function updateCharacter(char: Character, dt: number): void {
  // Always advance breathing phase (even when typing/walking, for subtle life)
  char.breathPhase += dt * 0.003; // slow oscillation (~2s period)
  if (char.breathPhase > Math.PI * 200) char.breathPhase -= Math.PI * 200; // prevent overflow

  switch (char.state) {
    case 'idle': {
      // Stretch animation
      if (char.isStretching) {
        char.stretchTimer += dt;
        if (char.stretchTimer >= STRETCH_DURATION) {
          char.isStretching = false;
          char.stretchTimer = 0;
          char.direction = char.seat.facing; // return to seat facing
        }
        break; // don't process wander or micro during stretch
      }

      char.idleTimer += dt;
      char.idleMicroTimer += dt;

      // Micro-actions: look around or stretch
      if (char.idleMicroTimer >= char.nextMicroAction) {
        char.idleMicroTimer = 0;
        char.nextMicroAction = randomMicroDelay();

        const action = Math.random();
        if (action < 0.6) {
          // Look around: change direction briefly
          const dirs: Array<'down' | 'up' | 'left' | 'right'> = ['down', 'up', 'left', 'right'];
          const filtered = dirs.filter(d => d !== char.direction);
          char.direction = filtered[Math.floor(Math.random() * filtered.length)];
        } else {
          // Stretch
          char.isStretching = true;
          char.stretchTimer = 0;
        }
      }

      // Wander after idle time + random delay
      if (char.idleTimer >= IDLE_WANDER_TIME + char.wanderDelay) {
        char.idleTimer = 0;
        char.wanderDelay = randomWanderDelay(); // new random delay for next time
        // Pick a random nearby walkable spot
        const wanderX = clamp(
          char.seat.chairCol * TILE_SIZE + (Math.random() - 0.5) * 80,
          TILE_SIZE * 2,
          (OFFICE_COLS - 2) * TILE_SIZE,
        );
        const wanderY = clamp(
          char.seat.chairRow * TILE_SIZE + (Math.random() - 0.5) * 48,
          TILE_SIZE * 5,
          (OFFICE_ROWS - 2) * TILE_SIZE,
        );
        char.targetX = wanderX;
        char.targetY = wanderY;
        char.state = 'walking';
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
        // If we wandered, go back to seat
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
    return Math.sin(char.breathPhase) * 0.8; // subtle 0.8px oscillation
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
      break;
    case 'typing':
    case 'tool':
      char.state = 'typing';
      char.frame = 0;
      char.frameTimer = 0;
      char.idleTimer = 0;
      char.isStretching = false;
      // Return to seat if wandering
      returnToSeat(char);
      break;
    case 'cron':
      char.state = 'cron';
      char.frame = 0;
      char.frameTimer = 0;
      char.idleTimer = 0;
      char.isStretching = false;
      returnToSeat(char);
      break;
    case 'error':
      char.state = 'error';
      char.errorTimer = 0;
      char.idleTimer = 0;
      char.isStretching = false;
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
