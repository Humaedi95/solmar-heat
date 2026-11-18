// Solmar Heat — tuning and world constants.
// All distances are pixels, all times seconds. The city is a 24 x 18 block
// grid; every block is TILE wide and the roads between them are ROAD wide.
export const TILE = 96;
export const ROAD = 32;
export const COLS = 24;
export const ROWS = 18;
export const WORLD_W = COLS * TILE + (COLS + 1) * ROAD; // 3104
export const WORLD_H = ROWS * TILE + (ROWS + 1) * ROAD; // 2336
export const WATER_Y = WORLD_H - 48; // the sea band along the south edge
export const BEACH_Y0 = 17 * (TILE + ROAD) + ROAD; // sand starts here (2208)

export const VIEW_W = 1280;
export const VIEW_H = 720;

export const WALK_SPEED = 175;
export const RUN_SPEED = 235;
export const CAR_MAX = { sedan: 380, taxi: 365, truck: 300, sport: 520, police: 540 };
export const CAR_ACCEL = 270;
export const CAR_BRAKE = 430;
export const CAR_REVERSE_MAX = 150;
export const CAR_TURN = 2.6; // radians per second at full lock, scaled by speed
export const PLAYER_HP = 100;
export const CAR_HP = 100;
export const WANTED_DECAY_S = 30; // seconds of quiet before one star drops
export const SAVE_KEY = 'solmar-heat-save-v1';
export const DEFAULT_SEED = 20261118;

export const PALETTE = {
  asphalt: '#3a3f46',
  asphaltLine: '#c8c25a',
  sidewalk: '#8d9299',
  grass: '#5d9b4a',
  parkGrass: '#6fae56',
  sand: '#e3cd8f',
  water: '#2e7fa8',
  waterDeep: '#256b8f',
  building: ['#b5674e', '#c98a5a', '#7d8aa0', '#a08a7d', '#8a6f9e', '#5f7d6a', '#b5a05e'],
  roof: ['#8a4a38', '#a06a42', '#5f6b7d', '#7d675c', '#6a5278', '#47604f', '#8f7d45'],
  tree: '#2f6b2a',
  palm: '#3d7d33',
  trunk: '#7a5a38',
  window: '#ffe9a8',
  windowLit: '#fff3c4',
};

export const CAR_COLORS = {
  sedan: ['#c0392b', '#2e6fb0', '#e0e0e0', '#3d3d3d', '#7d3c98'],
  taxi: ['#f1c40f'],
  truck: ['#95a5a6', '#5d6d7e', '#a569bd'],
  sport: ['#e74c3c', '#f39c12', '#1abc9c', '#e84393'],
  police: ['#1a1a2e'],
};

export const PED_SHIRTS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6', '#e67e22', '#1abc9c', '#ecf0f1'];
export const PED_SKINS = ['#f1c27d', '#e0ac69', '#c68642', '#8d5524', '#ffdbac'];
