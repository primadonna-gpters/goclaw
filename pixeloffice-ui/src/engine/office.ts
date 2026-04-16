// Tile constants
export const FLOOR = 0;
export const WALL = 1;
export const WINDOW = 2;
export const PLANT = 3;
export const WATER_COOLER = 4;
export const BOOKSHELF = 5;
export const RUG = 6;

export const TILE_SIZE = 16;
export const OFFICE_COLS = 40;
export const OFFICE_ROWS = 30;

export interface Seat {
  col: number;
  row: number;
  chairCol: number;
  chairRow: number;
  facing: 'down' | 'up' | 'left' | 'right';
}

// 8 pre-defined desk seats arranged in 2 rows of 4
export const SEATS: Seat[] = [
  // Top row of desks (row 8-9), agents face down
  { col: 6,  row: 8,  chairCol: 6,  chairRow: 9,  facing: 'down' },
  { col: 12, row: 8,  chairCol: 12, chairRow: 9,  facing: 'down' },
  { col: 18, row: 8,  chairCol: 18, chairRow: 9,  facing: 'down' },
  { col: 24, row: 8,  chairCol: 24, chairRow: 9,  facing: 'down' },
  // Bottom row of desks (row 16-17), agents face up
  { col: 6,  row: 17, chairCol: 6,  chairRow: 16, facing: 'up' },
  { col: 12, row: 17, chairCol: 12, chairRow: 16, facing: 'up' },
  { col: 18, row: 17, chairCol: 18, chairRow: 16, facing: 'up' },
  { col: 24, row: 17, chairCol: 24, chairRow: 16, facing: 'up' },
];

export type TileMap = number[][];

export function buildTileMap(): TileMap {
  const map: TileMap = [];

  for (let r = 0; r < OFFICE_ROWS; r++) {
    const row: number[] = [];
    for (let c = 0; c < OFFICE_COLS; c++) {
      if (r < 3) {
        // Top wall
        row.push(WALL);
      } else if (r === 3) {
        // Wall bottom edge with windows
        if (c > 2 && c < OFFICE_COLS - 3 && c % 5 === 0) {
          row.push(WINDOW);
        } else {
          row.push(WALL);
        }
      } else if (r === OFFICE_ROWS - 1 || c === 0 || c === OFFICE_COLS - 1) {
        // Border walls
        row.push(WALL);
      } else {
        // Floor — add decorations
        if (r === 12 && (c >= 10 && c <= 20)) {
          row.push(RUG);
        } else if (r === 5 && c === 2) {
          row.push(PLANT);
        } else if (r === 5 && c === OFFICE_COLS - 3) {
          row.push(PLANT);
        } else if (r === 13 && c === 30) {
          row.push(WATER_COOLER);
        } else if (r === 5 && c === 33) {
          row.push(BOOKSHELF);
        } else if (r === 5 && c === 34) {
          row.push(BOOKSHELF);
        } else {
          row.push(FLOOR);
        }
      }
    }
    map.push(row);
  }

  return map;
}

export function getSeat(index: number): Seat | undefined {
  return SEATS[index];
}

export function getSeatCount(): number {
  return SEATS.length;
}

export function isWalkable(map: TileMap, col: number, row: number): boolean {
  if (row < 0 || row >= OFFICE_ROWS || col < 0 || col >= OFFICE_COLS) return false;
  const tile = map[row][col];
  return tile === FLOOR || tile === RUG;
}
