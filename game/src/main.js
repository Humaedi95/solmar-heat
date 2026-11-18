// Solmar Heat — bootstrap, the game loop, states, screenshot scenes and the HUD.
// The simulation runs on a fixed 60 Hz step with a seeded RNG, so a fixed seed
// replays the same city, traffic and pedestrians.
import { VIEW_W, VIEW_H, WORLD_W, WORLD_H, WATER_Y, DEFAULT_SEED, SAVE_KEY, CAR_COLORS } from './config.js';
import { Rng } from './random.js';
import { buildCity, roadCenterX, roadCenterY, nearestRoadPoint } from './city.js';
import {
  makePlayer, makeCar, makePed, spawnTraffic, spawnPeds,
  updatePlayer, updateTraffic, updatePeds, updatePolice, updateBullets,
  updateParticles,
} from './actors.js';
import { MISSIONS, startMission, updateMissions, missionTarget, failMission } from './missions.js';
import { render, drawMinimap } from './render.js';
import { AudioSys } from './audio.js';
import { Input } from './input.js';
import { saveGame, loadGame, clearSave } from './save.js';

const STEP = 1 / 60;
const TAU = Math.PI * 2;

const params = new URLSearchParams(location.search);
const seed = Number(params.get('seed') || DEFAULT_SEED) || DEFAULT_SEED;
const shot = params.get('shot') || '';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const minimap = document.getElementById('minimap');
const mctx = minimap.getContext('2d');

const city = buildCity(seed);
const rng = new Rng(seed ^ 0x9e3779b9);
const player = makePlayer(city.spots.player.x, city.spots.player.y);

const g = {
  seed, rng, city, time: 0, clockMin: 540,
  player, cars: [], peds: [], officers: [], bullets: [], particles: [],
  mission: { index: 0, step: 0, active: false, failed: false, collected: 0, car: null, passenger: false },
  stats: { carsStolen: 0, pedsHit: 0, shotsFired: 0, missionsDone: 0 },
  camera: { x: player.x, y: player.y },
  shake: 0, heatBoost: 1, storyDone: false, autoDrive: false,
  state: 'title', // title | playing | busted | wasted | paused
  messages: [], nextMissionAt: 0, saveT: 0, popT: 0,
  showMinimap: true, audio: new AudioSys(), input: new Input(),
  say(text) {
    g.messages.push({ text, t: g.time });
    if (g.messages.length > 4) g.messages.shift();
  },
  saveGame() { saveGame(g); },
};
g.input.attach(canvas);
window.__solmar = g;

window.addEventListener('error', (e) => {
  window.__solmarError = String(e.message || e.error);
  const el = document.getElementById('err');
  if (el) {
    el.textContent = 'Error: ' + (e.message || e.error);
    el.style.display = 'block';
  }
});

// --- population ---------------------------------------------------------------
function placeTrafficNear(x, y, n, minR, maxR) {
  for (let i = 0; i < n; i++) {
    const a = rng.f() * TAU;
    const r = rng.range(minR, maxR);
    let px = x + Math.cos(a) * r;
    let py = y + Math.sin(a) * r;
    px = Math.max(40, Math.min(WORLD_W - 40, px));
    py = Math.max(40, Math.min(WATER_Y - 40, py));
    const vertical = rng.chance(0.5);
    const kind = rng.chance(0.08) ? 'truck' : rng.chance(0.12) ? 'taxi' : rng.chance(0.1) ? 'sport' : 'sedan';
    const angle = vertical ? (rng.chance(0.5) ? Math.PI / 2 : -Math.PI / 2) : (rng.chance(0.5) ? 0 : Math.PI);
    const car = makeCar(px, py, angle, kind, rng.pick(CAR_COLORS[kind]));
    car.driver = 'traffic';
    car.ai.road = vertical ? 'v' : 'h';
    car.ai.dir = vertical ? (angle === Math.PI / 2 ? 1 : -1) : (angle === 0 ? 1 : -1);
    car.ai.target = rng.range(95, 145);
    car.speed = car.ai.target;
    g.cars.push(car);
  }
}

