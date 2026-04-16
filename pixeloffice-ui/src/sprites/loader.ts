// Programmatic sprite sheet generation using Canvas API
// Each sheet: 4 cols (animation frames) x 4 rows (directions: down, right, left, up)
// Each frame: 24x32 pixels (scaled up from old 16x24)

export type SpriteSheet = HTMLCanvasElement;

const FRAME_W = 24;
const FRAME_H = 32;
const SHEET_COLS = 4; // animation frames
const SHEET_ROWS = 4; // directions: down, right, left, up

// Body / shirt colors — distinct, warm-toned
export const COLORS = [
  '#e06050', // warm red
  '#50a060', // forest green
  '#5080d0', // steel blue
  '#d0a030', // golden yellow
  '#a060c0', // purple
  '#40b0b0', // teal
  '#e08040', // orange
  '#7090a0', // slate
];

// Hair colors — variety of styles
const HAIR_COLORS = [
  '#3a2a1a', // dark brown
  '#6a4a2a', // brown
  '#2a1a0a', // black
  '#c08040', // golden
  '#8a3020', // auburn
  '#4a3a3a', // dark grey-brown
  '#dda050', // blonde
  '#2a3a4a', // dark blue-black
];

const HEAD_COLORS = [
  '#ffcc88', '#ffddaa', '#eebb77', '#ffcc99',
  '#f0c080', '#e0b070', '#ffbb88', '#f5d0a0',
];

const cache = new Map<string, SpriteSheet>();

