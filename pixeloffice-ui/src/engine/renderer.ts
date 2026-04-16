import type { TileMap } from './office';
import type { Character } from './characters';
import { getBreathOffset, isStretching, getStretchProgress, isAtCoffeeMachine } from './characters';
import {
  TILE_SIZE, OFFICE_COLS, OFFICE_ROWS,
  WALL, WINDOW, PLANT, WATER_COOLER, BOOKSHELF, RUG,
  WHITEBOARD, CLOCK, COAT_RACK, COFFEE_TABLE, BASEBOARD, LIGHT_RAY,
  COFFEE_MACHINE, SOFA, PRINTER, POTTED_TREE, TRASH_CAN, FILING_CABINET,
} from './office';
import { getSheet } from '../sprites/loader';

const T = TILE_SIZE; // shorthand

// Dust mote particles
interface DustMote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  life: number;
  maxLife: number;
}

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;
  private dustMotes: DustMote[] = [];
  private dustTimer = 0;
  private floorShadows: Array<{ x: number; y: number; w: number; h: number }> = [];
  private ambientGradient: CanvasGradient | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.width = OFFICE_COLS * TILE_SIZE;
    this.height = OFFICE_ROWS * TILE_SIZE;
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;

    // Pre-generate random floor shadows/stains
    this.generateFloorShadows();

    // Pre-create ambient light gradient
    this.ambientGradient = ctx.createRadialGradient(
      this.width / 2, this.height / 2, this.width * 0.15,
      this.width / 2, this.height / 2, this.width * 0.7,
    );
    this.ambientGradient.addColorStop(0, 'rgba(255,240,220,0.04)');
    this.ambientGradient.addColorStop(0.5, 'rgba(0,0,0,0)');
    this.ambientGradient.addColorStop(1, 'rgba(0,0,0,0.06)');
  }

  private generateFloorShadows(): void {
    // Scatter random subtle shadows/stains on the floor
    const rng = mulberry32(42); // seeded random for consistency
    for (let i = 0; i < 12; i++) {
      this.floorShadows.push({
        x: Math.floor(rng() * (OFFICE_COLS - 4) + 2) * T + Math.floor(rng() * T),
        y: Math.floor(rng() * (OFFICE_ROWS - 6) + 4) * T + Math.floor(rng() * T),
        w: 3 + Math.floor(rng() * 5),
        h: 2 + Math.floor(rng() * 3),
      });
    }
  }

  render(tileMap: TileMap, characters: Character[]): void {
    const ctx = this.ctx;
    const now = performance.now();
    ctx.clearRect(0, 0, this.width, this.height);

    // Draw tiles
    for (let r = 0; r < OFFICE_ROWS; r++) {
      for (let c = 0; c < OFFICE_COLS; c++) {
        const tile = tileMap[r][c];
        const x = c * T;
        const y = r * T;

        switch (tile) {
          case WALL:
            this.drawWall(ctx, x, y, r, c);
            break;
          case BASEBOARD:
            this.drawBaseboard(ctx, x, y);
            break;
          case WINDOW:
            this.drawWindow(ctx, x, y, c);
            break;
          case PLANT:
            this.drawFloor(ctx, x, y, c, r);
            this.drawPlant(ctx, x, y);
            break;
          case WATER_COOLER:
            this.drawFloor(ctx, x, y, c, r);
            this.drawWaterCooler(ctx, x, y);
            break;
          case BOOKSHELF:
            this.drawFloor(ctx, x, y, c, r);
            this.drawBookshelf(ctx, x, y);
            break;
          case WHITEBOARD:
            this.drawFloor(ctx, x, y, c, r);
            this.drawWhiteboard(ctx, x, y);
            break;
          case CLOCK:
            this.drawWall(ctx, x, y, r, c);
            this.drawClock(ctx, x, y);
            break;
          case COAT_RACK:
            this.drawFloor(ctx, x, y, c, r);
            this.drawCoatRack(ctx, x, y);
            break;
          case COFFEE_TABLE:
            this.drawFloor(ctx, x, y, c, r);
            this.drawCoffeeTable(ctx, x, y);
            break;
          case RUG:
            this.drawRug(ctx, x, y, c, r);
            break;
          case LIGHT_RAY:
            this.drawFloor(ctx, x, y, c, r);
            this.drawLightRay(ctx, x, y, r);
            break;
          case COFFEE_MACHINE:
            this.drawFloor(ctx, x, y, c, r);
            this.drawCoffeeMachine(ctx, x, y);
            break;
          case SOFA:
            this.drawFloor(ctx, x, y, c, r);
            this.drawSofa(ctx, x, y, c);
            break;
          case PRINTER:
            this.drawFloor(ctx, x, y, c, r);
            this.drawPrinter(ctx, x, y);
            break;
          case POTTED_TREE:
            this.drawFloor(ctx, x, y, c, r);
            this.drawPottedTree(ctx, x, y);
            break;
          case TRASH_CAN:
            this.drawFloor(ctx, x, y, c, r);
            this.drawTrashCan(ctx, x, y);
            break;
          case FILING_CABINET:
            this.drawFloor(ctx, x, y, c, r);
            this.drawFilingCabinet(ctx, x, y);
            break;
          default:
            this.drawFloor(ctx, x, y, c, r);
            break;
        }
      }
    }

    // Draw floor shadows/stains for texture variety
    for (const shadow of this.floorShadows) {
      ctx.fillStyle = 'rgba(60,40,20,0.06)';
      ctx.fillRect(shadow.x, shadow.y, shadow.w, shadow.h);
    }

    // Draw desks for each character's seat
    for (const char of characters) {
      this.drawDesk(char, now);
    }

    // Z-sort characters by Y position and draw
    const sorted = [...characters].sort((a, b) => a.y - b.y);
    for (let i = 0; i < sorted.length; i++) {
      this.drawCharacter(sorted[i], i);
    }

    // Update and draw dust motes
    this.updateDustMotes(now);
    this.drawDustMotes(ctx);

    // Ambient light gradient overlay
    if (this.ambientGradient) {
      ctx.fillStyle = this.ambientGradient;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }

  // --- Dust particle system ---

  private updateDustMotes(now: number): void {
    const dt = 16; // approximate frame time

    // Spawn new motes periodically
    this.dustTimer += dt;
    if (this.dustTimer > 800 && this.dustMotes.length < 20) {
      this.dustTimer = 0;
      this.dustMotes.push({
        x: Math.random() * this.width,
        y: Math.random() * this.height * 0.6 + this.height * 0.1,
        vx: (Math.random() - 0.5) * 3,
        vy: -0.2 - Math.random() * 0.5,
        size: 1 + Math.random(),
        alpha: 0,
        life: 0,
        maxLife: 3000 + Math.random() * 4000,
      });
    }

    // Update existing motes
    for (let i = this.dustMotes.length - 1; i >= 0; i--) {
      const m = this.dustMotes[i];
      m.life += dt;
      m.x += m.vx * 0.3;
      m.y += m.vy * 0.3;
      // Gentle sine drift
      m.x += Math.sin(now * 0.001 + i) * 0.15;

      // Fade in, hold, fade out
      const progress = m.life / m.maxLife;
      if (progress < 0.2) {
        m.alpha = progress / 0.2;
      } else if (progress > 0.7) {
        m.alpha = (1 - progress) / 0.3;
      } else {
        m.alpha = 1;
      }

      if (m.life >= m.maxLife) {
        this.dustMotes.splice(i, 1);
      }
    }
  }

  private drawDustMotes(ctx: CanvasRenderingContext2D): void {
    for (const m of this.dustMotes) {
      ctx.fillStyle = `rgba(255,240,200,${(m.alpha * 0.2).toFixed(3)})`;
      ctx.fillRect(Math.round(m.x), Math.round(m.y), Math.ceil(m.size), Math.ceil(m.size));
    }
  }

  // --- Light ray on floor ---

  private drawLightRay(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
    const depth = r - 2;
    const intensity = Math.max(0.02, 0.12 - depth * 0.02);
    ctx.fillStyle = `rgba(255,250,220,${intensity})`;
    ctx.fillRect(x, y, T, T);
  }

  // --- Tile renderers ---

  private drawFloor(ctx: CanvasRenderingContext2D, x: number, y: number, c: number, r: number): void {
    // Warm wood plank floor
    const plankIndex = c % 4;
    const baseColors = ['#b8926a', '#a8825a', '#b08a62', '#a07a52'];
    ctx.fillStyle = baseColors[plankIndex];
    ctx.fillRect(x, y, T, T);

    // Plank grain lines (subtle horizontal lines)
    const grainColor = plankIndex % 2 === 0 ? '#c49a72' : '#9a7248';
    ctx.fillStyle = grainColor;
    ctx.fillRect(x, y + 5, T, 1);
    ctx.fillRect(x, y + 14, T, 1);

    // Plank seam (vertical dark line between planks)
    ctx.fillStyle = '#8a6a42';
    ctx.fillRect(x + T - 1, y, 1, T);

    // Subtle row variation
    if (r % 2 === 0) {
      ctx.fillStyle = 'rgba(0,0,0,0.03)';
      ctx.fillRect(x, y, T, T);
    }

    // Ambient occlusion near walls (top rows darker)
    if (r === 3) {
      ctx.fillStyle = 'rgba(0,0,0,0.08)';
      ctx.fillRect(x, y, T, 4);
    }
  }

  private drawWall(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, _c: number): void {
    // Light cream upper wall
    ctx.fillStyle = '#e8dcc8';
    ctx.fillRect(x, y, T, T);

    // Subtle wall texture — horizontal lines
    ctx.fillStyle = '#ddd0bc';
    ctx.fillRect(x, y + T - 1, T, 1);

    // Wainscoting detail for bottom wall row
    if (r === 0) {
      // Crown molding at top
      ctx.fillStyle = '#f0e6d4';
      ctx.fillRect(x, y, T, 3);
      ctx.fillStyle = '#d4c4a8';
      ctx.fillRect(x, y + 3, T, 1);
    }

    // Side walls darker
    if (r === OFFICE_ROWS - 1) {
      ctx.fillStyle = '#d4c4a8';
      ctx.fillRect(x, y, T, T);
      ctx.fillStyle = '#c4b498';
      ctx.fillRect(x, y, T, 2);
    }
    // Left/right border walls
    if (_c === 0 || _c === OFFICE_COLS - 1) {
      ctx.fillStyle = '#d4c4a8';
      ctx.fillRect(x, y, T, T);
      ctx.fillStyle = '#c4b498';
      ctx.fillRect(x, y, T, 1);
      if (_c === 0) {
        ctx.fillStyle = '#bca888';
        ctx.fillRect(x + T - 1, y, 1, T);
      } else {
        ctx.fillStyle = '#bca888';
        ctx.fillRect(x, y, 1, T);
      }
    }
  }

  private drawBaseboard(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    // Upper part is wall color
    ctx.fillStyle = '#e8dcc8';
    ctx.fillRect(x, y, T, T);
    // Baseboard strip
    ctx.fillStyle = '#d4c4a8';
    ctx.fillRect(x, y + T - 8, T, 8);
    ctx.fillStyle = '#c4b498';
    ctx.fillRect(x, y + T - 9, T, 1);
    // Shadow below baseboard
    ctx.fillStyle = '#bca888';
    ctx.fillRect(x, y + T - 1, T, 1);
  }

  private drawWindow(ctx: CanvasRenderingContext2D, x: number, y: number, c: number): void {
    // Wall behind window
    ctx.fillStyle = '#e8dcc8';
    ctx.fillRect(x, y, T, T);

    // Window frame (wooden brown)
    ctx.fillStyle = '#8B6914';
    ctx.fillRect(x + 1, y + 2, T - 2, T - 4);

    // Sky gradient inside
    ctx.fillStyle = '#87CEEB';
    ctx.fillRect(x + 3, y + 4, T - 6, T - 8);

    // Lighter sky at top
    ctx.fillStyle = '#a8ddf0';
    ctx.fillRect(x + 3, y + 4, T - 6, 4);

    // Cloud puffs
    if (c % 3 === 0) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 5, y + 6, 6, 3);
      ctx.fillRect(x + 7, y + 5, 4, 2);
    }

    // Window cross-bar
    ctx.fillStyle = '#725812';
    ctx.fillRect(x + T / 2 - 1, y + 4, 2, T - 8);
    ctx.fillRect(x + 3, y + T / 2, T - 6, 2);

    // Curtain on left
    ctx.fillStyle = '#c9544d';
    ctx.fillRect(x + 1, y + 2, 3, T - 4);
    ctx.fillStyle = '#b04440';
    ctx.fillRect(x + 1, y + 2, 1, T - 4);

    // Curtain on right
    ctx.fillStyle = '#c9544d';
    ctx.fillRect(x + T - 4, y + 2, 3, T - 4);
    ctx.fillStyle = '#b04440';
    ctx.fillRect(x + T - 2, y + 2, 1, T - 4);

    // Window sill
    ctx.fillStyle = '#d4c4a8';
    ctx.fillRect(x, y + T - 2, T, 2);

    // Light glow below window sill
    ctx.fillStyle = 'rgba(255,250,220,0.08)';
    ctx.fillRect(x - 2, y + T, T + 4, 4);
  }

  private drawPlant(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    // Terracotta pot
    ctx.fillStyle = '#c4663a';
    ctx.fillRect(x + 6, y + 14, 12, 8);
    ctx.fillStyle = '#d47a4e';
    ctx.fillRect(x + 5, y + 13, 14, 3);
    // Pot rim
    ctx.fillStyle = '#b05530';
    ctx.fillRect(x + 5, y + 13, 14, 1);

    // Soil
    ctx.fillStyle = '#5a3a1a';
    ctx.fillRect(x + 7, y + 13, 10, 2);

    // Main leaves cluster
    ctx.fillStyle = '#228B22';
    ctx.fillRect(x + 4, y + 3, 16, 11);
    // Lighter leaves on top
    ctx.fillStyle = '#32CD32';
    ctx.fillRect(x + 6, y + 1, 12, 8);
    // Individual leaf highlights
    ctx.fillStyle = '#44dd44';
    ctx.fillRect(x + 8, y + 2, 4, 3);
    ctx.fillRect(x + 14, y + 4, 3, 3);
    // Dark leaf shadows
    ctx.fillStyle = '#1a6b1a';
    ctx.fillRect(x + 5, y + 8, 4, 4);
    ctx.fillRect(x + 15, y + 6, 3, 5);
    // Stem visible
    ctx.fillStyle = '#2a7a2a';
    ctx.fillRect(x + 11, y + 10, 2, 4);

    // Shadow on floor
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(x + 4, y + 22, 16, 2);
  }

  private drawWaterCooler(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    // Shadow on floor
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(x + 4, y + 21, 16, 3);

    // Cooler stand/legs
    ctx.fillStyle = '#888899';
    ctx.fillRect(x + 7, y + 18, 3, 4);
    ctx.fillRect(x + 14, y + 18, 3, 4);

    // Cooler body
    ctx.fillStyle = '#ccd0dd';
    ctx.fillRect(x + 5, y + 6, 14, 13);
    // Body highlight
    ctx.fillStyle = '#dde2ee';
    ctx.fillRect(x + 6, y + 7, 5, 11);
    // Body shadow
    ctx.fillStyle = '#aab0bb';
    ctx.fillRect(x + 16, y + 7, 2, 11);

    // Water bottle (blue)
    ctx.fillStyle = '#4488ff';
    ctx.fillRect(x + 7, y + 1, 10, 7);
    ctx.fillStyle = '#66aaff';
    ctx.fillRect(x + 8, y + 2, 4, 4);
    // Bottle cap
    ctx.fillStyle = '#336699';
    ctx.fillRect(x + 9, y + 0, 6, 2);

    // Tap
    ctx.fillStyle = '#666677';
    ctx.fillRect(x + 10, y + 12, 4, 3);
    ctx.fillStyle = '#ff4444';
    ctx.fillRect(x + 10, y + 12, 2, 2);
    ctx.fillStyle = '#4488ff';
    ctx.fillRect(x + 12, y + 12, 2, 2);
  }

  private drawBookshelf(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    // Shadow on floor
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(x + 2, y + 22, 20, 2);

    // Shelf frame (warm wood)
    ctx.fillStyle = '#8B6914';
    ctx.fillRect(x + 1, y + 1, 22, 22);
    // Inner back
    ctx.fillStyle = '#725812';
    ctx.fillRect(x + 3, y + 2, 18, 20);

    // Shelf dividers
    ctx.fillStyle = '#8B6914';
    ctx.fillRect(x + 2, y + 10, 20, 2);
    ctx.fillRect(x + 2, y + 17, 20, 2);

    // Top shelf books
    ctx.fillStyle = '#cc3333';
    ctx.fillRect(x + 4, y + 3, 3, 7);
    ctx.fillStyle = '#dd4444';
    ctx.fillRect(x + 4, y + 3, 3, 1);

    ctx.fillStyle = '#3366cc';
    ctx.fillRect(x + 8, y + 4, 3, 6);

    ctx.fillStyle = '#33cc66';
    ctx.fillRect(x + 12, y + 3, 4, 7);
    ctx.fillStyle = '#44dd77';
    ctx.fillRect(x + 12, y + 3, 4, 1);

    ctx.fillStyle = '#ff9944';
    ctx.fillRect(x + 17, y + 4, 3, 6);

    // Middle shelf books
    ctx.fillStyle = '#cccc33';
    ctx.fillRect(x + 4, y + 12, 4, 5);
    ctx.fillStyle = '#cc66cc';
    ctx.fillRect(x + 9, y + 13, 3, 4);
    ctx.fillStyle = '#6699cc';
    ctx.fillRect(x + 13, y + 12, 3, 5);
    ctx.fillStyle = '#ff6666';
    ctx.fillRect(x + 17, y + 13, 3, 4);

    // Bottom shelf — horizontal stack
    ctx.fillStyle = '#996633';
    ctx.fillRect(x + 4, y + 19, 8, 2);
    ctx.fillStyle = '#669966';
    ctx.fillRect(x + 13, y + 19, 7, 2);
  }

  private drawWhiteboard(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    // Board frame
    ctx.fillStyle = '#888888';
    ctx.fillRect(x + 1, y + 1, 22, 18);
    // White surface
    ctx.fillStyle = '#f5f5f0';
    ctx.fillRect(x + 3, y + 3, 18, 14);

    // Some marker scribbles
    ctx.fillStyle = '#4488ff';
    ctx.fillRect(x + 5, y + 5, 10, 1);
    ctx.fillRect(x + 5, y + 7, 8, 1);
    ctx.fillStyle = '#ff4444';
    ctx.fillRect(x + 5, y + 10, 12, 1);
    ctx.fillStyle = '#44aa44';
    ctx.fillRect(x + 5, y + 13, 6, 1);

    // Colored sticky notes
    ctx.fillStyle = '#ffee44'; // yellow sticky
    ctx.fillRect(x + 14, y + 4, 5, 4);
    ctx.fillStyle = '#ff88aa'; // pink sticky
    ctx.fillRect(x + 15, y + 9, 4, 4);
    ctx.fillStyle = '#88ddff'; // blue sticky
    ctx.fillRect(x + 7, y + 12, 4, 3);
    ctx.fillStyle = '#88ff88'; // green sticky
    ctx.fillRect(x + 12, y + 12, 4, 3);

    // Marker tray
    ctx.fillStyle = '#aaaaaa';
    ctx.fillRect(x + 3, y + 18, 18, 3);
    // Markers
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(x + 5, y + 19, 4, 1);
    ctx.fillStyle = '#0066ff';
    ctx.fillRect(x + 10, y + 19, 4, 1);
    ctx.fillStyle = '#00aa00';
    ctx.fillRect(x + 15, y + 19, 4, 1);

    // Shadow under board
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(x + 2, y + 20, 20, 4);
  }

  private drawClock(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    // Clock face (round-ish in pixel art)
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 6, y + 4, 12, 14);
    ctx.fillRect(x + 4, y + 6, 16, 10);
    // Frame
    ctx.fillStyle = '#8B6914';
    ctx.fillRect(x + 6, y + 3, 12, 1);
    ctx.fillRect(x + 6, y + 18, 12, 1);
    ctx.fillRect(x + 3, y + 6, 1, 10);
    ctx.fillRect(x + 20, y + 6, 1, 10);
    ctx.fillRect(x + 4, y + 5, 2, 1);
    ctx.fillRect(x + 18, y + 5, 2, 1);
    ctx.fillRect(x + 4, y + 16, 2, 1);
    ctx.fillRect(x + 18, y + 16, 2, 1);

    // Hour markers
    ctx.fillStyle = '#333333';
    ctx.fillRect(x + 11, y + 5, 2, 2);  // 12
    ctx.fillRect(x + 11, y + 15, 2, 2); // 6
    ctx.fillRect(x + 5, y + 10, 2, 2);  // 9
    ctx.fillRect(x + 17, y + 10, 2, 2); // 3

    // Hands (animated by real time)
    const now = new Date();
    const hours = now.getHours() % 12;
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const cx = x + 12;
    const cy = y + 11;

    // Hour hand — proper angle calculation
    const hourAngle = ((hours + minutes / 60) / 12) * Math.PI * 2 - Math.PI / 2;
    const hx = Math.round(Math.cos(hourAngle) * 3);
    const hy = Math.round(Math.sin(hourAngle) * 3);
    ctx.fillStyle = '#222222';
    // Draw hour hand as a line of pixels
    this.drawPixelLine(ctx, cx, cy, cx + hx, cy + hy);

    // Minute hand — longer
    const minAngle = (minutes / 60) * Math.PI * 2 - Math.PI / 2;
    const mx = Math.round(Math.cos(minAngle) * 5);
    const my = Math.round(Math.sin(minAngle) * 5);
    ctx.fillStyle = '#444444';
    this.drawPixelLine(ctx, cx, cy, cx + mx, cy + my);

    // Second hand — thin tick
    const secAngle = (seconds / 60) * Math.PI * 2 - Math.PI / 2;
    const sx = Math.round(Math.cos(secAngle) * 4);
    const sy = Math.round(Math.sin(secAngle) * 4);
    ctx.fillStyle = '#cc0000';
    this.drawPixelLine(ctx, cx, cy, cx + sx, cy + sy);

    // Center dot
    ctx.fillStyle = '#cc0000';
    ctx.fillRect(cx, cy, 1, 1);
  }

  private drawPixelLine(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
    // Bresenham-style pixel line
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    let cx = x0;
    let cy = y0;
    for (let i = 0; i < 20; i++) { // max 20 steps safety
      ctx.fillRect(cx, cy, 1, 1);
      if (cx === x1 && cy === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; cx += sx; }
      if (e2 < dx) { err += dx; cy += sy; }
    }
  }

  private drawCoatRack(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    // Shadow on floor
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(x + 4, y + 21, 16, 3);

    // Base
    ctx.fillStyle = '#555555';
    ctx.fillRect(x + 8, y + 20, 8, 3);
    // Pole
    ctx.fillStyle = '#666666';
    ctx.fillRect(x + 11, y + 4, 2, 17);
    // Top cap
    ctx.fillStyle = '#777777';
    ctx.fillRect(x + 10, y + 3, 4, 2);
    // Hooks
    ctx.fillStyle = '#888888';
    ctx.fillRect(x + 6, y + 5, 5, 2);
    ctx.fillRect(x + 13, y + 5, 5, 2);
    // Coat hanging
    ctx.fillStyle = '#4a6a8a';
    ctx.fillRect(x + 4, y + 7, 6, 10);
    ctx.fillStyle = '#3a5a7a';
    ctx.fillRect(x + 4, y + 7, 2, 10);
    // Scarf
    ctx.fillStyle = '#cc4444';
    ctx.fillRect(x + 15, y + 7, 4, 6);
  }

  private drawCoffeeTable(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(x + 2, y + 20, 20, 4);

    // Table legs
    ctx.fillStyle = '#725812';
    ctx.fillRect(x + 3, y + 14, 2, 8);
    ctx.fillRect(x + 19, y + 14, 2, 8);
    // Table top
    ctx.fillStyle = '#8B6914';
    ctx.fillRect(x + 1, y + 12, 22, 3);
    ctx.fillStyle = '#9a7824';
    ctx.fillRect(x + 2, y + 12, 20, 1);

    // Coffee cup
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 8, y + 9, 5, 4);
    ctx.fillStyle = '#dddddd';
    ctx.fillRect(x + 12, y + 10, 2, 2);
    // Steam
    ctx.fillStyle = 'rgba(200,200,200,0.5)';
    ctx.fillRect(x + 9, y + 7, 1, 2);
    ctx.fillRect(x + 11, y + 6, 1, 3);

    // Small plant/napkin
    ctx.fillStyle = '#228B22';
    ctx.fillRect(x + 16, y + 9, 4, 3);
    ctx.fillStyle = '#32CD32';
    ctx.fillRect(x + 17, y + 8, 2, 2);
  }

  private drawCoffeeMachine(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    // Shadow on floor
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(x + 4, y + 21, 16, 3);

    // Machine body (dark grey)
    ctx.fillStyle = '#555566';
    ctx.fillRect(x + 4, y + 4, 16, 18);
    // Front panel (lighter)
    ctx.fillStyle = '#666677';
    ctx.fillRect(x + 5, y + 5, 14, 16);
    // Top
    ctx.fillStyle = '#444455';
    ctx.fillRect(x + 4, y + 3, 16, 2);

    // Hot plate area
    ctx.fillStyle = '#333344';
    ctx.fillRect(x + 6, y + 14, 12, 6);

    // Coffee cup on hot plate
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 9, y + 15, 6, 5);
    ctx.fillStyle = '#dddddd';
    ctx.fillRect(x + 14, y + 16, 2, 3); // handle

    // Coffee inside cup
    ctx.fillStyle = '#4a2a0a';
    ctx.fillRect(x + 10, y + 16, 4, 2);

    // Steam animation
    const now = performance.now();
    const steamPhase = Math.sin(now * 0.004) * 2;
    ctx.fillStyle = 'rgba(200,200,200,0.4)';
    ctx.fillRect(x + 10 + steamPhase, y + 12, 1, 3);
    ctx.fillRect(x + 13 - steamPhase, y + 11, 1, 4);

    // Water reservoir (blue tinted)
    ctx.fillStyle = '#5577aa';
    ctx.fillRect(x + 6, y + 5, 12, 6);
    ctx.fillStyle = '#6688bb';
    ctx.fillRect(x + 7, y + 6, 10, 4);

    // Control panel lights
    ctx.fillStyle = '#00ff44'; // green = ready
    ctx.fillRect(x + 7, y + 12, 2, 2);
    // Red indicator
    const blink = Math.sin(now * 0.003) > 0;
    ctx.fillStyle = blink ? '#ff3333' : '#661111';
    ctx.fillRect(x + 11, y + 12, 2, 2);
  }

  private drawSofa(ctx: CanvasRenderingContext2D, x: number, y: number, c: number): void {
    // The sofa spans 3 tiles (c 21-23). Draw based on position.
    const sofaStartCol = 21;
    const localCol = c - sofaStartCol; // 0, 1, or 2

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(x, y + 21, T, 3);

    // Seat cushion (dark red/brown)
    ctx.fillStyle = '#8B3A3A';
    ctx.fillRect(x, y + 10, T, 10);

    // Cushion highlight
    ctx.fillStyle = '#9B4A4A';
    ctx.fillRect(x + 2, y + 11, T - 4, 4);

    // Cushion seam
    ctx.fillStyle = '#7A2A2A';
    ctx.fillRect(x, y + 16, T, 1);

    // Back rest
    ctx.fillStyle = '#7A2A2A';
    ctx.fillRect(x, y + 2, T, 9);
    ctx.fillStyle = '#8B3A3A';
    ctx.fillRect(x + 2, y + 3, T - 4, 7);

    // Arm rests on ends
    if (localCol === 0) {
      // Left arm
      ctx.fillStyle = '#6A1A1A';
      ctx.fillRect(x, y + 4, 4, 16);
      ctx.fillStyle = '#7A2A2A';
      ctx.fillRect(x, y + 4, 4, 3);
    }
    if (localCol === 2) {
      // Right arm
      ctx.fillStyle = '#6A1A1A';
      ctx.fillRect(x + T - 4, y + 4, 4, 16);
      ctx.fillStyle = '#7A2A2A';
      ctx.fillRect(x + T - 4, y + 4, 4, 3);
    }

    // Legs
    ctx.fillStyle = '#4A1A1A';
    if (localCol === 0) {
      ctx.fillRect(x + 2, y + 20, 3, 3);
    }
    if (localCol === 2) {
      ctx.fillRect(x + T - 5, y + 20, 3, 3);
    }

    // Decorative cushion on middle section
    if (localCol === 1) {
      ctx.fillStyle = '#CC8844';
      ctx.fillRect(x + 6, y + 5, 12, 6);
      ctx.fillStyle = '#DD9955';
      ctx.fillRect(x + 7, y + 6, 10, 4);
    }
  }

  private drawPrinter(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(x + 2, y + 20, 20, 4);

    // Main body (grey box)
    ctx.fillStyle = '#aaaaaa';
    ctx.fillRect(x + 2, y + 8, 20, 14);
    // Top panel
    ctx.fillStyle = '#bbbbbb';
    ctx.fillRect(x + 2, y + 8, 20, 3);
    // Front
    ctx.fillStyle = '#999999';
    ctx.fillRect(x + 3, y + 12, 18, 8);

    // Paper input tray (top)
    ctx.fillStyle = '#cccccc';
    ctx.fillRect(x + 4, y + 4, 16, 5);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 5, y + 5, 14, 3); // paper sheets

    // Paper output tray (front slot)
    ctx.fillStyle = '#333333';
    ctx.fillRect(x + 5, y + 13, 14, 2);
    // Paper coming out
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 6, y + 14, 12, 4);
    // Text on paper
    ctx.fillStyle = '#aaaaaa';
    ctx.fillRect(x + 8, y + 15, 8, 1);
    ctx.fillRect(x + 8, y + 17, 6, 1);

    // Control panel
    ctx.fillStyle = '#666666';
    ctx.fillRect(x + 14, y + 9, 6, 3);
    // Blinking green light
    const blink = Math.sin(performance.now() * 0.002) > 0;
    ctx.fillStyle = blink ? '#00ff44' : '#008822';
    ctx.fillRect(x + 18, y + 10, 2, 1);
  }

  private drawPottedTree(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    // Shadow on floor
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.fillRect(x + 2, y + 20, 20, 4);

    // Large pot
    ctx.fillStyle = '#8B5E3C';
    ctx.fillRect(x + 5, y + 14, 14, 9);
    ctx.fillStyle = '#9B6E4C';
    ctx.fillRect(x + 4, y + 13, 16, 3);
    // Pot rim
    ctx.fillStyle = '#7A4E2C';
    ctx.fillRect(x + 4, y + 13, 16, 1);

    // Soil
    ctx.fillStyle = '#4a2a0a';
    ctx.fillRect(x + 6, y + 13, 12, 2);

    // Trunk
    ctx.fillStyle = '#6B4226';
    ctx.fillRect(x + 10, y + 4, 4, 10);
    ctx.fillStyle = '#5B3216';
    ctx.fillRect(x + 10, y + 4, 1, 10);

    // Canopy (larger than regular plant — extends above tile)
    ctx.fillStyle = '#1a7a1a';
    ctx.fillRect(x + 2, y - 6, 20, 14);
    ctx.fillStyle = '#228B22';
    ctx.fillRect(x + 4, y - 8, 16, 12);
    // Top canopy
    ctx.fillStyle = '#2a9a2a';
    ctx.fillRect(x + 6, y - 10, 12, 8);

    // Leaf highlights
    ctx.fillStyle = '#44cc44';
    ctx.fillRect(x + 6, y - 7, 5, 4);
    ctx.fillRect(x + 14, y - 5, 4, 3);
    ctx.fillRect(x + 8, y - 2, 3, 3);

    // Dark spots
    ctx.fillStyle = '#0a5a0a';
    ctx.fillRect(x + 3, y + 1, 4, 4);
    ctx.fillRect(x + 16, y - 3, 4, 5);
  }

  private drawTrashCan(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(x + 7, y + 20, 10, 3);

    // Bin body (grey)
    ctx.fillStyle = '#888888';
    ctx.fillRect(x + 8, y + 10, 8, 12);
    // Slightly wider rim
    ctx.fillStyle = '#999999';
    ctx.fillRect(x + 7, y + 9, 10, 2);
    // Bin bottom
    ctx.fillStyle = '#777777';
    ctx.fillRect(x + 9, y + 20, 6, 2);

    // Some crumpled paper sticking out
    ctx.fillStyle = '#ddddcc';
    ctx.fillRect(x + 9, y + 8, 4, 3);
    ctx.fillStyle = '#eeeecc';
    ctx.fillRect(x + 13, y + 7, 3, 3);
  }

  private drawFilingCabinet(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(x + 2, y + 22, 20, 2);

    // Cabinet body (dark grey/beige)
    ctx.fillStyle = '#8a8a7a';
    ctx.fillRect(x + 3, y + 2, 18, 20);
    // Side shadow
    ctx.fillStyle = '#7a7a6a';
    ctx.fillRect(x + 19, y + 2, 2, 20);

    // Top edge
    ctx.fillStyle = '#9a9a8a';
    ctx.fillRect(x + 3, y + 1, 18, 2);

    // Drawer 1
    ctx.fillStyle = '#9a9a8a';
    ctx.fillRect(x + 4, y + 3, 16, 5);
    ctx.fillStyle = '#6a6a5a';
    ctx.fillRect(x + 4, y + 8, 16, 1); // divider line
    // Handle
    ctx.fillStyle = '#aaaaaa';
    ctx.fillRect(x + 10, y + 5, 4, 2);

    // Drawer 2
    ctx.fillStyle = '#9a9a8a';
    ctx.fillRect(x + 4, y + 9, 16, 5);
    ctx.fillStyle = '#6a6a5a';
    ctx.fillRect(x + 4, y + 14, 16, 1);
    // Handle
    ctx.fillStyle = '#aaaaaa';
    ctx.fillRect(x + 10, y + 11, 4, 2);

    // Drawer 3
    ctx.fillStyle = '#9a9a8a';
    ctx.fillRect(x + 4, y + 15, 16, 6);
    // Handle
    ctx.fillStyle = '#aaaaaa';
    ctx.fillRect(x + 10, y + 17, 4, 2);
  }

  private drawRug(ctx: CanvasRenderingContext2D, x: number, y: number, c: number, r: number): void {
    // Warm red/terracotta rug
    ctx.fillStyle = '#b05a3a';
    ctx.fillRect(x, y, T, T);

    // Pattern
    ctx.fillStyle = '#c06a4a';
    if ((c + r) % 2 === 0) {
      ctx.fillRect(x + 3, y + 3, T - 6, T - 6);
    }

    // Border detail
    ctx.fillStyle = '#d08a5a';
    ctx.fillRect(x, y, T, 2);
    ctx.fillRect(x, y + T - 2, T, 2);

    // Diamond pattern center
    ctx.fillStyle = '#cc7a4a';
    ctx.fillRect(x + T / 2 - 2, y + T / 2 - 2, 4, 4);
  }

  // --- Desk and Chair ---

  private drawDesk(char: Character, now: number): void {
    const ctx = this.ctx;
    const deskCol = char.seat.col;
    const deskRow = char.seat.row;
    const dx = deskCol * T;
    const dy = deskRow * T;

    // Desk shadow on floor
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(dx - 10, dy + T + 1, T + 22, 3);

    // Desk legs
    ctx.fillStyle = '#5a4810';
    ctx.fillRect(dx - 8, dy + T - 4, 2, 5);
    ctx.fillRect(dx + T + 8, dy + T - 4, 2, 5);

    // Desk front face (darker)
    ctx.fillStyle = '#725812';
    ctx.fillRect(dx - 10, dy + 6, T + 22, T - 6);

    // Desk top surface (lighter)
    ctx.fillStyle = '#8B6914';
    ctx.fillRect(dx - 10, dy + 2, T + 22, 6);
    // Top surface highlight
    ctx.fillStyle = '#9a7824';
    ctx.fillRect(dx - 8, dy + 2, T + 18, 2);

    // Desk edge
    ctx.fillStyle = '#5a4810';
    ctx.fillRect(dx - 10, dy + T, T + 22, 1);

    // Monitor
    this.drawMonitor(ctx, dx, dy, char, now);

    // Chair
    this.drawChair(ctx, char);
  }

  private drawMonitor(ctx: CanvasRenderingContext2D, dx: number, dy: number, char: Character, now: number): void {
    // Monitor frame
    ctx.fillStyle = '#333333';
    ctx.fillRect(dx + 2, dy - 6, 20, 14);

    // Screen bezel
    ctx.fillStyle = '#222222';
    ctx.fillRect(dx + 3, dy - 5, 18, 12);

    // Screen content with glow
    let screenColor = '#1a2233';
    let glowColor = 'rgba(30,50,80,0.3)';

    if (char.state === 'typing' || char.state === 'cron') {
      screenColor = char.state === 'cron' ? '#1a3322' : '#1a2244';
      glowColor = char.state === 'cron' ? 'rgba(68,255,136,0.15)' : 'rgba(68,136,255,0.15)';
      // Active screen
      ctx.fillStyle = screenColor;
      ctx.fillRect(dx + 4, dy - 4, 16, 10);

      // Code/text lines
      const lineColor = char.state === 'cron' ? '#44ff88' : '#4488ff';
      ctx.fillStyle = lineColor;
      ctx.fillRect(dx + 6, dy - 2, 8, 1);
      ctx.fillRect(dx + 6, dy, 12, 1);
      ctx.fillRect(dx + 6, dy + 2, 6, 1);
      ctx.fillRect(dx + 6, dy + 4, 10, 1);

      // Screen flicker effect (subtle brightness pulsing)
      const flicker = Math.sin(now * 0.005 + char.x) * 0.03 + 0.02;
      ctx.fillStyle = `rgba(200,220,255,${flicker.toFixed(3)})`;
      ctx.fillRect(dx + 4, dy - 4, 16, 10);
    } else if (char.state === 'error') {
      screenColor = '#331a1a';
      glowColor = 'rgba(255,68,68,0.15)';
      ctx.fillStyle = screenColor;
      ctx.fillRect(dx + 4, dy - 4, 16, 10);
      // Error display
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(dx + 8, dy - 2, 8, 6);
      ctx.fillStyle = '#331a1a';
      ctx.fillRect(dx + 11, dy - 1, 2, 3);
      ctx.fillRect(dx + 11, dy + 3, 2, 1);
    } else {
      ctx.fillStyle = screenColor;
      ctx.fillRect(dx + 4, dy - 4, 16, 10);
      // Screensaver / dim — subtle flicker for idle screens too
      ctx.fillStyle = '#223344';
      ctx.fillRect(dx + 8, dy - 1, 8, 4);

      // Idle screen flicker (very subtle)
      const idleFlicker = Math.sin(now * 0.002 + char.x * 0.5) * 0.015 + 0.01;
      ctx.fillStyle = `rgba(100,150,200,${idleFlicker.toFixed(3)})`;
      ctx.fillRect(dx + 4, dy - 4, 16, 10);
    }

    // Screen glow on desk
    ctx.fillStyle = glowColor;
    ctx.fillRect(dx + 2, dy + 6, 20, 3);

    // Monitor stand
    ctx.fillStyle = '#444444';
    ctx.fillRect(dx + 9, dy + 8, 6, 3);
    ctx.fillStyle = '#555555';
    ctx.fillRect(dx + 7, dy + 10, 10, 2);

    // Power LED
    ctx.fillStyle = char.state === 'idle' ? '#ff8800' : '#00ff44';
    ctx.fillRect(dx + 11, dy + 6, 2, 1);
  }

  private drawChair(ctx: CanvasRenderingContext2D, char: Character): void {
    const cx = char.seat.chairCol * T;
    const cy = char.seat.chairRow * T;
    const facingDown = char.seat.facing === 'down';

    // Chair shadow
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(cx + 2, cy + T - 2, T - 4, 4);

    // Chair wheels
    ctx.fillStyle = '#333333';
    ctx.fillRect(cx + 4, cy + T - 2, 3, 2);
    ctx.fillRect(cx + T - 7, cy + T - 2, 3, 2);
    ctx.fillRect(cx + T / 2 - 1, cy + T - 2, 3, 2);

    // Chair stem
    ctx.fillStyle = '#444444';
    ctx.fillRect(cx + T / 2 - 1, cy + T - 6, 3, 5);

    // Chair seat
    ctx.fillStyle = '#444444';
    ctx.fillRect(cx + 3, cy + T / 2 - 2, T - 6, 8);
    ctx.fillStyle = '#555555';
    ctx.fillRect(cx + 4, cy + T / 2 - 1, T - 8, 6);

    // Chair back (only if facing away from camera, or if no character is sitting)
    if (facingDown) {
      // Back rest visible behind the character
      ctx.fillStyle = '#444444';
      ctx.fillRect(cx + 3, cy + 1, T - 6, 8);
      ctx.fillStyle = '#555555';
      ctx.fillRect(cx + 5, cy + 2, T - 10, 5);
    } else {
      // Back rest in front (character faces up)
      ctx.fillStyle = '#444444';
      ctx.fillRect(cx + 3, cy + T - 10, T - 6, 8);
      ctx.fillStyle = '#555555';
      ctx.fillRect(cx + 5, cy + T - 9, T - 10, 5);
    }

    // Armrests
    ctx.fillStyle = '#3a3a3a';
    ctx.fillRect(cx + 1, cy + T / 2 - 1, 3, 6);
    ctx.fillRect(cx + T - 4, cy + T / 2 - 1, 3, 6);
  }

  // --- Character ---

  drawCharacter(char: Character, index: number): void {
    const ctx = this.ctx;
    const breathY = getBreathOffset(char);
    const x = Math.round(char.x);
    const y = Math.round(char.y + breathY);

    // Try to use sprite sheet
    const sheet = getSheet(char.sprite, index);
    if (sheet) {
      const dirRow = directionToRow(char.direction);
      const frameCol = char.frame % 4;
      const sx = frameCol * 24;
      const sy = dirRow * 32;

      // Stretch animation: raise arms (slight y shift up)
      if (isStretching(char)) {
        const progress = getStretchProgress(char);
        const stretchLift = Math.sin(progress * Math.PI) * 2;
        ctx.drawImage(sheet, sx, sy, 24, 32, x, y - 8 - stretchLift, 24, 32);
      } else {
        ctx.drawImage(sheet, sx, sy, 24, 32, x, y - 8, 24, 32);
      }
    } else {
      // Fallback: draw simple rectangles
      this.drawCharFallback(ctx, char, x, y);
    }

    // Coffee cup in hand when at the coffee machine
    if (isAtCoffeeMachine(char)) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(x + 20, y + 4, 5, 5);
      ctx.fillStyle = '#dddddd';
      ctx.fillRect(x + 24, y + 5, 2, 3); // handle
      ctx.fillStyle = '#4a2a0a';
      ctx.fillRect(x + 21, y + 5, 3, 2); // coffee
      // Steam
      const steamP = Math.sin(performance.now() * 0.005) * 1.5;
      ctx.fillStyle = 'rgba(200,200,200,0.5)';
      ctx.fillRect(x + 22 + steamP, y + 2, 1, 2);
    }

    // Error overlay -- shake effect
    if (char.state === 'error') {
      const shake = Math.sin(char.errorTimer * 0.05) * 2;
      ctx.fillStyle = 'rgba(255, 0, 0, 0.25)';
      ctx.fillRect(x + shake - 1, y - 9, 26, 34);

      // Error icon (exclamation in circle)
      ctx.fillStyle = '#ff4444';
      ctx.fillRect(x + 8, y - 16, 8, 8);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 8px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('!', x + 12, y - 10);
      ctx.textAlign = 'left';
    }

    // Cron overlay -- sparkle
    if (char.state === 'cron') {
      const t = performance.now() * 0.003;
      ctx.fillStyle = '#44ff88';
      ctx.fillRect(x + Math.sin(t) * 8 + 8, y - 14, 3, 3);
      ctx.fillRect(x + Math.cos(t + 1) * 7 + 10, y - 12, 2, 2);
      ctx.fillRect(x + Math.sin(t + 2) * 6 + 8, y - 18, 3, 3);
    }

    // Name tag -- larger pill with dark background
    const displayName = char.name.length > 10 ? char.name.slice(0, 9) + '..' : char.name;
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    const nameWidth = ctx.measureText(displayName).width;
    const pillW = nameWidth + 10;
    const pillX = x + 12 - pillW / 2;
    const pillY = y + 24;

    // Dark pill background
    ctx.fillStyle = 'rgba(20,15,30,0.75)';
    roundRect(ctx, pillX, pillY, pillW, 14, 4);
    ctx.fill();

    // Name text
    ctx.fillStyle = '#ffffff';
    ctx.fillText(displayName, x + 12, pillY + 11);
    ctx.textAlign = 'left';

    // Status bubble -- more prominent
    if (char.state !== 'idle' && char.state !== 'walking') {
      this.drawStatusBubble(ctx, x, y, char);
    }
  }

  private drawStatusBubble(ctx: CanvasRenderingContext2D, x: number, y: number, char: Character): void {
    const icon = statusIcon(char.state);
    const label = statusLabel(char.state);
    const color = statusColor(char.state);
    const bgColor = statusBgColor(char.state);
    const text = `${icon} ${label}`;

    ctx.font = 'bold 9px monospace';
    const textW = ctx.measureText(text).width;
    const bubbleW = textW + 12;
    const bubbleH = 15;
    const bubbleX = x + 24;
    const bubbleY = y - 20;

    // Colored pill background
    ctx.fillStyle = bgColor;
    roundRect(ctx, bubbleX, bubbleY, bubbleW, bubbleH, 4);
    ctx.fill();

    // Slight border
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    roundRect(ctx, bubbleX, bubbleY, bubbleW, bubbleH, 4);
    ctx.stroke();

    // White text
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, bubbleX + 6, bubbleY + 11);

    // Pointer triangle
    ctx.fillStyle = bgColor;
    ctx.fillRect(bubbleX - 2, bubbleY + 4, 3, 5);
  }

  private drawCharFallback(ctx: CanvasRenderingContext2D, char: Character, x: number, y: number): void {
    // Body
    ctx.fillStyle = '#6688aa';
    ctx.fillRect(x + 4, y + 4, 16, 14);
    // Head
    ctx.fillStyle = '#ffcc88';
    ctx.fillRect(x + 6, y - 6, 12, 10);
    // Hair
    ctx.fillStyle = '#8B6914';
    ctx.fillRect(x + 6, y - 6, 12, 3);
    // Eyes
    ctx.fillStyle = '#333333';
    if (char.direction === 'down' || char.direction === 'up') {
      ctx.fillRect(x + 8, y - 2, 2, 2);
      ctx.fillRect(x + 14, y - 2, 2, 2);
    } else {
      const ex = char.direction === 'right' ? x + 14 : x + 8;
      ctx.fillRect(ex, y - 2, 2, 2);
    }
    // Legs
    ctx.fillStyle = '#445566';
    const legOffset = char.state === 'walking' ? Math.sin(char.frame * 1.5) * 2 : 0;
    ctx.fillRect(x + 6, y + 18 + legOffset, 5, 6);
    ctx.fillRect(x + 13, y + 18 - legOffset, 5, 6);

    // Typing arms
    if (char.state === 'typing') {
      ctx.fillStyle = '#ffcc88';
      const armY = char.frame % 2 === 0 ? y + 8 : y + 7;
      ctx.fillRect(x + 1, armY, 4, 3);
      ctx.fillRect(x + 19, armY + (char.frame % 2 === 0 ? 1 : 0), 4, 3);
    }

    // Stretch effect for fallback
    if (isStretching(char)) {
      ctx.fillStyle = '#ffcc88';
      const progress = getStretchProgress(char);
      const lift = Math.sin(progress * Math.PI) * 3;
      ctx.fillRect(x + 1, y + 4 - lift, 4, 3);
      ctx.fillRect(x + 19, y + 4 - lift, 4, 3);
    }
  }

  hitTest(characters: Character[], canvasX: number, canvasY: number): Character | undefined {
    // Test in reverse z-order (top-most first)
    const sorted = [...characters].sort((a, b) => b.y - a.y);
    for (const char of sorted) {
      const cx = Math.round(char.x);
      const cy = Math.round(char.y);
      if (canvasX >= cx - 2 && canvasX <= cx + 26 && canvasY >= cy - 10 && canvasY <= cy + 34) {
        return char;
      }
    }
    return undefined;
  }
}