function placePedsNear(x, y, n) {
  for (let i = 0; i < n; i++) {
    const px = x + rng.range(-320, 320);
    const py = y + rng.range(-220, 220);
    if (px < 20 || py < 20 || px > WORLD_W - 20 || py > WATER_Y - 20) continue;
    const ped = makePed(px, py, rng);
    ped.tx = px + rng.range(-60, 60);
    ped.ty = py + rng.range(-60, 60);
    g.peds.push(ped);
  }
}

function maintainPopulation(dt) {
  g.popT -= dt;
  if (g.popT > 0) return;
  g.popT = 1;
  const p = g.player;
  g.cars = g.cars.filter((c) => c.missionCar || c.driver === 'police' || c.driver === 'player'
    || Math.hypot(c.x - p.x, c.y - p.y) < 1300);
  g.peds = g.peds.filter((pd) => Math.hypot(pd.x - p.x, pd.y - p.y) < 1300);
  let traffic = 0;
  for (const c of g.cars) if (c.driver === 'traffic') traffic++;
  if (traffic < 14) spawnTraffic(g, 2);
  if (g.peds.length < 24) spawnPeds(g, 3);
}

// --- states -------------------------------------------------------------------
function applySave(data) {
  g.player.money = data.money || 0;
  g.player.x = data.px || city.spots.player.x;
  g.player.y = data.py || city.spots.player.y;
  g.player.wanted = data.wanted || 0;
  g.player.weapon = data.weapon || 'fists';
  if (g.player.weapon === 'pistol') g.player.ammo = Infinity;
  g.clockMin = data.clockMin || 540;
  g.stats.missionsDone = data.missionsDone || 0;
  g.storyDone = !!data.storyDone;
  g.audio.muted = !!data.muted;
  g.mission.index = data.missionIndex || 0;
  g.camera.x = g.player.x;
  g.camera.y = g.player.y;
}

function startGame(useSave) {
  g.audio.ensure();
  const data = useSave ? loadGame() : null;
  if (data) {
    applySave(data);
    g.say('Welcome back to Solmar Bay.');
    if (!g.storyDone && g.mission.index < MISSIONS.length) startMission(g, g.mission.index);
  } else {
    clearSave();
    g.player.money = 0;
    g.player.x = city.spots.player.x;
    g.player.y = city.spots.player.y;
    g.player.wanted = 0;
    g.player.weapon = 'fists';
    g.player.health = 100;
    g.clockMin = 540;
    g.stats.missionsDone = 0;
    g.storyDone = false;
    g.camera.x = g.player.x;
    g.camera.y = g.player.y;
    startMission(g, 0);
  }
  g.state = 'playing';
  document.getElementById('title').style.display = 'none';
}

function respawn() {
  const p = g.player;
  const wasBusted = p.busted;
  p.money = Math.floor(p.money * 0.8);
  p.health = 100;
  p.wanted = 0;
  p.arrestT = 0;
  p.busted = false;
  p.wasted = false;
  if (p.car) {
    p.car.driver = null;
    p.car = null;
  }
  p.onFoot = true;
  const spot = wasBusted ? city.spots.policeStation : city.spots.hospital;
  p.x = spot.x;
  p.y = spot.y;
  g.camera.x = p.x;
  g.camera.y = p.y;
  if (g.mission.active) failMission(g, wasBusted ? 'busted by the cops' : 'wasted');
  document.getElementById('busted').style.display = 'none';
  document.getElementById('wasted').style.display = 'none';
  g.state = 'playing';
  g.say(wasBusted ? 'Out on bail. The city is still yours.' : 'Patched up. Back to work.');
}

function updateLights(dt) {
  for (const L of g.city.lights) {
    L.t += dt;
    if (L.t > 6) {
      L.t = 0;
      L.ns = !L.ns;
    }
  }
}

function updateWorld(dt) {
  g.time += dt;
  updateLights(dt);
  updateTraffic(g, dt);
  updatePeds(g, dt);
  updateParticles(g, dt);
  maintainPopulation(dt);
}

