// Programmatic sprite sheet generation using Canvas API
// Each sheet: 4 cols (animation frames) x 4 rows (directions: down, right, left, up)
// Each frame: 24x32 pixels (scaled up from old 16x24)

export type SpriteSheet = HTMLCanvasElement;

const FRAME_W = 24;
const FRAME_H = 32;
const SHEET_COLS = 4; // animation frames
const SHEET_ROWS = 4; // directions: down, right, left, up

type Direction = 'down' | 'right' | 'left' | 'up';
const DIRECTIONS: Direction[] = ['down', 'right', 'left', 'up'];

// Body / shirt colors — distinct, warm-toned (for generic characters)
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

const HAIR_COLORS = [
  '#3a2a1a', '#6a4a2a', '#2a1a0a', '#c08040',
  '#8a3020', '#4a3a3a', '#dda050', '#2a3a4a',
];

const HEAD_COLORS = [
  '#ffcc88', '#ffddaa', '#eebb77', '#ffcc99',
  '#f0c080', '#e0b070', '#ffbb88', '#f5d0a0',
];

const cache = new Map<string, SpriteSheet>();

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

function makeSheet(drawFrame: (ctx: CanvasRenderingContext2D, ox: number, oy: number, dir: Direction, frame: number) => void): SpriteSheet {
  const canvas = document.createElement('canvas');
  canvas.width = FRAME_W * SHEET_COLS;
  canvas.height = FRAME_H * SHEET_ROWS;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  for (let row = 0; row < SHEET_ROWS; row++) {
    for (let col = 0; col < SHEET_COLS; col++) {
      drawFrame(ctx, col * FRAME_W, row * FRAME_H, DIRECTIONS[row], col);
    }
  }
  return canvas;
}

