// Solmar Heat — actors: the player, traffic, pedestrians, police, bullets.
// Every movement runs on a fixed 60 Hz step; spawns and AI coin-flips use the
// game's seeded RNG, so a fixed seed replays the same street life.
import {
  WALK_SPEED, RUN_SPEED, CAR_MAX, CAR_ACCEL, CAR_BRAKE, CAR_REVERSE_MAX,
  CAR_TURN, PLAYER_HP, CAR_HP, WANTED_DECAY_S, WORLD_W, WORLD_H, WATER_Y,
  CAR_COLORS, PED_SHIRTS, PED_SKINS, TILE, ROAD, COLS, ROWS,
} from './config.js';
import {
  buildingAt, isRoad, isWater, nearestRoadPoint, roadCenterX, roadCenterY,
  blockX, blockY,
} from './city.js';

const TAU = Math.PI * 2;

export function makePlayer(x, y) {
  return {
    kind: 'player', x, y, angle: -Math.PI / 2, speed: 0,
    onFoot: true, car: null, health: PLAYER_HP, money: 0, wanted: 0,
    weapon: 'fists', ammo: 0, faceX: 0, faceY: -1,
    punchT: 0, shootT: 0, arrestT: 0, crimeT: -999, quietT: 0,
    busted: false, wasted: false, invulnT: 0,
  };
}

export function makeCar(x, y, angle, type, color) {
  return {
    kind: 'car', x, y, angle, speed: 0, type, color,
    driver: null, hp: CAR_HP, maxSpeed: CAR_MAX[type] || 360,
    ai: { road: 'v', dir: 1, target: 120, stopped: false },
    skid: 0, smokeT: 0, dead: false,
  };
}

export function makePed(x, y, rng) {
  return {
    kind: 'ped', x, y, angle: rng.f() * TAU, speed: 0,
    shirt: rng.pick(PED_SHIRTS), skin: rng.pick(PED_SKINS),
    state: 'walk', stateT: 0, tx: x, ty: y, hp: 30, down: false,
  };
}

export function makeOfficer(x, y) {
  return {
    kind: 'officer', x, y, angle: 0, speed: 0,
    shirt: '#1a1a2e', skin: '#e0ac69', state: 'chase', stateT: 0,
    tx: x, ty: y, hp: 60, down: false, punchT: 0,
  };
}

// --- wanted ----------------------------------------------------------------
export function addWanted(g, n, why) {
  const p = g.player;
  if (p.wanted >= 5) return;
  p.wanted = Math.min(5, p.wanted + n);
  p.crimeT = g.time;
  p.quietT = 0;
  if (why) g.say(why + '  ·  wanted ' + '★'.repeat(p.wanted));
}

function decayWanted(g, dt) {
  const p = g.player;
  if (p.wanted <= 0) return;
  if (g.time - p.crimeT < 8) return;
  let near = false;
  for (const c of g.cars) {
    if (c.driver === 'police' && dist(c.x, c.y, p.x, p.y) < 450) { near = true; break; }
  }
  if (!near) for (const o of g.officers) {
    if (dist(o.x, o.y, p.x, p.y) < 450) { near = true; break; }
  }
  if (near) { p.quietT = 0; return; }
  const boost = g.heatBoost || 1;
  p.quietT += dt * boost;
  if (p.quietT >= WANTED_DECAY_S) {
    p.quietT = 0;
    p.wanted -= 1;
    g.say('Heat is cooling off…  ·  wanted ' + (p.wanted ? '★'.repeat(p.wanted) : 'clear'));
  }
}

// --- helpers ---------------------------------------------------------------
export function dist(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}
function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}
function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
// Move a circle (x, y, radius r) against buildings; returns the new position.
// Pushes 1 px clear of the box edge, so the point never rests exactly on a
// boundary (where the containment test would keep reporting a hit).
function pushOutOfBuildings(city, x, y, r) {
  for (let i = 0; i < 3; i++) {
    const b = buildingAt(city, x, y, r);
    if (!b) return { x, y };
    const left = x - (b.x - r);
    const right = b.x + b.w + r - x;
    const top = y - (b.y - r);
    const bottom = b.y + b.h + r - y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) x = b.x - r - 1;
    else if (m === right) x = b.x + b.w + r + 1;
    else if (m === top) y = b.y - r - 1;
    else y = b.y + b.h + r + 1;
  }
  return { x, y };
}

