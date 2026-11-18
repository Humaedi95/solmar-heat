// Solmar Heat — the story: five missions for Danny Rook and Mara Voss.
// A mission is a list of steps; each step is a small objective the player
// completes by reaching a place, getting into a car, losing the cops, or
// collecting bags. Failing a mission simply restarts it — Solmar is forgiving.
import { blockX, blockY, roadCenterX, roadCenterY } from './city.js';
import { addWanted, makeCar } from './actors.js';
import { CAR_COLORS } from './config.js';

export const MISSIONS = [
  {
    giver: 'Danny Rook',
    title: 'First Wheels',
    brief: 'Danny needs a driver. Meet him, jack a car, and bring it to the drop-off.',
    reward: 150,
    steps: [
      { type: 'goto', at: 'danny', label: 'Meet Danny Rook' },
      { type: 'enterCar', at: 'sport', label: 'Steal the Comet GT' },
      { type: 'goto', at: 'dropoff', label: 'Drive to the drop-off' },
    ],
  },
  {
    giver: 'Mara Voss',
    title: 'The Package',
    brief: 'Mara has a package stashed in the old town. Fetch it — and mind the heat.',
    reward: 300,
    steps: [
      { type: 'goto', at: 'mara', label: 'Meet Mara Voss' },
      { type: 'goto', at: 'package', label: 'Pick up the package' },
      { type: 'goto', at: 'mara', label: 'Deliver it to Mara' },
    ],
  },
  {
    giver: 'Danny Rook',
    title: 'Lose the Heat',
    brief: 'Three stars and every cop in Solmar Bay on your tail. Go dark, then get to the safehouse.',
    reward: 250,
    steps: [
      { type: 'loseWanted', label: 'Lose the cops — lay low near the safehouse' },
      { type: 'goto', at: 'safehouse', label: 'Reach the safehouse' },
    ],
  },
  {
    giver: 'Mara Voss',
    title: 'Escort',
    brief: 'Drive Mara across town. She hates dents, and the cops hate her. Keep the car in one piece.',
    reward: 450,
    steps: [
      { type: 'goto', at: 'mara', label: 'Meet Mara Voss' },
      { type: 'enterCar', at: 'maraCar', label: "Get in Mara's car" },
      { type: 'escort', at: 'escortEnd', label: 'Get Mara across town — no dents' },
    ],
  },
  {
    giver: 'Danny Rook',
    title: 'The Big Getaway',
    brief: 'Three money bags, four stars, one boat. Grab the cash and vanish down the beach.',
    reward: 800,
    steps: [
      { type: 'collect', at: 'bags', label: 'Grab the three money bags' },
      { type: 'getaway', at: 'boat', label: 'Reach the boat at the beach' },
    ],
  },
];

// Where each named place sits in the world.
export function missionPlace(g, name) {
  const s = g.city.spots;
  switch (name) {
    case 'danny': return { x: s.danny.x, y: s.danny.y };
    case 'mara': return { x: s.mara.x, y: s.mara.y };
    case 'package': return { x: s.package.x, y: s.package.y };
    case 'safehouse': return { x: s.safehouse.x, y: s.safehouse.y };
    case 'boat': return { x: s.boat.x, y: s.boat.y };
    case 'sport': return { x: roadCenterX(10), y: roadCenterY(9) };
    case 'maraCar': return { x: roadCenterX(13), y: roadCenterY(6) };
    case 'dropoff': return { x: roadCenterX(16), y: roadCenterY(12) };
    case 'escortEnd': return { x: roadCenterX(20), y: roadCenterY(14) };
    default: return { x: s.player.x, y: s.player.y };
  }
}

function freshMissionState() {
  return { index: 0, step: 0, active: false, failed: false, collected: 0, car: null, passenger: false };
}

export function startMission(g, index) {
  const m = MISSIONS[index];
  if (!m) return;
  // clear any previous mission car (unless the player is still driving it)
  if (g.mission.car && g.player.car !== g.mission.car) {
    g.cars = g.cars.filter((c) => c !== g.mission.car);
  }
  g.mission.car = null;
  g.mission = freshMissionState();
  g.mission.index = index;
  g.mission.active = true;
  g.heatBoost = 1;
  if (index === 0) {
    const at = missionPlace(g, 'sport');
    const car = makeCar(at.x, at.y, 0, 'sport', g.rng.pick(CAR_COLORS.sport));
    car.missionCar = true;
    g.cars.push(car);
    g.mission.car = car;
  } else if (index === 2) {
    g.player.wanted = Math.max(g.player.wanted, 3);
    g.player.crimeT = g.time;
    g.say('Three stars! Lose the cops, then get to the safehouse.');
  } else if (index === 3) {
    const at = missionPlace(g, 'maraCar');
    const car = makeCar(at.x, at.y, 0, 'sedan', '#2e6fb0');
    car.missionCar = true;
    g.cars.push(car);
    g.mission.car = car;
  } else if (index === 4) {
    g.player.wanted = Math.max(g.player.wanted, 2);
    g.player.crimeT = g.time;
  }
  const first = m.steps[0];
  g.say('Mission: ' + m.title + ' — ' + first.label);
}