// --- Helpers ---

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function directionToRow(dir: string): number {
  switch (dir) {
    case 'down': return 0;
    case 'right': return 1;
    case 'left': return 2;
    case 'up': return 3;
    default: return 0;
  }
}

function statusColor(state: string): string {
  switch (state) {
    case 'typing': return '#6aadff';
    case 'cron': return '#66ffaa';
    case 'error': return '#ff6666';
    default: return '#aaaaaa';
  }
}

function statusBgColor(state: string): string {
  switch (state) {
    case 'typing': return 'rgba(40,80,140,0.85)';
    case 'cron': return 'rgba(30,100,60,0.85)';
    case 'error': return 'rgba(140,30,30,0.85)';
    default: return 'rgba(60,60,60,0.85)';
  }
}

function statusIcon(state: string): string {
  switch (state) {
    case 'typing': return '\u25B6'; // play triangle
    case 'cron': return '\u23F0';   // clock
    case 'error': return '\u26A0';  // warning
    default: return '\u25CF';       // circle
  }
}

function statusLabel(state: string): string {
  switch (state) {
    case 'typing': return 'TYPING';
    case 'cron': return 'CRON';
    case 'error': return 'ERROR';
    default: return state.toUpperCase().slice(0, 5);
  }
}

// Seeded PRNG for deterministic floor shadows
function mulberry32(a: number): () => number {
  return function() {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