function updatePlaying(dt) {
  updateWorld(dt);
  g.clockMin += dt * 0.5;
  if (g.clockMin >= 1440) g.clockMin = 0;
  updatePlayer(g, dt, g.input);
  updatePolice(g, dt);
  updateBullets(g, dt);
  updateMissions(g, dt);
  if (!g.mission.active && g.mission.index < MISSIONS.length && g.time >= g.nextMissionAt) {
    startMission(g, g.mission.index);
  }
  g.saveT += dt;
  if (g.saveT > 30) {
    g.saveT = 0;
    g.saveGame();
  }
  // audio follows the action
  const p = g.player;
  g.audio.setEngine(p.onFoot ? 0 : Math.abs(p.car ? p.car.speed : 0) / 520, !p.onFoot);
  g.audio.setSiren(p.wanted > 0);
  if (p.busted) {
    g.state = 'busted';
    document.getElementById('busted').style.display = 'flex';
    g.audio.setEngine(0, false);
    g.audio.setSiren(false);
  } else if (p.wasted) {
    g.state = 'wasted';
    document.getElementById('wasted').style.display = 'flex';
    g.audio.setEngine(0, false);
    g.audio.setSiren(false);
  }
}

// --- screenshot scenes ---------------------------------------------------------
function setupShot(mode) {
  const p = g.player;
  if (mode === 'start') {
    g.camera.x = roadCenterX(12);
    g.camera.y = roadCenterY(9);
    placeTrafficNear(g.camera.x, g.camera.y, 10, 120, 500);
    placePedsNear(g.camera.x, g.camera.y, 16);
    return;
  }
  g.state = 'playing';
  document.getElementById('title').style.display = 'none';
  if (mode === 'play') {
    p.x = roadCenterX(12);
    p.y = roadCenterY(9);
    g.camera.x = p.x;
    g.camera.y = p.y;
    startMission(g, 0);
    placeTrafficNear(p.x, p.y, 9, 120, 480);
    placePedsNear(p.x, p.y, 14);
  } else if (mode === 'drive') {
    startMission(g, 0);
    g.mission.step = 2;
    g.autoDrive = true;
    const car = g.mission.car;
    car.x = roadCenterX(6);
    car.y = roadCenterY(9);
    car.angle = 0;
    car.speed = 260;
    car.driver = 'player';
    p.car = car;
    p.onFoot = false;
    p.x = car.x;
    p.y = car.y;
    g.camera.x = p.x;
    g.camera.y = p.y;
    placeTrafficNear(p.x, p.y, 8, 200, 600);
    placePedsNear(p.x, p.y, 10);
  } else if (mode === 'chase') {
    startMission(g, 2);
    g.autoDrive = true;
    // a sedan, not a sports car: the police are faster than it, so the chase stays close
    const car = makeCar(roadCenterX(12), roadCenterY(9), 0, 'sedan', '#2e6fb0');
    car.driver = 'player';
    car.speed = 300;
    g.cars.push(car);
    p.car = car;
    p.onFoot = false;
    p.x = car.x;
    p.y = car.y;
    g.camera.x = p.x;
    g.camera.y = p.y;
    placeTrafficNear(p.x, p.y, 6, 200, 600);
    // police already closing in: one right behind the player on the same road
    // (visible in frame), two more snapped onto nearby roads
    const cop1 = makeCar(roadCenterX(12) - 280, roadCenterY(9) + 8, 0, 'police', '#1a1a2e');
    cop1.driver = 'police';
    cop1.speed = 380;
    cop1.ai.road = 'h';
    cop1.ai.dir = 1;
    g.cars.push(cop1);
    for (let i = 0; i < 2; i++) {
      const a = (i / 2) * TAU + 2.2;
      const cx = p.x + Math.cos(a) * 320;
      const cy = p.y + Math.sin(a) * 320;
      const rp = nearestRoadPoint(Math.max(40, Math.min(WORLD_W - 40, cx)), Math.max(40, Math.min(WATER_Y - 40, cy)));
      const pc = makeCar(rp.x, rp.y, 0, 'police', '#1a1a2e');
      pc.driver = 'police';
      pc.speed = 260;
      pc.ai.road = rp.vertical ? 'v' : 'h';
      if (pc.ai.road === 'h') {
        pc.ai.dir = p.x >= rp.x ? 1 : -1;
        pc.angle = pc.ai.dir === 1 ? 0 : Math.PI;
        pc.y = rp.y + (pc.ai.dir === 1 ? 8 : -8);
      } else {
        pc.ai.dir = p.y >= rp.y ? 1 : -1;
        pc.angle = pc.ai.dir === 1 ? Math.PI / 2 : -Math.PI / 2;
        pc.x = rp.x + (pc.ai.dir === 1 ? 8 : -8);
      }
      g.cars.push(pc);
    }
  }
}

