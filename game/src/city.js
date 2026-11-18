// Solmar Heat — the city of Solmar Bay.
// A 24 x 18 grid of blocks separated by roads, with a beach and the sea along
// the south edge. Generation is seeded, so the same seed always builds the
// same city: same blocks, same buildings, same traffic lights.
import { TILE, ROAD, COLS, ROWS, WORLD_W, WORLD_H, WATER_Y, BEACH_Y0, PALETTE } from './config.js';
import { Rng } from './random.js';

// Centre line of a vertical road (col 0..COLS) or horizontal road (row 0..ROWS).
export function roadCenterX(col) {
  return col * (TILE + ROAD) + ROAD / 2;
}
export function roadCenterY(row) {
  return row * (TILE + ROAD) + ROAD / 2;
}
// Top-left corner of a block (col 0..COLS-1, row 0..ROWS-1).
export function blockX(col) {
  return ROAD + col * (TILE + ROAD);
}
export function blockY(row) {
  return ROAD + row * (TILE + ROAD);
}

export function isRoad(x, y) {
  if (x < 0 || y < 0 || x >= WORLD_W || y >= WORLD_H) return false;
  const mx = x % (TILE + ROAD);
  const my = y % (TILE + ROAD);
  return mx < ROAD || my < ROAD;
}
export function isWater(x, y) {
  return y >= WATER_Y && x >= 0 && x < WORLD_W;
}
export function isBeach(x, y) {
  return y >= BEACH_Y0 && y < WATER_Y && x >= 0 && x < WORLD_W;
}

// The block containing a point, or null when the point is on a road.
export function blockAt(city, x, y) {
  const col = Math.floor((x - ROAD) / (TILE + ROAD));
  const row = Math.floor((y - ROAD) / (TILE + ROAD));
  if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return null;
  const lx = x - blockX(col);
  const ly = y - blockY(row);
  if (lx < 0 || ly < 0 || lx >= TILE || ly >= TILE) return null;
  return city.blocks[row * COLS + col];
}

// The building whose rectangle (grown by pad) contains the point, or null.
export function buildingAt(city, x, y, pad = 0) {
  const col = Math.floor((x - ROAD) / (TILE + ROAD));
  const row = Math.floor((y - ROAD) / (TILE + ROAD));
  for (let r = row - 1; r <= row + 1; r++) {
    for (let c = col - 1; c <= col + 1; c++) {
      if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
      const block = city.blocks[r * COLS + c];
      for (const b of block.buildings) {
        if (x >= b.x - pad && x <= b.x + b.w + pad && y >= b.y - pad && y <= b.y + b.h + pad) return b;
      }
    }
  }
  return null;
}

// Snap a point to the nearest road centre line (used by the traffic AI).
export function nearestRoadPoint(x, y) {
  const col = Math.round((x - ROAD / 2) / (TILE + ROAD));
  const row = Math.round((y - ROAD / 2) / (TILE + ROAD));
  const vx = roadCenterX(Math.max(0, Math.min(COLS, col)));
  const hy = roadCenterY(Math.max(0, Math.min(ROWS, row)));
  if (Math.abs(x - vx) <= Math.abs(y - hy)) return { x: vx, y, vertical: true };
  return { x, y: hy, vertical: false };
}

export function buildCity(seed) {
  const rng = new Rng(seed);
  const blocks = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const x = blockX(col);
      const y = blockY(row);
      let type = 'buildings';
      if (row >= ROWS - 2) {
        type = 'beach';
      } else {
        const r = rng.f();
        if (r < 0.12) type = 'park';
        else if (r < 0.18) type = 'plaza';
      }
      const block = { col, row, x, y, w: TILE, h: TILE, type, buildings: [], trees: [] };
      if (type === 'buildings') {
        // Split the block into 2x2 cells; most cells hold one building.
        const cells = [[0, 0], [1, 0], [0, 1], [1, 1]];
        rng.shuffle(cells);
        const count = rng.int(2, 4);
        for (let i = 0; i < count; i++) {
          const [cx, cy] = cells[i];
          const bw = rng.range(30, 42);
          const bh = rng.range(30, 42);
          // keep the building inside its 48 px cell (a 2 px margin), so it
          // never sticks out of the block into the road
          const bx = x + cx * 48 + rng.range(2, 48 - bw - 2);
          const by = y + cy * 48 + rng.range(2, 48 - bh - 2);
          const ci = Math.floor(rng.f() * PALETTE.building.length);
          block.buildings.push({
            x: bx, y: by, w: bw, h: bh,
            color: PALETTE.building[ci], roof: PALETTE.roof[ci],
            hgt: rng.range(8, 26), lit: rng.chance(0.5),
          });
        }
      } else if (type === 'park') {
        const n = rng.int(6, 11);
        for (let i = 0; i < n; i++) {
          block.trees.push({ x: x + rng.range(8, TILE - 8), y: y + rng.range(8, TILE - 8), r: rng.range(5, 9) });
        }
      } else if (type === 'plaza') {
        const n = rng.int(2, 4);
        for (let i = 0; i < n; i++) {
          block.trees.push({ x: x + rng.range(10, TILE - 10), y: y + rng.range(10, TILE - 10), r: rng.range(5, 8) });
        }
      } else {
        // beach: a few palms in the sand
        const n = rng.int(3, 6);
        for (let i = 0; i < n; i++) {
          block.trees.push({ x: x + rng.range(10, TILE - 10), y: y + rng.range(10, TILE - 10), r: rng.range(6, 9), palm: true });
        }
      }
      blocks.push(block);
    }
  }

  // Traffic lights at every third intersection.
  const lights = [];
  for (let row = 0; row <= ROWS; row++) {
    for (let col = 0; col <= COLS; col++) {
      if (col % 3 === 0 && row % 3 === 0) {
        lights.push({ x: roadCenterX(col), y: roadCenterY(row), ns: rng.chance(0.5), t: rng.range(0, 6) });
      }
    }
  }

  const city = { seed, blocks, lights, solids: [] };
  for (const b of blocks) for (const bd of b.buildings) city.solids.push(bd);

  // Named places the missions and the spawn logic use.
  city.spots = {
    player: { x: roadCenterX(12), y: roadCenterY(9) },
    policeStation: { x: blockX(2) + TILE / 2, y: blockY(2) + TILE / 2 },
    hospital: { x: blockX(21) + TILE / 2, y: blockY(2) + TILE / 2 },
    safehouse: { x: blockX(4) + TILE / 2, y: blockY(14) + TILE / 2 },
    boat: { x: roadCenterX(12), y: WATER_Y - 14 },
    danny: { x: blockX(10) + TILE / 2, y: blockY(8) + TILE / 2 },
    mara: { x: blockX(14) + TILE / 2, y: blockY(6) + TILE / 2 },
    package: { x: blockX(6) + TILE / 2, y: blockY(10) + TILE / 2 },
    bags: [
      { x: blockX(18) + TILE / 2, y: blockY(4) + TILE / 2 },
      { x: blockX(3) + TILE / 2, y: blockY(12) + TILE / 2 },
      { x: blockX(20) + TILE / 2, y: blockY(13) + TILE / 2 },
    ],
  };
  return city;
}
