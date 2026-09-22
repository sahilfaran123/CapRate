/**
 * Fixed-position placement for dropdown menus.
 *
 * Extracted as a pure function so the flip-and-clamp behaviour can be tested
 * directly — it is easy to get subtly wrong, and the failure mode (a menu that
 * runs off-screen on the last row of a table) is only visible at specific
 * scroll positions, which makes it exactly the kind of bug that slips through
 * manual checks.
 *
 * @param {DOMRect|object} rect    — the trigger's bounding rect
 * @param {number} viewportW
 * @param {number} viewportH
 * @param {object} [opts]
 * @param {number} [opts.width]    — menu width in px
 * @param {number} [opts.gap]      — space between trigger and menu
 * @param {number} [opts.pad]      — minimum distance from the viewport edge
 * @param {number} [opts.minSpace] — below this much room, consider flipping up
 * @param {number} [opts.minHeight]
 * @returns {{ left, top, bottom, maxHeight, openUp }}
 */
export function computeMenuPosition(rect, viewportW, viewportH, opts = {}) {
  const {
    width     = 256,
    gap       = 4,
    pad       = 8,
    minSpace  = 240,
    minHeight = 160,
  } = opts;

  const spaceBelow = viewportH - rect.bottom - pad;
  const spaceAbove = rect.top - pad;

  // Prefer opening downward. Flip only when below is genuinely cramped AND
  // above has more room — requiring both keeps the menu from oscillating
  // between directions when the two are nearly equal.
  const openUp = spaceBelow < minSpace && spaceAbove > spaceBelow;

  // Right-align to the trigger, then clamp so a trigger near either edge can
  // never push the menu off-screen.
  const left = Math.min(
    Math.max(pad, rect.right - width),
    Math.max(pad, viewportW - width - pad)
  );

  return {
    left,
    top:    openUp ? undefined : rect.bottom + gap,
    bottom: openUp ? viewportH - rect.top + gap : undefined,
    // Cap the height so a long property list scrolls instead of overflowing.
    maxHeight: Math.max(minHeight, (openUp ? spaceAbove : spaceBelow) - gap),
    openUp,
  };
}