// --- player ----------------------------------------------------------------
export function updatePlayer(g, dt, input) {
  const p = g.player;
  if (p.busted || p.wasted) return;
  if (p.invulnT > 0) p.invulnT -= dt;
  if (p.punchT > 0) p.punchT -= dt;
  if (p.shootT > 0) p.shootT -= dt;

  if (p.onFoot) {
    let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    let my = (input.down ? 1 : 0) - (input.up ? 1 : 0);
    if (mx || my) {
      const len = Math.hypot(mx, my);
      mx /= len;
      my /= len;
      const sp = input.run ? RUN_SPEED : WALK_SPEED;
      p.faceX = mx;
      p.faceY = my;
      p.angle = Math.atan2(my, mx);
      p.speed = sp;
      let nx = p.x + mx * sp * dt;
      let ny = p.y + my * sp * dt;
      nx = clamp(nx, 16, WORLD_W - 16);
      ny = clamp(ny, 16, WATER_Y - 10);
      const hit = pushOutOfBuildings(g.city, nx, ny, 10);
      p.x = hit.x;
      p.y = hit.y;
    } else {
      p.speed = 0;
    }
    if (input.pressed('KeyE')) tryEnterCar(g);
    if (input.pressed('Space')) attack(g);
  } else if (p.car) {
    driveCar(g, p.car, dt, input);
    if (!p.car) return; // the car was totalled and the player was forced out
    p.x = p.car.x;
    p.y = p.car.y;
    p.angle = p.car.angle;
    p.speed = Math.abs(p.car.speed);
    if (input.pressed('KeyE') && Math.abs(p.car.speed) < 40) exitCar(g);
    if (input.pressed('Space')) g.audio.horn();
  }
  decayWanted(g, dt);
  if (p.health <= 0 && !p.wasted) {
    p.wasted = true;
    g.say('WASTED — the paramedics scraped you off the asphalt.');
  }
}

