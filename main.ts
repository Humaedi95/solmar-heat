// Solmar Heat — the entrypoint (Node 22, standard library only).
//
// The game itself is plain static files under game/ (game/index.html and its
// ES modules, no library, no network request). This program hands it in: it
// copies game/ and screenshots/ from beside this file into the output
// directory and writes dossier.json there, the summary the judge reads,
// built with the kit's vendored library (vendor/makefun-game.ts).
//
// The grader runs this program twice and both runs must write the same bytes.
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Play it locally with: node serve.ts  (then open http://localhost:8080)

import { cpSync, existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Copy a directory tree, creating the destination first.
function copyTree(from, to) {
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}

mkdirSync(out, { recursive: true });
copyTree(join(here, 'game'), join(out, 'game'));
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// The scorer's own caps (reference/gate.json): only text_max_bytes shapes the
// bytes; the others refuse an entry the scorer would refuse — more than 4
// screenshots or one over 256 KiB, more than 993 files in game/ or 48 MiB of
// game files in all, or a path under game/ over 1000 bytes.
const dossier = buildDossier(out, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(out, 'dossier.json'), dossier);

const shots = existsSync(join(out, 'screenshots'))
  ? readdirSync(join(out, 'screenshots')).filter((f) => !f.startsWith('.'))
  : [];
console.log(`Solmar Heat handed in: ${shots.length} screenshot(s), dossier ${dossier.length} bytes -> ${out}`);
