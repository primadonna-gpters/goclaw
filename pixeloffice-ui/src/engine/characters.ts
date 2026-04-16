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
}

const WALK_SPEED = 40; // px/s
const IDLE_WANDER_TIME = 300_000; // 5 minutes in ms
const ERROR_DURATION = 3000; // 3 seconds
const ANIM_FRAME_MS = 300;

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
  };
}

export function updateCharacter(char: Character, dt: number): void {
  switch (char.state) {
    case 'idle': {
      char.idleTimer += dt;
      if (char.idleTimer >= IDLE_WANDER_TIME) {
        char.idleTimer = 0;
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
      break;
    case 'typing':
    case 'tool':
      char.state = 'typing';
      char.frame = 0;
      char.frameTimer = 0;
      char.idleTimer = 0;
      // Return to seat if wandering
      returnToSeat(char);
      break;
    case 'cron':
      char.state = 'cron';
      char.frame = 0;
      char.frameTimer = 0;
      char.idleTimer = 0;
      returnToSeat(char);
      break;
    case 'error':
      char.state = 'error';
      char.errorTimer = 0;
      char.idleTimer = 0;
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
