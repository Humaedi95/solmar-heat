// Solmar Heat — saving to localStorage. The save holds the player's money,
// mission progress, position and the in-game clock; it is written when a
// mission ends and every half minute of play.
import { SAVE_KEY } from './config.js';

export function saveGame(g) {
  try {
    const data = {
      v: 1,
      money: g.player.money,
      missionIndex: g.mission.index,
      missionsDone: g.stats.missionsDone,
      storyDone: !!g.storyDone,
      weapon: g.player.weapon,
      wanted: g.player.wanted,
      clockMin: g.clockMin,
      px: Math.round(g.player.x),
      py: Math.round(g.player.y),
      muted: g.audio.muted,
    };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch (e) {
    // storage may be unavailable (private mode); the game plays on regardless
  }
}

export function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== 1) return null;
    return data;
  } catch (e) {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) { /* ignore */ }
}