function driveCar(g, car, dt, input) {
  const fwd = (input.up || g.autoDrive) ? 1 : input.down ? -1 : 0;
  if (fwd > 0) {
    car.speed += CAR_ACCEL * dt;
    if (car.speed > car.maxSpeed) car.speed = car.maxSpeed;
  } else if (fwd < 0) {
    if (car.speed > 5) car.speed -= CAR_BRAKE * dt;
    else {
      car.speed -= CAR_ACCEL * 0.6 * dt;
      if (car.speed < -CAR_REVERSE_MAX) car.speed = -CAR_REVERSE_MAX;
    }
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 160 * dt);
    if (Math.abs(car.speed) < 2) car.speed = 0;
  }
  const steer = (input.left ? -1 : 0) + (input.right ? 1 : 0);
  if (steer && Math.abs(car.speed) > 5) {
    const grip = 1 - Math.min(0.55, Math.abs(car.speed) / car.maxSpeed * 0.55);
    car.angle += steer * CAR_TURN * grip * dt * Math.sign(car.speed);
  }
  const nx = car.x + Math.cos(car.angle) * car.speed * dt;
  const ny = car.y + Math.sin(car.angle) * car.speed * dt;
  // the car's nose, centre and tail must all clear the buildings (pad 8 is
  // about the car's half-width; a bigger pad wedges cars on the 32 px roads)
  const nose = buildingAt(g.city, nx + Math.cos(car.angle) * 20, ny + Math.sin(car.angle) * 20, 8);
  const tail = buildingAt(g.city, nx - Math.cos(car.angle) * 20, ny - Math.sin(car.angle) * 20, 8);
  const hit = nose || tail || buildingAt(g.city, nx, ny, 8);
  if (hit) {
    if (Math.abs(car.speed) > 180) {
      damageCar(g, car, 8, 'crash');
      g.audio.crash();
      burst(g, car.x, car.y, '#888888', 8);
    }
    car.speed *= -0.25;
    const p = pushOutOfBuildings(g.city, car.x, car.y, 10);
    car.x = p.x;
    car.y = p.y;
  } else {
    car.x = clamp(nx, 16, WORLD_W - 16);
    car.y = clamp(ny, 16, WATER_Y - 10);
  }
  // run over pedestrians
  for (const ped of g.peds) {
    if (ped.down || ped.state === 'down') continue;
    if (Math.abs(car.speed) > 60 && dist(car.x, car.y, ped.x, ped.y) < 24) {
      knockPed(g, ped, car.angle);
      addWanted(g, 1, 'Pedestrian down!');
    }
  }
  // bump other cars (the player's car is heavy: it shoves them more than they shove it)
  for (const other of g.cars) {
    if (other === car || other.dead) continue;
    const d = dist(car.x, car.y, other.x, other.y);
    if (d < 34 && d > 0.01) {
      const gap = 34 - d;
      const ux = (car.x - other.x) / d;
      const uy = (car.y - other.y) / d;
      car.x += ux * gap * 0.3;
      car.y += uy * gap * 0.3;
      other.x -= ux * gap * 0.7;
      other.y -= uy * gap * 0.7;
      if (Math.abs(car.speed - other.speed) > 140) {
        // one thump per collision, not one per frame while they overlap
        if (g.time - (car.bumpT || 0) > 0.8) {
          car.bumpT = g.time;
          damageCar(g, car, 6, 'bump');
          damageCar(g, other, 6, 'bump');
          g.audio.crash();
        }
      }
      // inelastic bump: both cars settle toward their shared speed instead
      // of being crushed to a standstill while they stay in contact
      const avg = (car.speed + other.speed) / 2;
      car.speed += (avg - car.speed) * 0.25;
      other.speed += (avg - other.speed) * 0.25;
    }
  }
  if (car.hp < 35 && g.time - car.smokeT > 0.4) {
    car.smokeT = g.time;
    g.particles.push({ x: car.x - Math.cos(car.angle) * 14, y: car.y - Math.sin(car.angle) * 14, vx: 0, vy: -18, life: 0.9, max: 0.9, color: '#555555', size: 5, kind: 'smoke' });
  }
  if (car.hp <= 0 && !car.dead) {
    car.dead = true;
    car.speed = 0;
    burst(g, car.x, car.y, '#ff8800', 18);
    g.audio.crash();
    if (car.driver === 'player') {
      g.say('Your ride is totalled.');
      exitCar(g, true);
    }
  }
}

function tryEnterCar(g) {
  const p = g.player;
  let best = null;
  let bestD = 60;
  for (const car of g.cars) {
    if (car.dead) continue;
    const d = dist(p.x, p.y, car.x, car.y);
    if (d < bestD) { best = car; bestD = d; }
  }
  if (!best) return;
  if (best.driver === 'traffic') {
    const ped = makePed(best.x + 26, best.y, g.rng);
    ped.state = 'flee';
    ped.stateT = 3;
    g.peds.push(ped);
    addWanted(g, 1, 'Car jacked!');
    g.stats.carsStolen++;
  } else if (best.driver === 'police') {
    addWanted(g, 2, 'You stole a cop car!');
  } else if (best.missionCar || !best.wasPlayer) {
    // a parked car that was never yours is still a steal
    addWanted(g, 1, 'Car jacked!');
    g.stats.carsStolen++;
  }
  best.driver = 'player';
  p.car = best;
  p.onFoot = false;
  g.audio.door();
}

function exitCar(g, forced) {
  const p = g.player;
  const car = p.car;
  if (!car) return;
  car.driver = null;
  car.wasPlayer = true;
  p.car = null;
  p.onFoot = true;
  const side = car.angle + Math.PI / 2;
  p.x = car.x + Math.cos(side) * 26;
  p.y = car.y + Math.sin(side) * 26;
  const fixed = pushOutOfBuildings(g.city, p.x, p.y, 10);
  p.x = fixed.x;
  p.y = fixed.y;
  if (!forced) g.audio.door();
}

