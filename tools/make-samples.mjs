#!/usr/bin/env node
/**
 * Generates the placeholder images in samples/.
 *
 * These exist so the player runs and can be judged the moment you clone the
 * repo, before any real photos are added. They deliberately cover a wide
 * spread of aspect ratios — panorama through tall portrait — because handling
 * every shape gracefully is the whole point of the Ambient Frame layout.
 *
 *   node tools/make-samples.mjs
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'samples');

// [name, width, height, colourA, colourB, accent]
const PLATES = [
  ['01-landscape-3x2',    1500, 1000, '#7a4a2b', '#d9a066', '#f2d8a7'],
  ['02-portrait-2x3',     1000, 1500, '#2f4858', '#86a3b8', '#e8d9c0'],
  ['03-square',           1200, 1200, '#6b3f4e', '#c98b8b', '#f0dcc8'],
  ['04-wide-16x9',        1600,  900, '#3d5a3f', '#9ab87e', '#efe3bd'],
  ['05-tall-9x16',         900, 1600, '#4a3b6b', '#a893c9', '#e6dcf0'],
  ['06-landscape-4x3',    1400, 1050, '#8a5a25', '#e0b070', '#fceeda'],
  ['07-portrait-3x4',     1050, 1400, '#25505a', '#7fb3ae', '#e4efe6'],
  ['08-panorama',         1920,  800, '#5c3a2e', '#c58a5f', '#f5e2c4'],
  ['09-tall-panorama',     800, 1700, '#333f52', '#8593ad', '#e9e4d8'],
  ['10-landscape-5x4',    1400, 1120, '#704a2f', '#cf9a63', '#f6e6cb'],
  ['11-portrait-4x5',     1120, 1400, '#4b4033', '#b09877', '#efe2ce'],
  ['12-small-landscape',   640,  427, '#6e2f2f', '#c47a63', '#f3ddc9'],
  ['13-odd-ratio',        1300,  620, '#2c4a45', '#82b0a3', '#e9e7d4'],
  ['14-large-portrait',   1600, 2400, '#553a2a', '#bf8f68', '#f4e5cf']
];

/** Deterministic pseudo-random so regenerating gives identical files. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function plate([name, w, h, a, b, accent], index) {
  const rand = rng(index * 7919 + 13);
  const min = Math.min(w, h);

  // A handful of soft blobs, so the blurred backdrop has real colour movement
  // in it rather than a flat wash.
  let blobs = '';
  for (let i = 0; i < 5; i++) {
    const cx = Math.round(rand() * w);
    const cy = Math.round(rand() * h);
    const r = Math.round(min * (0.14 + rand() * 0.26));
    const fill = i % 2 === 0 ? accent : b;
    const op = (0.10 + rand() * 0.16).toFixed(2);
    blobs += `  <circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" opacity="${op}"/>\n`;
  }

  const label = `${w}×${h}`;
  const fontSize = Math.round(min * 0.075);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${a}"/>
      <stop offset="1" stop-color="${b}"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/>
${blobs}  <text x="50%" y="50%" fill="${accent}" opacity="0.85"
        font-family="Georgia, 'Times New Roman', serif" font-size="${fontSize}"
        text-anchor="middle" dominant-baseline="middle"
        letter-spacing="${Math.round(fontSize * 0.08)}">${label}</text>
</svg>
`;
}

mkdirSync(OUT, { recursive: true });
PLATES.forEach((p, i) => writeFileSync(join(OUT, `${p[0]}.svg`), plate(p, i)));
console.log(`Wrote ${PLATES.length} placeholder image(s) to samples/`);
