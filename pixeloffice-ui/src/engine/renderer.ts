import type { TileMap } from './office';
import type { Character } from './characters';
import {
  TILE_SIZE, OFFICE_COLS, OFFICE_ROWS,
  WALL, WINDOW, PLANT, WATER_COOLER, BOOKSHELF, RUG,
  WHITEBOARD, CLOCK, COAT_RACK, COFFEE_TABLE, BASEBOARD,
} from './office';
import { getSheet } from '../sprites/loader';

const T = TILE_SIZE; // shorthand

export class Renderer {
  private ctx: CanvasRenderingContext2D;
  readonly width: number;
  readonly height: number;

  constructor(canvas: HTMLCanvasElement) {
    this.width = OFFICE_COLS * TILE_SIZE;
    this.height = OFFICE_ROWS * TILE_SIZE;
    canvas.width = this.width;
    canvas.height = this.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas 2D context not available');
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;
  }

  render(tileMap: TileMap, characters: Character[]): void {
    const ctx = this.ctx;
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
            this.drawWall(ctx, x, y, 0, c);
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
          default:
            this.drawFloor(ctx, x, y, c, r);
            break;
        }
      }
    }

    // Draw desks for each character's seat
    for (const char of characters) {
      this.drawDesk(char);
    }

    // Z-sort characters by Y position and draw
    const sorted = [...characters].sort((a, b) => a.y - b.y);
    for (let i = 0; i < sorted.length; i++) {
      this.drawCharacter(sorted[i], i);
    }
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

    // Hands (animated by time)
    const now = new Date();
    const hours = now.getHours() % 12;
    const _minutes = now.getMinutes();
    ctx.fillStyle = '#222222';
    // Simple hour hand
    const cx = x + 12;
    const cy = y + 11;
    if (hours >= 9 || hours < 3) {
      ctx.fillRect(cx, cy - 3, 1, 3);
    } else if (hours >= 3 && hours < 6) {
      ctx.fillRect(cx, cy, 3, 1);
    } else {
      ctx.fillRect(cx, cy, 1, 3);
    }
    // Minute hand
    ctx.fillStyle = '#444444';
    if (_minutes < 15) {
      ctx.fillRect(cx, cy - 4, 1, 4);
    } else if (_minutes < 30) {
      ctx.fillRect(cx, cy, 4, 1);
    } else if (_minutes < 45) {
      ctx.fillRect(cx, cy, 1, 4);
    } else {
      ctx.fillRect(cx - 4, cy, 4, 1);
    }

    // Center dot
    ctx.fillStyle = '#cc0000';
    ctx.fillRect(cx, cy, 1, 1);
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

  private drawDesk(char: Character): void {
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
    this.drawMonitor(ctx, dx, dy, char);

    // Chair
    this.drawChair(ctx, char);
  }

  private drawMonitor(ctx: CanvasRenderingContext2D, dx: number, dy: number, char: Character): void {
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
      // Screensaver / dim
      ctx.fillStyle = '#223344';
      ctx.fillRect(dx + 8, dy - 1, 8, 4);
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
    const x = Math.round(char.x);
    const y = Math.round(char.y);

    // Try to use sprite sheet
    const sheet = getSheet(char.sprite, index);
    if (sheet) {
      const dirRow = directionToRow(char.direction);
      const frameCol = char.frame % 4;
      const sx = frameCol * 24;
      const sy = dirRow * 32;
      ctx.drawImage(sheet, sx, sy, 24, 32, x, y - 8, 24, 32);
    } else {
      // Fallback: draw simple rectangles
      this.drawCharFallback(ctx, char, x, y);
    }

    // Error overlay — shake effect
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

    // Cron overlay — sparkle
    if (char.state === 'cron') {
      const t = performance.now() * 0.003;
      ctx.fillStyle = '#44ff88';
      ctx.fillRect(x + Math.sin(t) * 8 + 8, y - 14, 3, 3);
      ctx.fillRect(x + Math.cos(t + 1) * 7 + 10, y - 12, 2, 2);
      ctx.fillRect(x + Math.sin(t + 2) * 6 + 8, y - 18, 3, 3);
    }

    // Name tag — pill-shaped with dark background
    const displayName = char.name.length > 10 ? char.name.slice(0, 9) + '..' : char.name;
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    const nameWidth = ctx.measureText(displayName).width;
    const pillW = nameWidth + 8;
    const pillX = x + 12 - pillW / 2;
    const pillY = y + 24;

    // Dark pill background
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    roundRect(ctx, pillX, pillY, pillW, 13, 3);
    ctx.fill();

    // Name text
    ctx.fillStyle = '#ffffff';
    ctx.fillText(displayName, x + 12, pillY + 10);
    ctx.textAlign = 'left';

    // Status bubble
    if (char.state !== 'idle' && char.state !== 'walking') {
      this.drawStatusBubble(ctx, x, y, char);
    }
  }

  private drawStatusBubble(ctx: CanvasRenderingContext2D, x: number, y: number, char: Character): void {
    const icon = statusIcon(char.state);
    const label = statusLabel(char.state);
    const color = statusColor(char.state);
    const text = `${icon} ${label}`;

    ctx.font = '8px monospace';
    const textW = ctx.measureText(text).width;
    const bubbleW = textW + 10;
    const bubbleX = x + 24;
    const bubbleY = y - 18;

    // Pill background
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    roundRect(ctx, bubbleX, bubbleY, bubbleW, 12, 3);
    ctx.fill();

    // Colored left accent
    ctx.fillStyle = color;
    ctx.fillRect(bubbleX + 1, bubbleY + 2, 2, 8);

    // Text
    ctx.fillStyle = color;
    ctx.fillText(text, bubbleX + 5, bubbleY + 9);

    // Pointer triangle
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(bubbleX - 2, bubbleY + 4, 3, 4);
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