function attack(g) {
  const p = g.player;
  if (p.punchT > 0 || p.shootT > 0) return;
  if (p.weapon === 'pistol' && p.ammo !== 0) {
    p.shootT = 0.28;
    const bx = p.x + p.faceX * 18;
    const by = p.y + p.faceY * 18;
    g.bullets.push({ x: bx, y: by, vx: p.faceX * 900, vy: p.faceY * 900, life: 0.8, from: 'player' });
    g.audio.shot();
    g.stats.shotsFired++;
    addWanted(g, 1, 'Shots fired!');
    burst(g, bx, by, '#ffd34d', 3);
    return;
  }
  p.punchT = 0.32;
  g.audio.punch();
  const reach = 34;
  const px = p.x + p.faceX * 22;
  const py = p.y + p.faceY * 22;
  for (const ped of g.peds) {
    if (ped.down) continue;
    if (dist(px, py, ped.x, ped.y) < reach) {
      knockPed(g, ped, p.angle);
      addWanted(g, 1, 'Assault!');
      return;
    }
  }
  for (const o of g.officers) {
    if (o.down) continue;
    if (dist(px, py, o.x, o.y) < reach) {
      o.hp -= 15;
      o.x += p.faceX * 14;
      o.y += p.faceY * 14;
      burst(g, o.x, o.y, '#ffffff', 4);
      addWanted(g, 1, 'You hit a cop!');
      if (o.hp <= 0) {
        o.down = true;
        o.stateT = 4;
        g.say('Officer down!');
      }
      return;
    }
  }
  for (const car of g.cars) {
    if (car.dead) continue;
    if (dist(px, py, car.x, car.y) < reach + 8) {
      damageCar(g, car, 4, 'punch');
      g.audio.thud();
      return;
    }
  }
}

export function knockPed(g, ped, angle) {
  ped.down = true;
  ped.state = 'down';
  ped.stateT = 1.6;
  ped.x += Math.cos(angle) * 10;
  ped.y += Math.sin(angle) * 10;
  g.stats.pedsHit++;
  burst(g, ped.x, ped.y, '#ffffff', 6);
}

export function damageCar(g, car, amount, why) {
  if (car.dead) return;
  car.hp -= amount;
  if (car.hp <= 0) {
    car.hp = 0;
    car.dead = true;
    car.speed = 0;
    burst(g, car.x, car.y, '#ff8800', 16);
    g.audio.crash();
    if (car.driver === 'player') {
      g.say('Your ride is totalled.');
      exitCar(g, true);
    } else if (car.driver === 'police') {
      g.say('Cop car wrecked.');
    }
  }
}

export function burst(g, x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = g.rng.f() * TAU;
    const sp = g.rng.range(30, 140);
    g.particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: g.rng.range(0.3, 0.7), max: 0.7, color, size: g.rng.range(2, 4), kind: 'spark',
    });
  }
}