export function failMission(g, why) {
  const idx = g.mission.index;
  g.say('Mission failed: ' + why + ' — try again.');
  g.mission.failed = true;
  startMission(g, idx);
}

export function completeMission(g) {
  const m = MISSIONS[g.mission.index];
  g.player.money += m.reward;
  g.stats.missionsDone++;
  g.mission.active = false;
  g.mission.step = 0;
  g.mission.passenger = false;
  g.say('Mission complete: ' + m.title + '  ·  +$' + m.reward);
  g.audio.jingle();
  g.saveGame();
  if (g.mission.index === 4) {
    g.storyDone = true;
    g.say('You own Solmar Bay. Free roam — the city is yours.');
  } else {
    g.mission.index++;
  }
}

// The current objective target (for the waypoint, HUD and minimap).
export function missionTarget(g) {
  if (!g.mission.active) return null;
  const m = MISSIONS[g.mission.index];
  const step = m.steps[g.mission.step];
  if (!step) return null;
  if (step.type === 'collect') {
    const bags = g.city.spots.bags;
    for (let i = 0; i < bags.length; i++) {
      if (!g.mission.collectedFlags || !g.mission.collectedFlags[i]) {
        return { x: bags[i].x, y: bags[i].y, label: step.label + ' (' + g.mission.collected + '/3)' };
      }
    }
    return null;
  }
  if (step.type === 'loseWanted') {
    return { x: g.city.spots.safehouse.x, y: g.city.spots.safehouse.y, label: step.label };
  }
  const at = missionPlace(g, step.at);
  return { x: at.x, y: at.y, label: step.label };
}

export function updateMissions(g, dt) {
  if (!g.mission.active) return;
  const m = MISSIONS[g.mission.index];
  const step = m.steps[g.mission.step];
  if (!step) return;
  const p = g.player;
  const d = (t) => Math.hypot(p.x - t.x, p.y - t.y);

  // The safehouse cools the heat three times faster while you hide near it.
  const sh = g.city.spots.safehouse;
  g.heatBoost = Math.hypot(p.x - sh.x, p.y - sh.y) < 140 ? 3 : 1;

  let done = false;
  if (step.type === 'goto' || step.type === 'deliver') {
    if (d(missionPlace(g, step.at)) < 40) done = true;
  } else if (step.type === 'pickup') {
    if (d(missionPlace(g, step.at)) < 36) done = true;
  } else if (step.type === 'enterCar') {
    if (!p.onFoot && p.car === g.mission.car) done = true;
  } else if (step.type === 'loseWanted') {
    if (p.wanted === 0) done = true;
  } else if (step.type === 'escort') {
    if (g.mission.car && g.mission.car.hp < 25) {
      failMission(g, 'Mara\'s car is wrecked');
      return;
    }
    if (d(missionPlace(g, step.at)) < 44) done = true;
  } else if (step.type === 'collect') {
    if (!g.mission.collectedFlags) g.mission.collectedFlags = [false, false, false];
    const bags = g.city.spots.bags;
    for (let i = 0; i < bags.length; i++) {
      if (!g.mission.collectedFlags[i] && d(bags[i]) < 34) {
        g.mission.collectedFlags[i] = true;
        g.mission.collected++;
        p.money += 50;
        g.audio.pickup();
        g.say('Money bag grabbed  ·  +$50  (' + g.mission.collected + '/3)');
      }
    }
    if (g.mission.collected >= 3) done = true;
  } else if (step.type === 'getaway') {
    if (d(missionPlace(g, step.at)) < 44) done = true;
  }
  if (!done) return;

  // Step side-effects.
  if (g.mission.index === 1 && g.mission.step === 0) {
    p.weapon = 'pistol';
    p.ammo = Infinity;
    g.say('Mara slips you a pistol. Space to shoot.');
  }
  if (g.mission.index === 1 && g.mission.step === 1) {
    addWanted(g, 2, 'The package is hot!');
  }
  if (g.mission.index === 3 && g.mission.step === 1) {
    g.mission.passenger = true;
    g.say('Mara is in the car. Drive careful.');
  }
  if (g.mission.index === 4 && g.mission.step === 0) {
    p.wanted = Math.max(p.wanted, 4);
    p.crimeT = g.time;
    g.say('Four stars! Run for the boat!');
  }
  g.mission.step++;
  if (g.mission.step >= m.steps.length) {
    completeMission(g);
  } else {
    const next = m.steps[g.mission.step];
    g.say(next.label);
  }
}
