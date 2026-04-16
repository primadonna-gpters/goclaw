// Tile constants
export const FLOOR = 0;
export const WALL = 1;
export const WINDOW = 2;
export const PLANT = 3;
export const WATER_COOLER = 4;
export const BOOKSHELF = 5;
export const RUG = 6;
export const WHITEBOARD = 7;
export const CLOCK = 8;
export const COAT_RACK = 9;
export const COFFEE_TABLE = 10;
export const BASEBOARD = 11;
export const LIGHT_RAY = 12; // floor tile with window light ray
export const COFFEE_MACHINE = 13;
export const SOFA = 14;
export const PRINTER = 15;
export const POTTED_TREE = 16;
export const TRASH_CAN = 17;
export const FILING_CABINET = 18;

export const TILE_SIZE = 24;
export const OFFICE_COLS = 28;
export const OFFICE_ROWS = 20;

export interface Seat {
  col: number;
  row: number;
  chairCol: number;
  chairRow: number;
  facing: 'down' | 'up' | 'left' | 'right';
}

// 8 pre-defined desk seats arranged in 2 rows of 4, spaced further apart
export const SEATS: Seat[] = [
  // Top row of desks (row 5-6), agents face down
  { col: 4,  row: 5,  chairCol: 4,  chairRow: 6,  facing: 'down' },
  { col: 10, row: 5,  chairCol: 10, chairRow: 6,  facing: 'down' },
  { col: 16, row: 5,  chairCol: 16, chairRow: 6,  facing: 'down' },
  { col: 22, row: 5,  chairCol: 22, chairRow: 6,  facing: 'down' },
  // Bottom row of desks (row 12-13), agents face up
  { col: 4,  row: 13, chairCol: 4,  chairRow: 12, facing: 'up' },
  { col: 10, row: 13, chairCol: 10, chairRow: 12, facing: 'up' },
  { col: 16, row: 13, chairCol: 16, chairRow: 12, facing: 'up' },
  { col: 22, row: 13, chairCol: 22, chairRow: 12, facing: 'up' },
];

export type TileMap = number[][];

// Behavior target positions (exported for characters.ts)
export const COFFEE_MACHINE_POS = { col: 7, row: 16 };
export const WINDOW_ROWS = [1, 2]; // wall rows where windows are

// Window column ranges for light ray computation
const WINDOW_RANGES = [
  [3, 5], [9, 11], [16, 18], [22, 24],
];

function isLightRayTile(r: number, c: number): boolean {
  // Light rays: diagonal stripes on the floor below windows (rows 3-7)
  // Each window casts light 1-2 tiles to the right and down
  if (r < 3 || r > 7) return false;
  for (const [wStart, wEnd] of WINDOW_RANGES) {
    // Light ray extends from window position, shifted right as it goes down
    const depth = r - 2; // how far from baseboard
    const shiftedStart = wStart + Math.floor(depth * 0.5);
    const shiftedEnd = wEnd + Math.floor(depth * 0.5) + 1;
    if (c >= shiftedStart && c <= shiftedEnd) {
      // Only alternating diagonal stripes for a beam pattern
      if ((c + r) % 2 === 0) return true;
    }
  }
  return false;
}

export function buildTileMap(): TileMap {
  const map: TileMap = [];

  for (let r = 0; r < OFFICE_ROWS; r++) {
    const row: number[] = [];
    for (let c = 0; c < OFFICE_COLS; c++) {
      if (r === 0) {
        // Top wall row 1 — clock in the middle
        if (c === 14) {
          row.push(CLOCK);
        } else {
          row.push(WALL);
        }
      } else if (r === 1) {
        // Top wall row 2 — windows (each 3 tiles wide)
        if ((c >= 3 && c <= 5) || (c >= 9 && c <= 11) || (c >= 16 && c <= 18) || (c >= 22 && c <= 24)) {
          row.push(WINDOW);
        } else if (c === 20) {
          // Second clock on the wall
          row.push(CLOCK);
        } else {
          row.push(WALL);
        }
      } else if (r === 2) {
        // Baseboard strip
        row.push(BASEBOARD);
      } else if (r === OFFICE_ROWS - 1 || c === 0 || c === OFFICE_COLS - 1) {
        // Border walls
        row.push(WALL);
      } else {
        // Floor area — add decorations
        if (r === 9 && c >= 8 && c <= 18) {
          row.push(RUG);
        } else if (r === 3 && c === 2) {
          row.push(PLANT);
        } else if (r === 3 && c === OFFICE_COLS - 3) {
          row.push(POTTED_TREE); // taller tree instead of regular plant
        } else if (r === 15 && c === 2) {
          row.push(PLANT);
        } else if (r === 15 && c === OFFICE_COLS - 3) {
          row.push(PLANT);
        } else if (r === 10 && c === 25) {
          row.push(WATER_COOLER);
        } else if (r === 3 && (c === 13 || c === 14)) {
          row.push(BOOKSHELF);
        } else if (r === 3 && (c >= 7 && c <= 9)) {
          row.push(WHITEBOARD);
        } else if (r === 17 && c === 2) {
          row.push(COAT_RACK);
        } else if (r === 16 && (c >= 11 && c <= 13)) {
          row.push(COFFEE_TABLE);
        // Coffee machine
        } else if (r === COFFEE_MACHINE_POS.row && c === COFFEE_MACHINE_POS.col) {
          row.push(COFFEE_MACHINE);
        // Sofa area (bottom-right, 3 tiles wide)
        } else if (r === 17 && c >= 21 && c <= 23) {
          row.push(SOFA);
        // Printer near the door area
        } else if (r === 18 && c === 14) {
          row.push(PRINTER);
        // Potted tree (left side, taller)
        } else if (r === 10 && c === 2) {
          row.push(POTTED_TREE);
        // Trash cans near each desk row
        } else if (r === 8 && c === 8) {
          row.push(TRASH_CAN);
        } else if (r === 8 && c === 20) {
          row.push(TRASH_CAN);
        } else if (r === 14 && c === 8) {
          row.push(TRASH_CAN);
        } else if (r === 14 && c === 20) {
          row.push(TRASH_CAN);
        // Filing cabinets near the wall
        } else if (r === 3 && (c === 20 || c === 21)) {
          row.push(FILING_CABINET);
        } else if (isLightRayTile(r, c)) {
          row.push(LIGHT_RAY);
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
  return tile === FLOOR || tile === RUG || tile === LIGHT_RAY;
}
