// Programmatic sprite sheet generation using Canvas API
// Each sheet: 4 cols (animation frames) x 4 rows (directions: down, right, left, up)
// Each frame: 16x24 pixels

export type SpriteSheet = HTMLCanvasElement;

const FRAME_W = 16;
const FRAME_H = 24;
const SHEET_COLS = 4; // animation frames
const SHEET_ROWS = 4; // directions: down, right, left, up

export const COLORS = [
  '#ff6b6b', '#6bff6b', '#6b6bff', '#ffff6b',
  '#ff6bff', '#6bffff', '#ff9944', '#44ff99',
];

const HEAD_COLORS = [
  '#ffcc88', '#ffddaa', '#eebb77', '#ffcc99',
  '#ffddbb', '#eebb88', '#ffcc77', '#ffdda0',
];

const cache = new Map<string, SpriteSheet>();

export function generateCharacterSheet(bodyColor: string, headColor: string): SpriteSheet {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_W * SHEET_COLS;
  canvas.height = FRAME_H * SHEET_ROWS;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const directions: Array<'down' | 'right' | 'left' | 'up'> = ['down', 'right', 'left', 'up'];

  for (let row = 0; row < SHEET_ROWS; row++) {
    for (let col = 0; col < SHEET_COLS; col++) {
      const ox = col * FRAME_W;
      const oy = row * FRAME_H;
      drawCharFrame(ctx, ox, oy, directions[row], col, bodyColor, headColor);
    }
  }

  return canvas;
}

function drawCharFrame(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  direction: 'down' | 'right' | 'left' | 'up',
  frame: number,
  bodyColor: string,
  headColor: string,
): void {
  // Walk offset for legs
  const isWalk = frame > 0;
  const legOffset = isWalk ? Math.sin(frame * 1.8) * 2 : 0;

  // Head (8x8, centered)
  ctx.fillStyle = headColor;
  ctx.fillRect(ox + 4, oy + 0, 8, 8);

  // Hair highlight
  ctx.fillStyle = darken(headColor, 20);
  ctx.fillRect(ox + 4, oy + 0, 8, 2);

  // Eyes
  ctx.fillStyle = '#333333';
  switch (direction) {
    case 'down':
      ctx.fillRect(ox + 5, oy + 4, 2, 2);
      ctx.fillRect(ox + 9, oy + 4, 2, 2);
      break;
    case 'up':
      // Eyes not visible from behind
      break;
    case 'left':
      ctx.fillRect(ox + 5, oy + 4, 2, 2);
      break;
    case 'right':
      ctx.fillRect(ox + 9, oy + 4, 2, 2);
      break;
  }

  // Body (10x10)
  ctx.fillStyle = bodyColor;
  ctx.fillRect(ox + 3, oy + 8, 10, 10);

  // Body shading
  ctx.fillStyle = darken(bodyColor, 15);
  ctx.fillRect(ox + 3, oy + 8, 2, 10);

  // Legs
  ctx.fillStyle = darken(bodyColor, 30);
  const leftLegY = oy + 18 + Math.round(legOffset);
  const rightLegY = oy + 18 - Math.round(legOffset);
  ctx.fillRect(ox + 4, leftLegY, 3, 4);
  ctx.fillRect(ox + 9, rightLegY, 3, 4);

  // Shoes
  ctx.fillStyle = '#444455';
  ctx.fillRect(ox + 4, leftLegY + 3, 3, 1);
  ctx.fillRect(ox + 9, rightLegY + 3, 3, 1);

  // Typing arms (only for frame 0 and 1 — idle/typing distinction)
  if (frame < 2 && direction === 'down') {
    ctx.fillStyle = headColor;
    const armY = frame === 0 ? oy + 12 : oy + 11;
    ctx.fillRect(ox + 1, armY, 3, 2);
    ctx.fillRect(ox + 12, armY + (frame === 0 ? 1 : 0), 3, 2);
  }
}

function darken(hex: string, amount: number): string {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function getSheet(spriteKey: string, index: number): SpriteSheet | undefined {
  const cacheKey = `${spriteKey}_${index}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const bodyColor = COLORS[index % COLORS.length];
  const headColor = HEAD_COLORS[index % HEAD_COLORS.length];
  const sheet = generateCharacterSheet(bodyColor, headColor);
  cache.set(cacheKey, sheet);
  return sheet;
}