export function generateCharacterSheet(bodyColor: string, headColor: string, hairColor: string): SpriteSheet {
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
      drawCharFrame(ctx, ox, oy, directions[row], col, bodyColor, headColor, hairColor);
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
  hairColor: string,
): void {
  const isWalk = frame > 0;
  const legOffset = isWalk ? Math.sin(frame * 1.8) * 3 : 0;

  // --- Head ---
  // Base head
  ctx.fillStyle = headColor;
  ctx.fillRect(ox + 7, oy + 1, 10, 10);
  // Ear bumps
  ctx.fillRect(ox + 5, oy + 4, 2, 4);
  ctx.fillRect(ox + 17, oy + 4, 2, 4);

  // --- Hair ---
  ctx.fillStyle = hairColor;
  switch (direction) {
    case 'down':
      // Front-facing: hair on top + sides
      ctx.fillRect(ox + 6, oy + 0, 12, 4);
      ctx.fillRect(ox + 5, oy + 1, 2, 5);
      ctx.fillRect(ox + 17, oy + 1, 2, 5);
      // Highlight
      ctx.fillStyle = lighten(hairColor, 20);
      ctx.fillRect(ox + 9, oy + 0, 4, 2);
      break;
    case 'up':
      // Back-facing: full hair coverage
      ctx.fillRect(ox + 6, oy + 0, 12, 8);
      ctx.fillRect(ox + 5, oy + 1, 14, 6);
      ctx.fillStyle = lighten(hairColor, 15);
      ctx.fillRect(ox + 8, oy + 1, 6, 3);
      break;
    case 'left':
      ctx.fillRect(ox + 6, oy + 0, 11, 4);
      ctx.fillRect(ox + 5, oy + 1, 4, 6);
      break;
    case 'right':
      ctx.fillRect(ox + 7, oy + 0, 11, 4);
      ctx.fillRect(ox + 15, oy + 1, 4, 6);
      break;
  }

  // --- Eyes ---
  ctx.fillStyle = '#333333';
  switch (direction) {
    case 'down':
      ctx.fillRect(ox + 9, oy + 5, 2, 2);
      ctx.fillRect(ox + 13, oy + 5, 2, 2);
      // White eye highlights
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ox + 9, oy + 5, 1, 1);
      ctx.fillRect(ox + 13, oy + 5, 1, 1);
      // Mouth
      ctx.fillStyle = '#cc8866';
      ctx.fillRect(ox + 10, oy + 8, 4, 1);
      break;
    case 'up':
      // Eyes not visible from behind
      break;
    case 'left':
      ctx.fillRect(ox + 8, oy + 5, 2, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ox + 8, oy + 5, 1, 1);
      break;
    case 'right':
      ctx.fillRect(ox + 14, oy + 5, 2, 2);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(ox + 14, oy + 5, 1, 1);
      break;
  }

  // --- Body / Shirt ---
  ctx.fillStyle = bodyColor;
  ctx.fillRect(ox + 5, oy + 11, 14, 12);

  // Collar
  ctx.fillStyle = lighten(bodyColor, 25);
  ctx.fillRect(ox + 9, oy + 11, 6, 2);

  // Body shading (left side darker)
  ctx.fillStyle = darken(bodyColor, 20);
  ctx.fillRect(ox + 5, oy + 11, 3, 12);

  // Body highlight (right side lighter)
  ctx.fillStyle = lighten(bodyColor, 10);
  ctx.fillRect(ox + 15, oy + 13, 3, 8);

  // Belt
  ctx.fillStyle = darken(bodyColor, 40);
  ctx.fillRect(ox + 5, oy + 21, 14, 2);

  // --- Arms ---
  ctx.fillStyle = headColor; // skin-colored arms
  if (frame < 2 && direction === 'down') {
    // Typing / idle arms reaching forward
    const armY = frame === 0 ? oy + 15 : oy + 14;
    ctx.fillRect(ox + 2, armY, 4, 3);
    ctx.fillRect(ox + 18, armY + (frame === 0 ? 1 : 0), 4, 3);
    // Upper arm (shirt color)
    ctx.fillStyle = bodyColor;
    ctx.fillRect(ox + 3, oy + 12, 3, 4);
    ctx.fillRect(ox + 18, oy + 12, 3, 4);
  } else if (isWalk) {
    // Walking arm swing
    const armSwing = Math.sin(frame * 1.8) * 2;
    ctx.fillRect(ox + 2, oy + 14 - Math.round(armSwing), 3, 4);
    ctx.fillRect(ox + 19, oy + 14 + Math.round(armSwing), 3, 4);
    ctx.fillStyle = bodyColor;
    ctx.fillRect(ox + 3, oy + 12, 3, 3);
    ctx.fillRect(ox + 18, oy + 12, 3, 3);
  } else {
    // Resting arms at side
    ctx.fillRect(ox + 2, oy + 17, 3, 4);
    ctx.fillRect(ox + 19, oy + 17, 3, 4);
    ctx.fillStyle = bodyColor;
    ctx.fillRect(ox + 3, oy + 12, 3, 6);
    ctx.fillRect(ox + 18, oy + 12, 3, 6);
  }

  // --- Legs / Pants ---
  ctx.fillStyle = '#3a4a5a'; // dark pants
  const leftLegY = oy + 23 + Math.round(legOffset);
  const rightLegY = oy + 23 - Math.round(legOffset);
  // Left leg
  ctx.fillRect(ox + 6, leftLegY, 5, 6);
  // Right leg
  ctx.fillRect(ox + 13, rightLegY, 5, 6);

  // Pants highlight
  ctx.fillStyle = '#4a5a6a';
  ctx.fillRect(ox + 7, leftLegY, 2, 5);
  ctx.fillRect(ox + 14, rightLegY, 2, 5);

  // --- Shoes ---
  ctx.fillStyle = '#2a2a30';
  ctx.fillRect(ox + 5, leftLegY + 5, 6, 2);
  ctx.fillRect(ox + 13, rightLegY + 5, 6, 2);
  // Shoe highlight
  ctx.fillStyle = '#3a3a44';
  ctx.fillRect(ox + 6, leftLegY + 5, 3, 1);
  ctx.fillRect(ox + 14, rightLegY + 5, 3, 1);

  // --- Shadow under character ---
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.fillRect(ox + 4, oy + 30, 16, 2);
}

function darken(hex: string, amount: number): string {
  const r = Math.max(0, parseInt(hex.slice(1, 3), 16) - amount);
  const g = Math.max(0, parseInt(hex.slice(3, 5), 16) - amount);
  const b = Math.max(0, parseInt(hex.slice(5, 7), 16) - amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function lighten(hex: string, amount: number): string {
  const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + amount);
  const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + amount);
  const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + amount);
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

export function getSheet(spriteKey: string, index: number): SpriteSheet | undefined {
  const cacheKey = `${spriteKey}_${index}`;
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey);
  }

  const bodyColor = COLORS[index % COLORS.length];
  const headColor = HEAD_COLORS[index % HEAD_COLORS.length];
  const hairColor = HAIR_COLORS[index % HAIR_COLORS.length];
  const sheet = generateCharacterSheet(bodyColor, headColor, hairColor);
  cache.set(cacheKey, sheet);
  return sheet;
}
