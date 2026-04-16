import type { TileMap } from './office';
import type { Character } from './characters';
import { TILE_SIZE, OFFICE_COLS, OFFICE_ROWS, WALL, WINDOW, PLANT, WATER_COOLER, BOOKSHELF, RUG } from './office';
import { getSheet } from '../sprites/loader';

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
        const x = c * TILE_SIZE;
        const y = r * TILE_SIZE;

        switch (tile) {
          case WALL:
            ctx.fillStyle = r < 3 ? '#2d2d4e' : '#3a3a5c';
            ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
            // Brick pattern
            if (r < 3) {
              ctx.fillStyle = '#252545';
              if ((r + c) % 2 === 0) {
                ctx.fillRect(x, y + TILE_SIZE - 1, TILE_SIZE, 1);
                ctx.fillRect(x + TILE_SIZE / 2, y, 1, TILE_SIZE);
              }
            }
            break;

          case WINDOW:
            ctx.fillStyle = '#3a3a5c';
            ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
            // Window glass
            ctx.fillStyle = '#6688cc';
            ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            ctx.fillStyle = '#88aaee';
            ctx.fillRect(x + 3, y + 3, 4, 4);
            break;

          case PLANT:
            this.drawFloor(ctx, x, y, c, r);
            // Pot
            ctx.fillStyle = '#8B4513';
            ctx.fillRect(x + 4, y + 10, 8, 6);
            // Leaves
            ctx.fillStyle = '#228B22';
            ctx.fillRect(x + 3, y + 2, 10, 8);
            ctx.fillStyle = '#32CD32';
            ctx.fillRect(x + 5, y + 1, 6, 6);
            break;

          case WATER_COOLER:
            this.drawFloor(ctx, x, y, c, r);
            // Cooler body
            ctx.fillStyle = '#aabbcc';
            ctx.fillRect(x + 4, y + 4, 8, 10);
            // Water bottle
            ctx.fillStyle = '#4488ff';
            ctx.fillRect(x + 5, y + 1, 6, 5);
            break;

          case BOOKSHELF:
            this.drawFloor(ctx, x, y, c, r);
            // Shelf
            ctx.fillStyle = '#654321';
            ctx.fillRect(x + 1, y + 1, 14, 14);
            // Books
            ctx.fillStyle = '#cc3333';
            ctx.fillRect(x + 2, y + 2, 3, 5);
            ctx.fillStyle = '#3366cc';
            ctx.fillRect(x + 6, y + 2, 3, 5);
            ctx.fillStyle = '#33cc66';
            ctx.fillRect(x + 10, y + 2, 3, 5);
            ctx.fillStyle = '#cccc33';
            ctx.fillRect(x + 2, y + 8, 4, 5);
            ctx.fillStyle = '#cc66cc';
            ctx.fillRect(x + 7, y + 8, 5, 5);
            break;

          case RUG:
            ctx.fillStyle = '#4a2c5e';
            ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
            ctx.fillStyle = '#5a3c6e';
            if ((c + r) % 2 === 0) {
              ctx.fillRect(x + 2, y + 2, TILE_SIZE - 4, TILE_SIZE - 4);
            }
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

  private drawFloor(ctx: CanvasRenderingContext2D, x: number, y: number, c: number, r: number): void {
    // Checkerboard floor
    ctx.fillStyle = (c + r) % 2 === 0 ? '#2a2a3e' : '#262638';
    ctx.fillRect(x, y, TILE_SIZE, TILE_SIZE);
  }

  private drawDesk(char: Character): void {
    const ctx = this.ctx;
    const deskCol = char.seat.col;
    const deskRow = char.seat.row;
    const dx = deskCol * TILE_SIZE;
    const dy = deskRow * TILE_SIZE;

    // Desk surface (2 tiles wide, 1 tile tall)
    ctx.fillStyle = '#6b5b3a';
    ctx.fillRect(dx - 8, dy, TILE_SIZE + 16, TILE_SIZE);
    ctx.fillStyle = '#7d6b4a';
    ctx.fillRect(dx - 6, dy + 1, TILE_SIZE + 12, TILE_SIZE - 2);

    // Monitor
    ctx.fillStyle = '#333344';
    ctx.fillRect(dx + 2, dy + 1, 12, 9);
    // Screen
    if (char.state === 'typing' || char.state === 'cron') {
      ctx.fillStyle = char.state === 'cron' ? '#44ff88' : '#4488ff';
    } else if (char.state === 'error') {
      ctx.fillStyle = '#ff4444';
    } else {
      ctx.fillStyle = '#223344';
    }
    ctx.fillRect(dx + 3, dy + 2, 10, 7);
    // Monitor stand
    ctx.fillStyle = '#555566';
    ctx.fillRect(dx + 6, dy + 10, 4, 3);
  }

  drawCharacter(char: Character, index: number): void {
    const ctx = this.ctx;
    const x = Math.round(char.x);
    const y = Math.round(char.y);

    // Try to use sprite sheet
    const sheet = getSheet(char.sprite, index);
    if (sheet) {
      const dirRow = directionToRow(char.direction);
      const frameCol = char.frame % 4;
      const sx = frameCol * 16;
      const sy = dirRow * 24;
      ctx.drawImage(sheet, sx, sy, 16, 24, x, y - 8, 16, 24);
    } else {
      // Fallback: draw simple rectangles
      this.drawCharFallback(ctx, char, x, y);
    }

    // Error overlay — shake effect
    if (char.state === 'error') {
      const shake = Math.sin(char.errorTimer * 0.05) * 2;
      ctx.fillStyle = 'rgba(255, 0, 0, 0.3)';
      ctx.fillRect(x + shake - 1, y - 9, 18, 26);

      // Error icon
      ctx.fillStyle = '#ff4444';
      ctx.font = '8px monospace';
      ctx.fillText('!', x + 6, y - 10);
    }

    // Cron overlay — sparkle
    if (char.state === 'cron') {
      const t = performance.now() * 0.003;
      ctx.fillStyle = '#44ff88';
      ctx.fillRect(x + Math.sin(t) * 6 + 4, y - 12, 2, 2);
      ctx.fillRect(x + Math.cos(t + 1) * 5 + 8, y - 10, 2, 2);
      ctx.fillRect(x + Math.sin(t + 2) * 4 + 6, y - 14, 2, 2);
    }

    // Name tag
    ctx.fillStyle = '#ffffff';
    ctx.font = '7px monospace';
    ctx.textAlign = 'center';
    const displayName = char.name.length > 8 ? char.name.slice(0, 7) + '..' : char.name;
    ctx.fillText(displayName, x + 8, y + 20);
    ctx.textAlign = 'left';

    // Status bubble
    if (char.state !== 'idle' && char.state !== 'walking') {
      const bubbleX = x + 16;
      const bubbleY = y - 14;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(bubbleX, bubbleY, 28, 10);
      ctx.fillStyle = statusColor(char.state);
      ctx.font = '6px monospace';
      ctx.fillText(statusLabel(char.state), bubbleX + 2, bubbleY + 7);
    }
  }

  private drawCharFallback(ctx: CanvasRenderingContext2D, char: Character, x: number, y: number): void {
    // Body
    ctx.fillStyle = '#6688aa';
    ctx.fillRect(x + 3, y + 2, 10, 10);
    // Head
    ctx.fillStyle = '#ffcc88';
    ctx.fillRect(x + 4, y - 6, 8, 8);
    // Eyes
    ctx.fillStyle = '#333333';
    if (char.direction === 'down' || char.direction === 'up') {
      ctx.fillRect(x + 5, y - 4, 2, 2);
      ctx.fillRect(x + 9, y - 4, 2, 2);
    } else {
      const ex = char.direction === 'right' ? x + 9 : x + 5;
      ctx.fillRect(ex, y - 4, 2, 2);
    }
    // Legs
    ctx.fillStyle = '#445566';
    const legOffset = char.state === 'walking' ? Math.sin(char.frame * 1.5) * 2 : 0;
    ctx.fillRect(x + 4, y + 12 + legOffset, 3, 4);
    ctx.fillRect(x + 9, y + 12 - legOffset, 3, 4);

    // Typing arms
    if (char.state === 'typing') {
      ctx.fillStyle = '#ffcc88';
      const armY = char.frame % 2 === 0 ? y + 6 : y + 5;
      ctx.fillRect(x + 1, armY, 3, 2);
      ctx.fillRect(x + 12, armY + (char.frame % 2 === 0 ? 1 : 0), 3, 2);
    }
  }

  hitTest(characters: Character[], canvasX: number, canvasY: number): Character | undefined {
    // Test in reverse z-order (top-most first)
    const sorted = [...characters].sort((a, b) => b.y - a.y);
    for (const char of sorted) {
      const cx = Math.round(char.x);
      const cy = Math.round(char.y);
      if (canvasX >= cx - 2 && canvasX <= cx + 18 && canvasY >= cy - 10 && canvasY <= cy + 24) {
        return char;
      }
    }
    return undefined;
  }
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
    case 'typing': return '#4488ff';
    case 'cron': return '#44ff88';
    case 'error': return '#ff4444';
    default: return '#888888';
  }
}

function statusLabel(state: string): string {
  switch (state) {
    case 'typing': return 'TYPE';
    case 'cron': return 'CRON';
    case 'error': return 'ERR!';
    default: return state.toUpperCase().slice(0, 4);
  }
}