// --- traffic ----------------------------------------------------------------
export function spawnTraffic(g, count) {
  for (let i = 0; i < count; i++) {
    const vertical = g.rng.chance(0.5);
    const col = g.rng.int(0, COLS);
    const row = g.rng.int(0, ROWS);
    const x = vertical ? roadCenterX(col) + (g.rng.chance(0.5) ? 8 : -8) : roadCenterX(g.rng.int(0, COLS));
    const y = vertical ? roadCenterY(g.rng.int(0, ROWS)) : roadCenterY(row) + (g.rng.chance(0.5) ? 8 : -8);
    const angle = vertical ? (g.rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : (g.rng.chance(0.5) ? 0 : Math.PI);
    const kind = g.rng.chance(0.08) ? 'truck' : g.rng.chance(0.12) ? 'taxi' : g.rng.chance(0.1) ? 'sport' : 'sedan';
    const car = makeCar(x, y, angle, kind, g.rng.pick(CAR_COLORS[kind]));
    car.driver = 'traffic';
    car.ai.road = vertical ? 'v' : 'h';
    car.ai.dir = vertical ? (angle === Math.PI / 2 ? 1 : -1) : (angle === 0 ? 1 : -1);
    car.ai.target = g.rng.range(95, 145);
    car.speed = car.ai.target;
    g.cars.push(car);
  }
}

function lightAhead(city, car) {
  // The next traffic light on this car's road, within 70 px ahead.
  let best = null;
  let bestD = 70;
  for (const L of city.lights) {
    if (car.ai.road === 'v' && Math.abs(L.x - car.x) < 20) {
      const d = (L.y - car.y) * car.ai.dir;
      if (d > 0 && d < bestD) { best = L; bestD = d; }
    } else if (car.ai.road === 'h' && Math.abs(L.y - car.y) < 20) {
      const d = (L.x - car.x) * car.ai.dir;
      if (d > 0 && d < bestD) { best = L; bestD = d; }
    }
  }
  return best;
}

export function updateTraffic(g, dt) {
  for (const car of g.cars) {
    if (car.driver !== 'traffic' || car.dead) continue;
    // slow for a red light ahead
    const L = lightAhead(g.city, car);
    let want = car.ai.target;
    if (L) {
      const red = car.ai.road === 'v' ? !L.ns : L.ns;
      if (red) want = 0;
    }
    // slow for the car ahead on the same road
    for (const other of g.cars) {
      if (other === car || other.dead) continue;
      if (car.ai.road === 'v' && Math.abs(other.x - car.x) < 22) {
        const d = (other.y - car.y) * car.ai.dir;
        if (d > 0 && d < 52) want = Math.min(want, Math.max(0, other.speed * 0.9));
      } else if (car.ai.road === 'h' && Math.abs(other.y - car.y) < 22) {
        const d = (other.x - car.x) * car.ai.dir;
        if (d > 0 && d < 52) want = Math.min(want, Math.max(0, other.speed * 0.9));
      }
    }
    if (car.speed < want) car.speed = Math.min(want, car.speed + 120 * dt);
    else if (car.speed > want) car.speed = Math.max(want, car.speed - 260 * dt);
    car.x += Math.cos(car.angle) * car.speed * dt;
    car.y += Math.sin(car.angle) * car.speed * dt;
    // at an intersection, sometimes turn onto the crossing road
    const mx = car.x % (TILE + ROAD);
    const my = car.y % (TILE + ROAD);
    const onCross = car.ai.road === 'v' ? my < ROAD : mx < ROAD;
    if (onCross && g.rng.f() < dt * 0.5) {
      const turn = g.rng.chance(0.5);
      if (turn) {
        if (car.ai.road === 'v') {
          const dir = g.rng.chance(0.5) ? 1 : -1;
          car.ai.road = 'h';
          car.ai.dir = dir;
          car.angle = dir === 1 ? 0 : Math.PI;
          car.y = roadCenterY(Math.round((car.y - ROAD / 2) / (TILE + ROAD))) + (dir === 1 ? 8 : -8);
        } else {
          const dir = g.rng.chance(0.5) ? 1 : -1;
          car.ai.road = 'v';
          car.ai.dir = dir;
          car.angle = dir === 1 ? Math.PI / 2 : -Math.PI / 2;
          car.x = roadCenterX(Math.round((car.x - ROAD / 2) / (TILE + ROAD))) + (dir === 1 ? 8 : -8);
        }
      }
    }
    // wrap around the world edges so traffic never runs out
    if (car.x < -60) car.x = WORLD_W + 50;
    if (car.x > WORLD_W + 60) car.x = -50;
    if (car.y < -60) car.y = WORLD_H + 50;
    if (car.y > WORLD_H + 60) car.y = -50;
  }
}

// --- pedestrians ------------------------------------------------------------
export function spawnPeds(g, count) {
  for (let i = 0; i < count; i++) {
    const col = g.rng.int(0, COLS - 1);
    const row = g.rng.int(0, ROWS - 1);
    const x = blockX(col) + g.rng.range(4, TILE - 4);
    const y = blockY(row) + g.rng.range(4, TILE - 4);
    const ped = makePed(x, y, g.rng);
    ped.tx = x;
    ped.ty = y;
    g.peds.push(ped);
  }
}

export function updatePeds(g, dt) {
  const p = g.player;
  for (const ped of g.peds) {
    if (ped.down) {
      ped.stateT -= dt;
      if (ped.stateT <= 0) {
        ped.down = false;
        ped.state = 'flee';
        ped.stateT = 2.5;
      }
      continue;
    }
    if (ped.state === 'flee') {
      ped.stateT -= dt;
      const d = dist(ped.x, ped.y, p.x, p.y);
      if (d > 0.01) {
        const ux = (ped.x - p.x) / d;
        const uy = (ped.y - p.y) / d;
        ped.angle = Math.atan2(uy, ux);
        ped.x += ux * 150 * dt;
        ped.y += uy * 150 * dt;
      }
      if (ped.stateT <= 0) ped.state = 'walk';
      continue;
    }
    // flee from a speeding car or a violent player
    const threat = (!p.onFoot && Math.abs(p.speed) > 120 && dist(ped.x, ped.y, p.x, p.y) < 110)
      || (p.punchT > 0.1 && dist(ped.x, ped.y, p.x, p.y) < 90);
    if (threat) {
      ped.state = 'flee';
      ped.stateT = 2;
      continue;
    }
    // stroll toward the current target, then pick a new one nearby
    const d = dist(ped.x, ped.y, ped.tx, ped.ty);
    if (d < 6) {
      const col = Math.max(0, Math.min(COLS - 1, Math.floor((ped.x - ROAD) / (TILE + ROAD)) + g.rng.int(-1, 1)));
      const row = Math.max(0, Math.min(ROWS - 1, Math.floor((ped.y - ROAD) / (TILE + ROAD)) + g.rng.int(-1, 1)));
      ped.tx = blockX(col) + g.rng.range(6, TILE - 6);
      ped.ty = blockY(row) + g.rng.range(6, TILE - 6);
    } else {
      const ux = (ped.tx - ped.x) / d;
      const uy = (ped.ty - ped.y) / d;
      ped.angle = Math.atan2(uy, ux);
      const sp = 42;
      const nx = ped.x + ux * sp * dt;
      const ny = ped.y + uy * sp * dt;
      const fixed = pushOutOfBuildings(g.city, nx, ny, 7);
      ped.x = clamp(fixed.x, 8, WORLD_W - 8);
      ped.y = clamp(fixed.y, 8, WATER_Y - 8);
    }
  }
}

// --- police -----------------------------------------------------------------
export function updatePolice(g, dt) {
  const p = g.player;
  const wantCars = p.wanted;
  const wantOfficers = p.wanted >= 3 ? p.wanted - 2 : 0;
  let cars = 0;
  let officers = 0;
  for (const c of g.cars) if (c.driver === 'police' && !c.dead) cars++;
  for (const o of g.officers) if (!o.down) officers++;
  // spawn police cars on roads near (but off-screen from) the player
  while (cars < wantCars) {
    const a = g.rng.f() * TAU;
    const r = g.rng.range(520, 720);
    let x = clamp(p.x + Math.cos(a) * r, 40, WORLD_W - 40);
    let y = clamp(p.y + Math.sin(a) * r, 40, WATER_Y - 40);
    const rp = nearestRoadPoint(x, y);
    x = rp.x;
    y = rp.y;
    const car = makeCar(x, y, 0, 'police', '#1a1a2e');
    car.driver = 'police';
    car.speed = 200;
    // start on the road it spawned on, heading toward the player along it
    car.ai.road = rp.vertical ? 'v' : 'h';
    if (car.ai.road === 'h') {
      car.ai.dir = p.x >= x ? 1 : -1;
      car.angle = car.ai.dir === 1 ? 0 : Math.PI;
      car.y = y + (car.ai.dir === 1 ? 8 : -8);
    } else {
      car.ai.dir = p.y >= y ? 1 : -1;
      car.angle = car.ai.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
      car.x = x + (car.ai.dir === 1 ? 8 : -8);
    }
    g.cars.push(car);
    cars++;
  }
  while (officers < wantOfficers) {
    const a = g.rng.f() * TAU;
    const x = clamp(p.x + Math.cos(a) * 320, 20, WORLD_W - 20);
    const y = clamp(p.y + Math.sin(a) * 320, 20, WATER_Y - 20);
    g.officers.push(makeOfficer(x, y));
    officers++;
  }
  // police cars chase the player along the roads
  for (const car of g.cars) {
    if (car.driver !== 'police' || car.dead) continue;
    const dx = p.x - car.x;
    const dy = p.y - car.y;
    const d = Math.hypot(dx, dy) || 1;
    const target = Math.min(car.maxSpeed, 320 + p.wanted * 50);
    if (car.speed < target) car.speed = Math.min(target, car.speed + 300 * dt);
    else car.speed = Math.max(target, car.speed - 200 * dt);
    // Manhattan pursuit: at each intersection, turn onto the road that closes
    // the bigger gap to the player (never cut across a block)
    const mx = car.x % (TILE + ROAD);
    const my = car.y % (TILE + ROAD);
    const onCross = car.ai.road === 'v' ? my < ROAD : mx < ROAD;
    if (onCross && g.time - (car.ai.turnT || 0) > 0.6) {
      const wantRoad = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      const wantDir = wantRoad === 'h' ? (dx > 0 ? 1 : -1) : (dy > 0 ? 1 : -1);
      if (wantRoad !== car.ai.road || wantDir !== car.ai.dir) {
        car.ai.turnT = g.time;
        if (wantRoad !== car.ai.road) {
          // turn onto the crossing road, snapping onto its centre lane
          if (wantRoad === 'h') {
            car.ai.road = 'h';
            car.ai.dir = wantDir;
            car.angle = wantDir === 1 ? 0 : Math.PI;
            car.y = roadCenterY(Math.round((car.y - ROAD / 2) / (TILE + ROAD))) + (wantDir === 1 ? 8 : -8);
          } else {
            car.ai.road = 'v';
            car.ai.dir = wantDir;
            car.angle = wantDir === 1 ? Math.PI / 2 : -Math.PI / 2;
            car.x = roadCenterX(Math.round((car.x - ROAD / 2) / (TILE + ROAD))) + (wantDir === 1 ? 8 : -8);
          }
        } else {
          // same road, wrong way: U-turn at the intersection
          car.ai.dir = wantDir;
          car.angle += Math.PI;
          if (car.ai.road === 'h') {
            car.y = roadCenterY(Math.round((car.y - ROAD / 2) / (TILE + ROAD))) + (wantDir === 1 ? 8 : -8);
          } else {
            car.x = roadCenterX(Math.round((car.x - ROAD / 2) / (TILE + ROAD))) + (wantDir === 1 ? 8 : -8);
          }
        }
      }
    }
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    if (!buildingAt(g.city, nx, ny, 16)) {
      car.x = clamp(nx, 16, WORLD_W - 16);
      car.y = clamp(ny, 16, WATER_Y - 10);
    } else {
      // shoved off the road somehow: snap back onto the nearest road
      const rp = nearestRoadPoint(car.x, car.y);
      car.x = rp.x;
      car.y = rp.y;
      car.ai.road = rp.vertical ? 'v' : 'h';
      car.ai.dir = car.ai.road === 'h' ? (Math.cos(car.angle) >= 0 ? 1 : -1) : (Math.sin(car.angle) >= 0 ? 1 : -1);
      car.angle = car.ai.road === 'h' ? (car.ai.dir === 1 ? 0 : Math.PI) : (car.ai.dir === 1 ? Math.PI / 2 : -Math.PI / 2);
    }
    // ram the player's car (damage only; the bump above handles the speed)
    if (!p.onFoot && p.car && dist(car.x, car.y, p.car.x, p.car.y) < 36) {
      damageCar(g, p.car, 6 * dt, 'ram');
      if (g.rng.f() < dt * 2) g.audio.crash();
    }
    // drop off an officer when close and the player is on foot
    if (p.onFoot && d < 130 && g.officers.length < 6 && g.rng.f() < dt * 0.25) {
      g.officers.push(makeOfficer(car.x + 20, car.y + 20));
    }
    // give up and despawn when the heat is gone and they are far away
    if (p.wanted === 0 && d > 1100) car.dead = true;
  }
  // officers chase on foot and arrest
  for (const o of g.officers) {
    if (o.down) {
      o.stateT -= dt;
      if (o.stateT <= 0) { o.down = false; o.hp = 60; }
      continue;
    }
    if (o.punchT > 0) o.punchT -= dt;
    const d = dist(o.x, o.y, p.x, p.y);
    if (p.onFoot && !p.busted && !p.wasted) {
      const ux = (p.x - o.x) / (d || 1);
      const uy = (p.y - o.y) / (d || 1);
      o.angle = Math.atan2(uy, ux);
      const sp = 205;
      const nx = o.x + ux * sp * dt;
      const ny = o.y + uy * sp * dt;
      const fixed = pushOutOfBuildings(g.city, nx, ny, 9);
      o.x = clamp(fixed.x, 10, WORLD_W - 10);
      o.y = clamp(fixed.y, 10, WATER_Y - 8);
      if (d < 26) {
        if (o.punchT <= 0) {
          o.punchT = 0.9;
          p.health -= 9;
          g.audio.thud();
          burst(g, p.x, p.y, '#ffffff', 4);
          if (p.health <= 0) p.health = 0;
        }
        p.arrestT += dt;
        if (p.arrestT > 1.6) {
          p.busted = true;
          p.arrestT = 0;
          g.say('BUSTED — the cops hauled you in.');
        }
      } else {
        p.arrestT = Math.max(0, p.arrestT - dt);
      }
    } else if (p.wanted === 0 && d > 1100) {
      o.down = true;
      o.stateT = 999;
    }
  }
  // clean up despawned police
  g.cars = g.cars.filter((c) => !(c.driver === 'police' && c.dead && p.wanted === 0));
  g.officers = g.officers.filter((o) => !(o.down && o.stateT >= 999));
}

// --- bullets & particles -----------------------------------------------------
export function updateBullets(g, dt) {
  for (const b of g.bullets) {
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;
    if (buildingAt(g.city, b.x, b.y, 0)) {
      b.life = 0;
      burst(g, b.x, b.y, '#ffd34d', 3);
      continue;
    }
    for (const car of g.cars) {
      if (car.dead) continue;
      if (dist(b.x, b.y, car.x, car.y) < 22) {
        damageCar(g, car, 12, 'shot');
        b.life = 0;
        burst(g, b.x, b.y, '#ff8800', 4);
        break;
      }
    }
    if (b.life <= 0) continue;
    for (const ped of g.peds) {
      if (ped.down) continue;
      if (dist(b.x, b.y, ped.x, ped.y) < 12) {
        knockPed(g, ped, Math.atan2(b.vy, b.vx));
        addWanted(g, 1, 'Someone got shot!');
        b.life = 0;
        break;
      }
    }
    if (b.life <= 0) continue;
    for (const o of g.officers) {
      if (o.down) continue;
      if (dist(b.x, b.y, o.x, o.y) < 12) {
        o.hp -= 34;
        burst(g, o.x, o.y, '#ffffff', 5);
        if (o.hp <= 0) { o.down = true; o.stateT = 5; g.say('Officer down!'); }
        addWanted(g, 1, 'You shot a cop!');
        b.life = 0;
        break;
      }
    }
  }
  g.bullets = g.bullets.filter((b) => b.life > 0 && b.x > 0 && b.y > 0 && b.x < WORLD_W && b.y < WORLD_H);
}

export function updateParticles(g, dt) {
  for (const pt of g.particles) {
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.96;
    pt.vy *= 0.96;
    pt.life -= dt;
  }
  g.particles = g.particles.filter((pt) => pt.life > 0);
}
