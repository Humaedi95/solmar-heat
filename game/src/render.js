// Solmar Heat — rendering: the city, the actors, the waypoint and the minimap.
// Everything is drawn on one 2D canvas; the HUD text lives in the DOM and the
// minimap is a second small canvas. Only what the camera sees is drawn.
import {
  TILE, ROAD, COLS, ROWS, WORLD_W, WORLD_H, WATER_Y, BEACH_Y0,
  VIEW_W, VIEW_H, PALETTE,
} from './config.js';
import { blockX, blockY, roadCenterX, roadCenterY } from './city.js';
import { missionTarget } from './missions.js';

const TAU = Math.PI * 2;

function inView(cam, x, y, m = 60) {
  return x > cam.x - VIEW_W / 2 - m && x < cam.x + VIEW_W / 2 + m
    && y > cam.y - VIEW_H / 2 - m && y < cam.y + VIEW_H / 2 + m;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCarShape(ctx, car, time) {
  const L = 46;
  const W = 21;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  // shadow
  ctx.fillStyle = 'rgba(0,0,0,0.30)';
  roundRect(ctx, -L / 2 + 2, -W / 2 + 3, L, W, 6);
  ctx.fill();
  // body
  ctx.fillStyle = car.color;
  roundRect(ctx, -L / 2, -W / 2, L, W, 6);
  ctx.fill();
  if (car.type === 'police') {
    ctx.fillStyle = '#f5f5f5';
    ctx.fillRect(-4, -W / 2, 10, W);
  }
  // cabin + windshield
  ctx.fillStyle = '#1c2733';
  roundRect(ctx, -8, -W / 2 + 4, 16, W - 8, 3);
  ctx.fill();
  ctx.fillStyle = 'rgba(180,220,255,0.85)';
  ctx.fillRect(8, -W / 2 + 4, 3, W - 8);
  // wheels
  ctx.fillStyle = '#111111';
  for (const [wx, wy] of [[-14, -W / 2 - 2], [12, -W / 2 - 2], [-14, W / 2 - 2], [12, W / 2 - 2]]) {
    ctx.fillRect(wx, wy, 9, 4);
  }
  if (car.type === 'police') {
    // flashing light bar
    const phase = Math.floor(time * 4) % 2 === 0;
    ctx.fillStyle = phase ? '#ff2d2d' : '#2d6bff';
    ctx.fillRect(-3, -W / 2 - 1, 6, 4);
    ctx.fillStyle = phase ? '#2d6bff' : '#ff2d2d';
    ctx.fillRect(-3, W / 2 - 3, 6, 4);
  }
  if (car.type === 'taxi') {
    ctx.fillStyle = '#111111';
    ctx.font = 'bold 7px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('TAXI', 0, 3);
  }
  ctx.restore();
}

function drawPedShape(ctx, ped, time) {
  ctx.save();
  ctx.translate(ped.x, ped.y);
  if (ped.down) {
    ctx.rotate(ped.angle + Math.PI / 2);
    ctx.fillStyle = ped.shirt;
    ctx.beginPath();
    ctx.ellipse(0, 0, 9, 5, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(10, 0, 4, 0, TAU);
    ctx.fill();
  } else {
    const bob = Math.sin(time * 10 + ped.x) * 1.5;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 5, 6, 3, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = ped.shirt;
    ctx.beginPath();
    ctx.arc(0, bob * 0.3, 6, 0, TAU);
    ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(Math.cos(ped.angle) * 3, Math.sin(ped.angle) * 3 + bob * 0.3 - 2, 4, 0, TAU);
    ctx.fill();
    if (ped.kind === 'officer') {
      ctx.fillStyle = '#0d0d1a';
      ctx.beginPath();
      ctx.arc(0, bob * 0.3 - 4, 4.5, 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

export function render(g, ctx) {
  const p = g.player;
  const cam = g.camera;
  // camera follows the player with a little look-ahead in the driving direction
  const look = p.onFoot ? 0 : Math.min(60, Math.abs(p.speed) * 0.12);
  const tx = clamp(p.x + Math.cos(p.angle) * look, VIEW_W / 2, WORLD_W - VIEW_W / 2);
  const ty = clamp(p.y + Math.sin(p.angle) * look, VIEW_H / 2, WORLD_H - VIEW_H / 2);
  cam.x += (tx - cam.x) * 0.12;
  cam.y += (ty - cam.y) * 0.12;
  if (g.shake > 0) {
    g.shake = Math.max(0, g.shake - 0.02);
    cam.x += (Math.random() - 0.5) * g.shake * 10;
    cam.y += (Math.random() - 0.5) * g.shake * 10;
  }
  const vx0 = cam.x - VIEW_W / 2;
  const vy0 = cam.y - VIEW_H / 2;
  ctx.fillStyle = '#20242a';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.save();
  ctx.translate(-vx0, -vy0);

  // ground: asphalt everywhere, blocks drawn on top
  ctx.fillStyle = PALETTE.asphalt;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  // sea and sand
  ctx.fillStyle = PALETTE.sand;
  ctx.fillRect(0, BEACH_Y0, WORLD_W, WATER_Y - BEACH_Y0);
  ctx.fillStyle = PALETTE.water;
  ctx.fillRect(0, WATER_Y, WORLD_W, WORLD_H - WATER_Y);
  ctx.fillStyle = PALETTE.waterDeep;
  for (let x = 0; x < WORLD_W; x += 90) {
    ctx.fillRect(x + ((g.time * 12) % 90), WATER_Y + 14, 46, 2);
  }

  // road centre dashes
  ctx.strokeStyle = PALETTE.asphaltLine;
  ctx.lineWidth = 2;
  ctx.setLineDash([14, 18]);
  for (let c = 0; c <= COLS; c++) {
    const x = roadCenterX(c);
    if (x < vx0 - 20 || x > vx0 + VIEW_W + 20) continue;
    ctx.beginPath();
    ctx.moveTo(x, Math.max(0, vy0));
    ctx.lineTo(x, Math.min(WORLD_H, vy0 + VIEW_H));
    ctx.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    const y = roadCenterY(r);
    if (y < vy0 - 20 || y > vy0 + VIEW_H + 20) continue;
    ctx.beginPath();
    ctx.moveTo(Math.max(0, vx0), y);
    ctx.lineTo(Math.min(WORLD_W, vx0 + VIEW_W), y);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  // blocks
  const c0 = Math.max(0, Math.floor((vx0 - ROAD) / (TILE + ROAD)));
  const c1 = Math.min(COLS - 1, Math.floor((vx0 + VIEW_W - ROAD) / (TILE + ROAD)));
  const r0 = Math.max(0, Math.floor((vy0 - ROAD) / (TILE + ROAD)));
  const r1 = Math.min(ROWS - 1, Math.floor((vy0 + VIEW_H - ROAD) / (TILE + ROAD)));
  for (let row = r0; row <= r1; row++) {
    for (let col = c0; col <= c1; col++) {
      const b = g.city.blocks[row * COLS + col];
      const bx = blockX(col);
      const by = blockY(row);
      if (b.type === 'park') {
        ctx.fillStyle = PALETTE.parkGrass;
        ctx.fillRect(bx, by, TILE, TILE);
      } else if (b.type === 'plaza') {
        ctx.fillStyle = '#a8adb5';
        ctx.fillRect(bx, by, TILE, TILE);
        ctx.strokeStyle = '#8d9299';
        ctx.strokeRect(bx + 8, by + 8, TILE - 16, TILE - 16);
      } else if (b.type === 'beach') {
        ctx.fillStyle = PALETTE.sand;
        ctx.fillRect(bx, by, TILE, TILE);
      } else {
        ctx.fillStyle = '#7e838b';
        ctx.fillRect(bx, by, TILE, TILE);
        ctx.fillStyle = '#878c94';
        ctx.fillRect(bx + 3, by + 3, TILE - 6, TILE - 6);
      }
      for (const bd of b.buildings) {
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.fillRect(bd.x + 3, bd.y + bd.hgt * 0.4 + 3, bd.w, bd.h);
        ctx.fillStyle = bd.color;
        ctx.fillRect(bd.x, bd.y, bd.w, bd.h);
        ctx.fillStyle = bd.roof;
        ctx.fillRect(bd.x + 3, bd.y + 3, bd.w - 6, bd.h - 6);
        if (bd.lit) {
          ctx.fillStyle = PALETTE.windowLit;
          for (let wy = bd.y + 8; wy < bd.y + bd.h - 6; wy += 11) {
            for (let wx = bd.x + 7; wx < bd.x + bd.w - 6; wx += 11) {
              ctx.fillRect(wx, wy, 4, 5);
            }
          }
        }
      }
      for (const t of b.trees) {
        ctx.fillStyle = PALETTE.trunk;
        ctx.fillRect(t.x - 1, t.y - 1, 3, 4);
        ctx.fillStyle = t.palm ? PALETTE.palm : PALETTE.tree;
        ctx.beginPath();
        ctx.arc(t.x, t.y - 3, t.r, 0, TAU);
        ctx.fill();
      }
    }
  }

  // traffic lights
  for (const L of g.city.lights) {
    if (!inView(cam, L.x, L.y, 40)) continue;
    ctx.fillStyle = '#222222';
    ctx.fillRect(L.x - 2, L.y - 14, 4, 14);
    ctx.fillStyle = '#111111';
    ctx.fillRect(L.x - 5, L.y - 22, 10, 12);
    ctx.fillStyle = L.ns ? '#39d353' : '#ff3b30';
    ctx.beginPath();
    ctx.arc(L.x, L.y - 18, 3, 0, TAU);
    ctx.fill();
    ctx.fillStyle = L.ns ? '#ff3b30' : '#39d353';
    ctx.beginPath();
    ctx.arc(L.x, L.y - 13, 3, 0, TAU);
    ctx.fill();
  }

  // mission markers: target diamond + money bags + the boat
  const target = missionTarget(g);
  if (target) {
    const pulse = 1 + Math.sin(g.time * 5) * 0.15;
    ctx.save();
    ctx.translate(target.x, target.y);
    ctx.scale(pulse, pulse);
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.moveTo(0, -16);
    ctx.lineTo(11, 0);
    ctx.lineTo(0, 16);
    ctx.lineTo(-11, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#7a5a00';
    ctx.font = 'bold 11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('!', 0, 4);
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,211,77,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(target.x, target.y, 26 + Math.sin(g.time * 5) * 4, 0, TAU);
    ctx.stroke();
  }
  if (g.mission.active && g.mission.index === 4) {
    const bags = g.city.spots.bags;
    const flags = g.mission.collectedFlags || [false, false, false];
    for (let i = 0; i < bags.length; i++) {
      if (flags[i]) continue;
      ctx.fillStyle = '#2ecc71';
      ctx.beginPath();
      ctx.arc(bags[i].x, bags[i].y, 10, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('$', bags[i].x, bags[i].y + 4);
    }
  }
  // the getaway boat
  const boat = g.city.spots.boat;
  if (inView(cam, boat.x, boat.y, 80)) {
    ctx.fillStyle = '#f5f5f5';
    roundRect(ctx, boat.x - 26, boat.y - 9, 52, 18, 8);
    ctx.fill();
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(boat.x - 26, boat.y - 2, 52, 4);
    ctx.fillStyle = '#2c3e50';
    ctx.fillRect(boat.x - 4, boat.y - 22, 8, 14);
  }

  // cars, peds, officers, bullets, particles
  for (const car of g.cars) {
    if (car.dead && car.driver !== 'player') continue;
    if (!inView(cam, car.x, car.y, 60)) continue;
    if (car.dead) {
      ctx.save();
      ctx.globalAlpha = 0.75;
      drawCarShape(ctx, car, g.time);
      ctx.restore();
      continue;
    }
    drawCarShape(ctx, car, g.time);
  }
  for (const ped of g.peds) {
    if (!inView(cam, ped.x, ped.y, 30)) continue;
    drawPedShape(ctx, ped, g.time);
  }
  for (const o of g.officers) {
    if (!inView(cam, o.x, o.y, 30)) continue;
    drawPedShape(ctx, o, g.time);
  }
  if (!p.onFoot && p.car) {
    // highlight the player's car
    ctx.strokeStyle = 'rgba(255,211,77,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.car.x, p.car.y, 30, 0, TAU);
    ctx.stroke();
  }
  if (p.onFoot) {
    // highlight ring so the player is easy to spot on foot
    ctx.strokeStyle = 'rgba(255,211,77,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 16, 0, TAU);
    ctx.stroke();
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, 6, 7, 3, 0, 0, TAU);
    ctx.fill();
    ctx.rotate(p.angle);
    ctx.fillStyle = '#e67e22';
    ctx.beginPath();
    ctx.arc(0, 0, 8, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#f1c27d';
    ctx.beginPath();
    ctx.arc(4, 0, 5, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#222222';
    ctx.fillRect(10, -2, 8, 4);
    ctx.restore();
  }
  for (const b of g.bullets) {
    ctx.strokeStyle = '#ffe27a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(b.x - b.vx * 0.012, b.y - b.vy * 0.012);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }
  for (const pt of g.particles) {
    ctx.globalAlpha = Math.max(0, pt.life / pt.max);
    ctx.fillStyle = pt.color;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, pt.size, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // waypoint arrow at the screen edge
  if (target) {
    const sx = target.x - vx0;
    const sy = target.y - vy0;
    const cx = VIEW_W / 2;
    const cy = VIEW_H / 2;
    const dx = sx - cx;
    const dy = sy - cy;
    const d = Math.hypot(dx, dy);
    if (d > 260) {
      const ang = Math.atan2(dy, dx);
      const ax = cx + Math.cos(ang) * 250;
      const ay = cy + Math.sin(ang) * 250;
      ctx.save();
      ctx.translate(ax, ay);
      ctx.rotate(ang);
      ctx.fillStyle = '#ffd34d';
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-8, -9);
      ctx.lineTo(-8, 9);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = '#ffd34d';
      ctx.font = 'bold 12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(Math.round(d / 10) * 10 + 'm', ax, ay + 24);
    }
  }
}

function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function drawMinimap(g, mctx, w, h) {
  const sx = w / WORLD_W;
  const sy = h / WORLD_H;
  mctx.fillStyle = '#14181d';
  mctx.fillRect(0, 0, w, h);
  mctx.fillStyle = '#2e7fa8';
  mctx.fillRect(0, WATER_Y * sy, w, h - WATER_Y * sy);
  mctx.fillStyle = '#e3cd8f';
  mctx.fillRect(0, BEACH_Y0 * sy, w, (WATER_Y - BEACH_Y0) * sy);
  mctx.strokeStyle = '#5a6068';
  mctx.lineWidth = 1;
  for (let c = 0; c <= COLS; c++) {
    const x = roadCenterX(c) * sx;
    mctx.beginPath();
    mctx.moveTo(x, 0);
    mctx.lineTo(x, h);
    mctx.stroke();
  }
  for (let r = 0; r <= ROWS; r++) {
    const y = roadCenterY(r) * sy;
    mctx.beginPath();
    mctx.moveTo(0, y);
    mctx.lineTo(w, y);
    mctx.stroke();
  }
  const target = missionTarget(g);
  if (target) {
    mctx.fillStyle = '#ffd34d';
    mctx.save();
    mctx.translate(target.x * sx, target.y * sy);
    mctx.rotate(Math.PI / 4);
    mctx.fillRect(-4, -4, 8, 8);
    mctx.restore();
  }
  for (const car of g.cars) {
    if (car.driver !== 'police' || car.dead) continue;
    mctx.fillStyle = Math.floor(g.time * 4) % 2 === 0 ? '#ff2d2d' : '#2d6bff';
    mctx.beginPath();
    mctx.arc(car.x * sx, car.y * sy, 3, 0, TAU);
    mctx.fill();
  }
  const p = g.player;
  mctx.fillStyle = '#ffffff';
  mctx.beginPath();
  mctx.arc(p.x * sx, p.y * sy, 3.5, 0, TAU);
  mctx.fill();
  mctx.strokeStyle = '#ffffff';
  mctx.beginPath();
  mctx.moveTo(p.x * sx, p.y * sy);
  mctx.lineTo((p.x + Math.cos(p.angle) * 90) * sx, (p.y + Math.sin(p.angle) * 90) * sy);
  mctx.stroke();
  // camera viewport
  mctx.strokeStyle = 'rgba(255,255,255,0.5)';
  mctx.strokeRect(
    (g.camera.x - VIEW_W / 2) * sx, (g.camera.y - VIEW_H / 2) * sy,
    VIEW_W * sx, VIEW_H * sy,
  );
}