// --- HUD -----------------------------------------------------------------------
const el = (id) => document.getElementById(id);
let lastMsgCount = -1;
function updateHud() {
  const p = g.player;
  el('health-fill').style.width = Math.max(0, p.health) + '%';
  el('health-text').textContent = 'HP ' + Math.max(0, Math.round(p.health));
  el('money').textContent = '$' + p.money.toLocaleString('en-US');
  const hh = String(Math.floor(g.clockMin / 60)).padStart(2, '0');
  const mm = String(Math.floor(g.clockMin % 60)).padStart(2, '0');
  el('clock').textContent = hh + ':' + mm;
  const stars = el('stars').children;
  for (let i = 0; i < stars.length; i++) {
    stars[i].classList.toggle('lit', i < p.wanted);
  }
  el('speed').textContent = p.onFoot ? '' : Math.round(Math.abs(p.car ? p.car.speed : 0) * 0.18) + ' km/h';
  const t = missionTarget(g);
  if (g.mission.active && t) {
    const m = MISSIONS[g.mission.index];
    el('objective').textContent = '◆ ' + m.title + ' — ' + t.label;
  } else if (g.storyDone) {
    el('objective').textContent = '◆ Free roam — Solmar Bay is yours.';
  } else {
    el('objective').textContent = '◆ Solmar Bay — free roam';
  }
  if (g.messages.length !== lastMsgCount) {
    lastMsgCount = g.messages.length;
    el('feed').innerHTML = g.messages.map((m) => '<div>' + m.text + '</div>').join('');
  }
  el('minimap-wrap').style.display = g.showMinimap ? 'block' : 'none';
  if (g.showMinimap) drawMinimap(g, mctx, 220, 160);
  el('sound').textContent = g.audio.muted ? '🔇 muted (0)' : '🔊 sound (0)';
}

// --- boot ----------------------------------------------------------------------
spawnTraffic(g, 14);
spawnPeds(g, 24);
const saved = loadGame();
if (saved) {
  el('title-continue').style.display = 'inline-block';
  el('title-saveinfo').textContent = 'Save found: $' + (saved.money || 0) + ' · mission ' + ((saved.missionIndex || 0) + 1) + ' of 5';
}
el('title-start').addEventListener('click', () => startGame(false));
el('title-continue').addEventListener('click', () => startGame(true));
el('busted-respawn').addEventListener('click', respawn);
el('wasted-respawn').addEventListener('click', respawn);
el('paused-resume').addEventListener('click', () => {
  g.state = 'playing';
  el('paused').style.display = 'none';
});
if (shot) setupShot(shot);

let last = performance.now();
let acc = 0;
function frame(now) {
  const dtMs = Math.min(100, now - last);
  last = now;
  const input = g.input;
  input.beginFrame();
  if (input.pressed('Digit0')) {
    g.audio.ensure();
    g.audio.toggleMute();
  }
  if (g.state === 'title') {
    if (input.pressed('Enter')) startGame(false);
    else if (input.pressed('KeyC') && saved) startGame(true);
    updateWorld(dtMs / 1000);
  } else if (g.state === 'playing') {
    if (input.pressed('KeyM')) g.showMinimap = !g.showMinimap;
    if (input.pressed('Escape') || input.pressed('KeyP')) {
      g.state = 'paused';
      el('paused').style.display = 'flex';
    } else {
      acc += dtMs / 1000;
      let steps = 0;
      while (acc >= STEP && steps < 5) {
        updatePlaying(STEP);
        acc -= STEP;
        steps++;
        if (g.state !== 'playing') break;
      }
      if (steps === 5) acc = 0;
    }
  } else if (g.state === 'busted' || g.state === 'wasted') {
    if (input.pressed('Enter')) respawn();
  } else if (g.state === 'paused') {
    if (input.pressed('Escape') || input.pressed('KeyP') || input.pressed('Enter')) {
      g.state = 'playing';
      el('paused').style.display = 'none';
    }
  }
  if (input.clicked) g.audio.ensure();
  render(g, ctx);
  updateHud();
  input.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