function getOrGenerate(key: string, gen: () => SpriteSheet): SpriteSheet {
  if (cache.has(key)) return cache.get(key)!;
  const sheet = gen();
  cache.set(key, sheet);
  return sheet;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function getSheet(spriteKey: string, index: number): SpriteSheet | undefined {
  if (spriteKey === 'bbojjak') return getOrGenerate(spriteKey, () => generateBlackCat(false));
  if (spriteKey === 'bbojjak-external') return getOrGenerate(spriteKey, () => generateBlackCat(true));
  if (spriteKey === 'bboya') return getOrGenerate(spriteKey, () => generateSilverCat());
  if (spriteKey === 'friday') return getOrGenerate(spriteKey, () => generateDigitalAssistant());
  if (spriteKey === 'sigor') return getOrGenerate(spriteKey, () => generateGlassesCharacter());
  // Default: generic human with color from palette
  return getOrGenerate(`_default_${index}`, () => generateGenericCharacter(COLORS[index % COLORS.length]));
}

// Keep the old export for any external callers
export function generateCharacterSheet(bodyColor: string, headColor: string, hairColor: string): SpriteSheet {
  return generateGenericCharacter(bodyColor, headColor, hairColor);
}

// ===========================================================================
// 1. Black Cat (bbojjak / bbojjak-external)
// ===========================================================================

function generateBlackCat(withHeadset: boolean): SpriteSheet {
  const body = '#222222';
  const shade = '#333333';
  const eyes = '#FFD700';
  const nose = '#FF6688';
  const headsetColor = '#44DD44';

  return makeSheet((ctx, ox, oy, dir, frame) => {
    const isWalk = frame > 0;
    const legOffset = isWalk ? Math.sin(frame * 1.8) * 2 : 0;

    // --- Shadow ---
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(ox + 4, oy + 30, 16, 2);

    // --- Head (round, black) ---
    ctx.fillStyle = body;
    ctx.fillRect(ox + 7, oy + 2, 10, 10);
    // Cheeks
    ctx.fillRect(ox + 6, oy + 5, 12, 6);

    // --- Cat ears (pointed triangles) ---
    ctx.fillStyle = body;
    // Left ear
    ctx.fillRect(ox + 6, oy + 0, 4, 2);
    ctx.fillRect(ox + 7, oy + 0, 2, 1);
    ctx.fillRect(ox + 6, oy + 1, 3, 2);
    // Right ear
    ctx.fillRect(ox + 14, oy + 0, 4, 2);
    ctx.fillRect(ox + 15, oy + 0, 2, 1);
    ctx.fillRect(ox + 15, oy + 1, 3, 2);
    // Inner ear (dark grey)
    ctx.fillStyle = '#444444';
    ctx.fillRect(ox + 7, oy + 1, 2, 1);
    ctx.fillRect(ox + 15, oy + 1, 2, 1);

    // --- Eyes ---
    switch (dir) {
      case 'down':
        ctx.fillStyle = eyes;
        ctx.fillRect(ox + 9, oy + 5, 2, 2);
        ctx.fillRect(ox + 13, oy + 5, 2, 2);
        // Eye shine
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(ox + 9, oy + 5, 1, 1);
        ctx.fillRect(ox + 13, oy + 5, 1, 1);
        // Nose
        ctx.fillStyle = nose;
        ctx.fillRect(ox + 11, oy + 8, 2, 1);
        // Mouth whisker lines (subtle)
        ctx.fillStyle = shade;
        ctx.fillRect(ox + 10, oy + 9, 4, 1);
        break;
      case 'up':
        // Back of head — ears visible, no face
        break;
      case 'left':
        ctx.fillStyle = eyes;
        ctx.fillRect(ox + 8, oy + 5, 2, 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(ox + 8, oy + 5, 1, 1);
        ctx.fillStyle = nose;
        ctx.fillRect(ox + 7, oy + 8, 1, 1);
        break;
      case 'right':
        ctx.fillStyle = eyes;
        ctx.fillRect(ox + 14, oy + 5, 2, 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(ox + 14, oy + 5, 1, 1);
        ctx.fillStyle = nose;
        ctx.fillRect(ox + 16, oy + 8, 1, 1);
        break;
    }

    // --- Body ---
    ctx.fillStyle = body;
    ctx.fillRect(ox + 7, oy + 12, 10, 10);
    // Shading
    ctx.fillStyle = shade;
    ctx.fillRect(ox + 7, oy + 12, 3, 10);
    // Belly (very subtle lighter)
    ctx.fillStyle = '#2a2a2a';
    if (dir === 'down') {
      ctx.fillRect(ox + 10, oy + 14, 4, 6);
    }

    // --- Front paws / legs ---
    ctx.fillStyle = body;
    const leftY = oy + 22 + Math.round(legOffset);
    const rightY = oy + 22 - Math.round(legOffset);
    ctx.fillRect(ox + 7, leftY, 4, 6);
    ctx.fillRect(ox + 13, rightY, 4, 6);
    // Paw tips
    ctx.fillStyle = shade;
    ctx.fillRect(ox + 7, leftY + 5, 4, 1);
    ctx.fillRect(ox + 13, rightY + 5, 4, 1);

    // --- Tail (side views) ---
    ctx.fillStyle = body;
    switch (dir) {
      case 'left':
        ctx.fillRect(ox + 17, oy + 14, 2, 1);
        ctx.fillRect(ox + 18, oy + 13, 2, 1);
        ctx.fillRect(ox + 19, oy + 12, 2, 1);
        break;
      case 'right':
        ctx.fillRect(ox + 5, oy + 14, 2, 1);
        ctx.fillRect(ox + 4, oy + 13, 2, 1);
        ctx.fillRect(ox + 3, oy + 12, 2, 1);
        break;
      case 'down':
        // Tail peeks out right side
        ctx.fillRect(ox + 17, oy + 16, 2, 1);
        ctx.fillRect(ox + 18, oy + 15, 2, 1);
        break;
      case 'up':
        // Tail visible in center-up
        ctx.fillRect(ox + 11, oy + 11, 2, 1);
        ctx.fillRect(ox + 12, oy + 10, 2, 1);
        ctx.fillRect(ox + 12, oy + 9, 1, 1);
        break;
    }

    // --- Headset (bbojjak-external only) ---
    if (withHeadset) {
      // Headset band arching over head between ears
      ctx.fillStyle = headsetColor;
      ctx.fillRect(ox + 8, oy + 0, 8, 1); // top band
      ctx.fillRect(ox + 7, oy + 1, 1, 1); // left connect
      ctx.fillRect(ox + 16, oy + 1, 1, 1); // right connect

      // Earpiece on left side
      ctx.fillStyle = headsetColor;
      ctx.fillRect(ox + 5, oy + 4, 2, 3);
      // Earpiece highlight
      ctx.fillStyle = lighten(headsetColor, 30);
      ctx.fillRect(ox + 5, oy + 4, 1, 1);

      // Mic arm extending from earpiece toward mouth
      ctx.fillStyle = darken(headsetColor, 20);
      ctx.fillRect(ox + 5, oy + 7, 1, 2); // arm down
      ctx.fillRect(ox + 6, oy + 8, 2, 1); // arm toward mouth
      // Mic tip
      ctx.fillStyle = '#333333';
      ctx.fillRect(ox + 8, oy + 8, 1, 1);
    }
  });
}

// ===========================================================================
// 2. Silver Cat (bboya)
// ===========================================================================

function generateSilverCat(): SpriteSheet {
  const body = '#A0A0A8';
  const belly = '#C0C0C8';
  const shade = '#808088';
  const eyes = '#55CC55';
  const nose = '#FF6688';

  return makeSheet((ctx, ox, oy, dir, frame) => {
    const isWalk = frame > 0;
    const legOffset = isWalk ? Math.sin(frame * 1.8) * 2 : 0;

    // --- Shadow ---
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(ox + 4, oy + 30, 16, 2);

    // --- Head (rounder, British Shorthair) ---
    ctx.fillStyle = body;
    ctx.fillRect(ox + 6, oy + 2, 12, 11);
    // Extra roundness
    ctx.fillRect(ox + 5, oy + 4, 14, 7);

    // --- Cat ears (shorter, rounder than bbojjak) ---
    ctx.fillStyle = body;
    // Left ear
    ctx.fillRect(ox + 6, oy + 1, 3, 2);
    ctx.fillRect(ox + 7, oy + 0, 2, 2);
    // Right ear
    ctx.fillRect(ox + 15, oy + 1, 3, 2);
    ctx.fillRect(ox + 15, oy + 0, 2, 2);
    // Inner ear (pink)
    ctx.fillStyle = '#DDAAAA';
    ctx.fillRect(ox + 7, oy + 1, 1, 1);
    ctx.fillRect(ox + 16, oy + 1, 1, 1);

    // --- Lighter cheeks ---
    ctx.fillStyle = lighten(body, 15);
    if (dir === 'down') {
      ctx.fillRect(ox + 6, oy + 7, 3, 3);
      ctx.fillRect(ox + 15, oy + 7, 3, 3);
    }

    // --- Eyes ---
    switch (dir) {
      case 'down':
        ctx.fillStyle = eyes;
        ctx.fillRect(ox + 9, oy + 5, 2, 2);
        ctx.fillRect(ox + 13, oy + 5, 2, 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(ox + 9, oy + 5, 1, 1);
        ctx.fillRect(ox + 13, oy + 5, 1, 1);
        // Nose
        ctx.fillStyle = nose;
        ctx.fillRect(ox + 11, oy + 8, 2, 1);
        // Mouth
        ctx.fillStyle = shade;
        ctx.fillRect(ox + 10, oy + 9, 4, 1);
        break;
      case 'up':
        break;
      case 'left':
        ctx.fillStyle = eyes;
        ctx.fillRect(ox + 8, oy + 5, 2, 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(ox + 8, oy + 5, 1, 1);
        ctx.fillStyle = nose;
        ctx.fillRect(ox + 6, oy + 8, 1, 1);
        break;
      case 'right':
        ctx.fillStyle = eyes;
        ctx.fillRect(ox + 14, oy + 5, 2, 2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(ox + 14, oy + 5, 1, 1);
        ctx.fillStyle = nose;
        ctx.fillRect(ox + 17, oy + 8, 1, 1);
        break;
    }

    // --- Body ---
    ctx.fillStyle = body;
    ctx.fillRect(ox + 6, oy + 13, 12, 9);
    // Shading
    ctx.fillStyle = shade;
    ctx.fillRect(ox + 6, oy + 13, 3, 9);
    // Belly
    ctx.fillStyle = belly;
    if (dir === 'down') {
      ctx.fillRect(ox + 9, oy + 14, 6, 6);
    }

    // --- Legs ---
    ctx.fillStyle = body;
    const leftY = oy + 22 + Math.round(legOffset);
    const rightY = oy + 22 - Math.round(legOffset);
    ctx.fillRect(ox + 7, leftY, 4, 6);
    ctx.fillRect(ox + 13, rightY, 4, 6);
    // Paw tips (lighter)
    ctx.fillStyle = belly;
    ctx.fillRect(ox + 7, leftY + 5, 4, 1);
    ctx.fillRect(ox + 13, rightY + 5, 4, 1);

    // --- Fluffy tail (2px wide) ---
    ctx.fillStyle = body;
    switch (dir) {
      case 'left':
        ctx.fillRect(ox + 17, oy + 15, 3, 2);
        ctx.fillRect(ox + 19, oy + 13, 2, 2);
        ctx.fillRect(ox + 20, oy + 12, 2, 2);
        break;
      case 'right':
        ctx.fillRect(ox + 4, oy + 15, 3, 2);
        ctx.fillRect(ox + 3, oy + 13, 2, 2);
        ctx.fillRect(ox + 2, oy + 12, 2, 2);
        break;
      case 'down':
        ctx.fillRect(ox + 17, oy + 16, 2, 2);
        ctx.fillRect(ox + 18, oy + 14, 2, 2);
        break;
      case 'up':
        ctx.fillRect(ox + 11, oy + 11, 2, 2);
        ctx.fillRect(ox + 12, oy + 9, 2, 2);
        ctx.fillRect(ox + 12, oy + 8, 1, 2);
        break;
    }
  });
}

// ===========================================================================
// 3. Digital Assistant (friday) — F.R.I.D.A.Y. holographic look
// ===========================================================================

function generateDigitalAssistant(): SpriteSheet {
  const body = '#4488CC';
  const glow = '#88CCFF';
  const visor = '#00FFFF';
  const darkShoe = '#336699';

  return makeSheet((ctx, ox, oy, dir, frame) => {
    const isWalk = frame > 0;
    const legOffset = isWalk ? Math.sin(frame * 1.8) * 2 : 0;

    // --- Shadow ---
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(ox + 4, oy + 30, 16, 2);

    // --- Glow outline (subtle) ---
    ctx.fillStyle = glow;
    ctx.globalAlpha = 0.3;
    ctx.fillRect(ox + 5, oy + 1, 14, 28);
    ctx.globalAlpha = 1.0;

    // --- Head ---
    ctx.fillStyle = body;
    ctx.fillRect(ox + 7, oy + 2, 10, 10);

    // --- Antenna / sensor on top ---
    ctx.fillStyle = glow;
    ctx.fillRect(ox + 11, oy + 0, 2, 2);
    ctx.fillStyle = visor;
    ctx.fillRect(ox + 11, oy + 0, 2, 1);

    // --- Visor / screen instead of eyes ---
    switch (dir) {
      case 'down':
        // Cyan horizontal visor bar across face
        ctx.fillStyle = visor;
        ctx.fillRect(ox + 8, oy + 5, 8, 2);
        // Visor glow edges
        ctx.fillStyle = glow;
        ctx.fillRect(ox + 7, oy + 5, 1, 2);
        ctx.fillRect(ox + 16, oy + 5, 1, 2);
        // Subtle mouth line
        ctx.fillStyle = darken(body, 20);
        ctx.fillRect(ox + 10, oy + 9, 4, 1);
        break;
      case 'up':
        // Back of head — panel lines
        ctx.fillStyle = darken(body, 15);
        ctx.fillRect(ox + 9, oy + 4, 6, 1);
        ctx.fillRect(ox + 11, oy + 6, 2, 3);
        break;
      case 'left':
        ctx.fillStyle = visor;
        ctx.fillRect(ox + 7, oy + 5, 5, 2);
        ctx.fillStyle = glow;
        ctx.fillRect(ox + 6, oy + 5, 1, 2);
        break;
      case 'right':
        ctx.fillStyle = visor;
        ctx.fillRect(ox + 12, oy + 5, 5, 2);
        ctx.fillStyle = glow;
        ctx.fillRect(ox + 17, oy + 5, 1, 2);
        break;
    }

    // --- Body ---
    ctx.fillStyle = body;
    ctx.fillRect(ox + 6, oy + 12, 12, 10);
    // Body panel line
    ctx.fillStyle = darken(body, 15);
    ctx.fillRect(ox + 11, oy + 13, 2, 8);
    // Body glow edge
    ctx.fillStyle = glow;
    ctx.globalAlpha = 0.4;
    ctx.fillRect(ox + 17, oy + 12, 1, 10);
    ctx.fillRect(ox + 6, oy + 12, 1, 10);
    ctx.globalAlpha = 1.0;
    // Chest light
    ctx.fillStyle = visor;
    ctx.fillRect(ox + 11, oy + 14, 2, 2);

    // --- Arms ---
    ctx.fillStyle = body;
    if (isWalk) {
      const armSwing = Math.sin(frame * 1.8) * 2;
      ctx.fillRect(ox + 3, oy + 14 - Math.round(armSwing), 3, 5);
      ctx.fillRect(ox + 18, oy + 14 + Math.round(armSwing), 3, 5);
    } else {
      ctx.fillRect(ox + 3, oy + 14, 3, 5);
      ctx.fillRect(ox + 18, oy + 14, 3, 5);
    }

    // --- Legs ---
    ctx.fillStyle = body;
    const leftY = oy + 22 + Math.round(legOffset);
    const rightY = oy + 22 - Math.round(legOffset);
    ctx.fillRect(ox + 7, leftY, 4, 6);
    ctx.fillRect(ox + 13, rightY, 4, 6);
    // Shoes (darker blue)
    ctx.fillStyle = darkShoe;
    ctx.fillRect(ox + 6, leftY + 5, 5, 2);
    ctx.fillRect(ox + 13, rightY + 5, 5, 2);

    // --- Holographic shimmer (frame-dependent) ---
    ctx.fillStyle = glow;
    ctx.globalAlpha = 0.15 + (frame % 2) * 0.1;
    ctx.fillRect(ox + 8, oy + 3 + frame, 8, 1);
    ctx.fillRect(ox + 7, oy + 16 + frame, 10, 1);
    ctx.globalAlpha = 1.0;
  });
}

// ===========================================================================
// 4. Glasses Character (sigor) — independent thinker, purple
// ===========================================================================

function generateGlassesCharacter(): SpriteSheet {
  const body = '#8844AA';
  const skin = '#FFCC88';
  const hair = '#553377';
  const glasses = '#FFFFFF';

  return makeSheet((ctx, ox, oy, dir, frame) => {
    const isWalk = frame > 0;
    const legOffset = isWalk ? Math.sin(frame * 1.8) * 3 : 0;

    // --- Shadow ---
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(ox + 4, oy + 30, 16, 2);

    // --- Head (skin tone) ---
    ctx.fillStyle = skin;
    ctx.fillRect(ox + 7, oy + 3, 10, 9);
    // Ear bumps
    ctx.fillRect(ox + 5, oy + 5, 2, 4);
    ctx.fillRect(ox + 17, oy + 5, 2, 4);

    // --- Hair (spiky/messy, dark purple) ---
    ctx.fillStyle = hair;
    switch (dir) {
      case 'down':
        // Spiky top
        ctx.fillRect(ox + 7, oy + 0, 10, 4);
        // Spikes: 2-3px tall above hairline
        ctx.fillRect(ox + 8, oy + 0, 2, 1);
        ctx.fillRect(ox + 11, oy + 0, 1, 1);
        ctx.fillRect(ox + 14, oy + 0, 2, 1);
        // Spike tips even higher
        ctx.fillRect(ox + 9, oy - 1, 1, 1);
        ctx.fillRect(ox + 12, oy - 1, 1, 1);
        ctx.fillRect(ox + 15, oy - 1, 1, 1);
        // Side hair
        ctx.fillRect(ox + 6, oy + 2, 2, 4);
        ctx.fillRect(ox + 16, oy + 2, 2, 4);
        // Highlight
        ctx.fillStyle = lighten(hair, 20);
        ctx.fillRect(ox + 10, oy + 1, 4, 2);
        break;
      case 'up':
        ctx.fillRect(ox + 6, oy + 0, 12, 8);
        ctx.fillRect(ox + 5, oy + 2, 14, 5);
        // Spikes
        ctx.fillRect(ox + 9, oy - 1, 1, 1);
        ctx.fillRect(ox + 12, oy - 1, 1, 1);
        ctx.fillRect(ox + 15, oy - 1, 1, 1);
        ctx.fillStyle = lighten(hair, 15);
        ctx.fillRect(ox + 9, oy + 1, 5, 3);
        break;
      case 'left':
        ctx.fillRect(ox + 7, oy + 0, 10, 4);
        ctx.fillRect(ox + 6, oy + 2, 4, 5);
        ctx.fillRect(ox + 9, oy - 1, 1, 1);
        ctx.fillRect(ox + 12, oy - 1, 1, 1);
        break;
      case 'right':
        ctx.fillRect(ox + 7, oy + 0, 10, 4);
        ctx.fillRect(ox + 14, oy + 2, 4, 5);
        ctx.fillRect(ox + 12, oy - 1, 1, 1);
        ctx.fillRect(ox + 15, oy - 1, 1, 1);
        break;
    }

    // --- Glasses + Eyes ---
    switch (dir) {
      case 'down':
        // Glasses frames (white rectangular)
        ctx.fillStyle = glasses;
        // Left lens frame
        ctx.fillRect(ox + 8, oy + 5, 4, 3);
        // Right lens frame
        ctx.fillRect(ox + 13, oy + 5, 4, 3);
        // Bridge
        ctx.fillRect(ox + 12, oy + 5, 1, 1);
        // Lens interior (skin showing through)
        ctx.fillStyle = skin;
        ctx.fillRect(ox + 9, oy + 6, 2, 1);
        ctx.fillRect(ox + 14, oy + 6, 2, 1);
        // Eyes behind glasses
        ctx.fillStyle = '#333333';
        ctx.fillRect(ox + 9, oy + 6, 1, 1);
        ctx.fillRect(ox + 14, oy + 6, 1, 1);
        // Mouth
        ctx.fillStyle = '#cc8866';
        ctx.fillRect(ox + 10, oy + 9, 4, 1);
        break;
      case 'up':
        break;
      case 'left':
        // Side view glasses
        ctx.fillStyle = glasses;
        ctx.fillRect(ox + 7, oy + 5, 4, 3);
        ctx.fillRect(ox + 5, oy + 5, 2, 1); // arm
        // Lens interior
        ctx.fillStyle = skin;
        ctx.fillRect(ox + 8, oy + 6, 2, 1);
        // Eye
        ctx.fillStyle = '#333333';
        ctx.fillRect(ox + 8, oy + 6, 1, 1);
        break;
      case 'right':
        ctx.fillStyle = glasses;
        ctx.fillRect(ox + 13, oy + 5, 4, 3);
        ctx.fillRect(ox + 17, oy + 5, 2, 1); // arm
        ctx.fillStyle = skin;
        ctx.fillRect(ox + 14, oy + 6, 2, 1);
        ctx.fillStyle = '#333333';
        ctx.fillRect(ox + 15, oy + 6, 1, 1);
        break;
    }

    // --- Body / Shirt (purple) ---
    ctx.fillStyle = body;
    ctx.fillRect(ox + 5, oy + 12, 14, 11);
    // Collar
    ctx.fillStyle = lighten(body, 25);
    ctx.fillRect(ox + 9, oy + 12, 6, 2);
    // Shading
    ctx.fillStyle = darken(body, 20);
    ctx.fillRect(ox + 5, oy + 12, 3, 11);
    // Highlight
    ctx.fillStyle = lighten(body, 10);
    ctx.fillRect(ox + 15, oy + 14, 3, 7);
    // Belt
    ctx.fillStyle = darken(body, 40);
    ctx.fillRect(ox + 5, oy + 21, 14, 2);

    // --- Arms (skin) ---
    ctx.fillStyle = skin;
    if (isWalk) {
      const armSwing = Math.sin(frame * 1.8) * 2;
      ctx.fillRect(ox + 2, oy + 14 - Math.round(armSwing), 3, 4);
      ctx.fillRect(ox + 19, oy + 14 + Math.round(armSwing), 3, 4);
      ctx.fillStyle = body;
      ctx.fillRect(ox + 3, oy + 12, 3, 3);
      ctx.fillRect(ox + 18, oy + 12, 3, 3);
    } else {
      ctx.fillRect(ox + 2, oy + 17, 3, 4);
      ctx.fillRect(ox + 19, oy + 17, 3, 4);
      ctx.fillStyle = body;
      ctx.fillRect(ox + 3, oy + 12, 3, 6);
      ctx.fillRect(ox + 18, oy + 12, 3, 6);
    }

    // --- Legs ---
    ctx.fillStyle = '#3a4a5a';
    const leftLegY = oy + 23 + Math.round(legOffset);
    const rightLegY = oy + 23 - Math.round(legOffset);
    ctx.fillRect(ox + 6, leftLegY, 5, 6);
    ctx.fillRect(ox + 13, rightLegY, 5, 6);
    // Pants highlight
    ctx.fillStyle = '#4a5a6a';
    ctx.fillRect(ox + 7, leftLegY, 2, 5);
    ctx.fillRect(ox + 14, rightLegY, 2, 5);
    // Shoes
    ctx.fillStyle = '#2a2a30';
    ctx.fillRect(ox + 5, leftLegY + 5, 6, 2);
    ctx.fillRect(ox + 13, rightLegY + 5, 6, 2);
    ctx.fillStyle = '#3a3a44';
    ctx.fillRect(ox + 6, leftLegY + 5, 3, 1);
    ctx.fillRect(ox + 14, rightLegY + 5, 3, 1);
  });
}

// ===========================================================================
// 5. Generic Human Character (default fallback)
// ===========================================================================

function generateGenericCharacter(bodyColor: string, headColor?: string, hairColor?: string): SpriteSheet {
  const head = headColor ?? HEAD_COLORS[0];
  const hair = hairColor ?? HAIR_COLORS[0];

  return makeSheet((ctx, ox, oy, dir, frame) => {
    const isWalk = frame > 0;
    const legOffset = isWalk ? Math.sin(frame * 1.8) * 3 : 0;

    // --- Shadow ---
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(ox + 4, oy + 30, 16, 2);

    // --- Head ---
    ctx.fillStyle = head;
    ctx.fillRect(ox + 7, oy + 1, 10, 10);
    ctx.fillRect(ox + 5, oy + 4, 2, 4);
    ctx.fillRect(ox + 17, oy + 4, 2, 4);

    // --- Hair ---
    ctx.fillStyle = hair;
    switch (dir) {
      case 'down':
        ctx.fillRect(ox + 6, oy + 0, 12, 4);
        ctx.fillRect(ox + 5, oy + 1, 2, 5);
        ctx.fillRect(ox + 17, oy + 1, 2, 5);
        ctx.fillStyle = lighten(hair, 20);
        ctx.fillRect(ox + 9, oy + 0, 4, 2);
        break;
      case 'up':
        ctx.fillRect(ox + 6, oy + 0, 12, 8);
        ctx.fillRect(ox + 5, oy + 1, 14, 6);
        ctx.fillStyle = lighten(hair, 15);
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
    switch (dir) {
      case 'down':
        ctx.fillRect(ox + 9, oy + 5, 2, 2);
        ctx.fillRect(ox + 13, oy + 5, 2, 2);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(ox + 9, oy + 5, 1, 1);
        ctx.fillRect(ox + 13, oy + 5, 1, 1);
        ctx.fillStyle = '#cc8866';
        ctx.fillRect(ox + 10, oy + 8, 4, 1);
        break;
      case 'up':
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
    ctx.fillStyle = lighten(bodyColor, 25);
    ctx.fillRect(ox + 9, oy + 11, 6, 2);
    ctx.fillStyle = darken(bodyColor, 20);
    ctx.fillRect(ox + 5, oy + 11, 3, 12);
    ctx.fillStyle = lighten(bodyColor, 10);
    ctx.fillRect(ox + 15, oy + 13, 3, 8);
    ctx.fillStyle = darken(bodyColor, 40);
    ctx.fillRect(ox + 5, oy + 21, 14, 2);

    // --- Arms ---
    ctx.fillStyle = head;
    if (frame < 2 && dir === 'down') {
      const armY = frame === 0 ? oy + 15 : oy + 14;
      ctx.fillRect(ox + 2, armY, 4, 3);
      ctx.fillRect(ox + 18, armY + (frame === 0 ? 1 : 0), 4, 3);
      ctx.fillStyle = bodyColor;
      ctx.fillRect(ox + 3, oy + 12, 3, 4);
      ctx.fillRect(ox + 18, oy + 12, 3, 4);
    } else if (isWalk) {
      const armSwing = Math.sin(frame * 1.8) * 2;
      ctx.fillRect(ox + 2, oy + 14 - Math.round(armSwing), 3, 4);
      ctx.fillRect(ox + 19, oy + 14 + Math.round(armSwing), 3, 4);
      ctx.fillStyle = bodyColor;
      ctx.fillRect(ox + 3, oy + 12, 3, 3);
      ctx.fillRect(ox + 18, oy + 12, 3, 3);
    } else {
      ctx.fillRect(ox + 2, oy + 17, 3, 4);
      ctx.fillRect(ox + 19, oy + 17, 3, 4);
      ctx.fillStyle = bodyColor;
      ctx.fillRect(ox + 3, oy + 12, 3, 6);
      ctx.fillRect(ox + 18, oy + 12, 3, 6);
    }

    // --- Legs ---
    ctx.fillStyle = '#3a4a5a';
    const leftLegY = oy + 23 + Math.round(legOffset);
    const rightLegY = oy + 23 - Math.round(legOffset);
    ctx.fillRect(ox + 6, leftLegY, 5, 6);
    ctx.fillRect(ox + 13, rightLegY, 5, 6);
    ctx.fillStyle = '#4a5a6a';
    ctx.fillRect(ox + 7, leftLegY, 2, 5);
    ctx.fillRect(ox + 14, rightLegY, 2, 5);
    ctx.fillStyle = '#2a2a30';
    ctx.fillRect(ox + 5, leftLegY + 5, 6, 2);
    ctx.fillRect(ox + 13, rightLegY + 5, 6, 2);
    ctx.fillStyle = '#3a3a44';
    ctx.fillRect(ox + 6, leftLegY + 5, 3, 1);
    ctx.fillRect(ox + 14, rightLegY + 5, 3, 1);
  });
}
