import { computeMenuPosition } from '../menuPosition.js';

let pass = 0, fail = 0;
const check = (name, cond, detail = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? 'pass' : 'FAIL'}  ${name}${cond ? '' : `\n      ${detail}`}`);
};

const W = 1440, H = 900;
const rect = (top, height = 28, right = 1300) =>
  ({ top, bottom: top + height, right, left: right - 80 });

// ── Menu fits below: open downward ─────────────────────────────────────────
{
  const p = computeMenuPosition(rect(120), W, H);
  check('near the top opens downward', p.openUp === false);
  // trigger bottom (120 + 28) + 4px gap
  check('sits just under the trigger', p.top === 152, `top=${p.top}`);
  check('no bottom anchor when opening down', p.bottom === undefined);
}

// ── The reported bug: last row, no room below ──────────────────────────────
{
  const r = rect(governed(H));               // trigger near the very bottom
  const p = computeMenuPosition(r, W, H);
  check('near the bottom flips upward', p.openUp === true);
  check('anchored above the trigger', p.bottom === H - r.top + 4, `bottom=${p.bottom}`);
  check('no top anchor when opening up', p.top === undefined);

  // The real test: the menu's top edge must stay on-screen.
  const menuTop = H - p.bottom - p.maxHeight;
  check('menu top stays within the viewport', menuTop >= 0, `menuTop=${menuTop}`);
  check('usable height available', p.maxHeight >= 160, `maxHeight=${p.maxHeight}`);
}
function governed(h) { return h - 40; }       // 40px from the bottom edge

// ── Tight in BOTH directions: still clamped to something usable ────────────
{
  const p = computeMenuPosition(rect(200), 1440, 300);
  check('cramped viewport still yields a usable height', p.maxHeight >= 160, `maxHeight=${p.maxHeight}`);
}

// ── Horizontal clamping ────────────────────────────────────────────────────
{
  const p = computeMenuPosition(rect(120, 28, 1435), W, H);
  check('right edge never overflows', p.left + 256 <= W - 8 + 1, `left=${p.left}`);
}
{
  // A trigger close to the left edge would otherwise produce a negative left
  const p = computeMenuPosition(rect(120, 28, 100), W, H);
  check('left edge never goes negative', p.left >= 8, `left=${p.left}`);
}
{
  // Viewport narrower than the menu itself — must not produce nonsense
  const p = computeMenuPosition(rect(120, 28, 200), 240, H);
  check('viewport narrower than the menu stays on-screen', p.left >= 8, `left=${p.left}`);
}

// ── No oscillation when space is nearly equal ──────────────────────────────
{
  // Dead centre: below is cramped but above is not meaningfully better
  const p = computeMenuPosition(rect(430, 28), W, 900);
  const q = computeMenuPosition(rect(431, 28), W, 900);
  check('adjacent positions agree on direction', p.openUp === q.openUp,
    `${p.openUp} vs ${q.openUp}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
