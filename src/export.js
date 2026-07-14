/**
 * PNG export of the rank results, drawn on a 2D canvas from scratch —
 * no external dependency and no dependency on the live DOM (so the same
 * data can produce identical images across desktop/mobile). The module
 * exposes `renderExportCanvas` (returns an off-screen <canvas>) and a
 * few metadata objects the UI uses to build the options modal.
 *
 * Design goals:
 * - Zero deps: pure Canvas 2D. Rank emblems are loaded from `assets/`
 *   and cached across draws.
 * - Deterministic layout: given the same `result + meta + opts`, the
 *   image is pixel-identical. Layout is a function, no measurement.
 * - Format flexibility: 3 aspect ratios (square / portrait / landscape),
 *   3 themes (dark / light / accent), 3 content modes (hero / all /
 *   detail), optional watermark. Adding a new format = one entry.
 */

import { LABELS_EN } from "./labels.js";

export const EXPORT_FORMATS = {
  square:    { w: 1080, h: 1080, label: "Square · Instagram post", short: "1:1" },
  portrait:  { w: 1080, h: 1920, label: "Portrait · Story / Reel",  short: "9:16" },
  landscape: { w: 1920, h: 1080, label: "Landscape · Twitter",       short: "16:9" },
};

export const EXPORT_THEMES = {
  dark: {
    label: "Midnight",
    bg1:   "#0a0c14",
    bg2:   "#1a1030",
    bg3:   "#0e1936",
    text:  "#f3f5f9",
    muted: "#a2acc0",
    accent:"#7aa2ff",
    card:  "rgba(255,255,255,0.06)",
    stroke:"rgba(255,255,255,0.12)",
  },
  light: {
    label: "Daylight",
    bg1:   "#eef2fa",
    bg2:   "#c9d6f5",
    bg3:   "#dfe6f7",
    text:  "#0f1424",
    muted: "#4c5670",
    accent:"#4a6cff",
    card:  "rgba(255,255,255,0.75)",
    stroke:"rgba(15,20,36,0.15)",
  },
  accent: {
    label: "Vaporwave",
    bg1:   "#1e0b3a",
    bg2:   "#3a1054",
    bg3:   "#0d4b7a",
    text:  "#f5f0ff",
    muted: "#c8b8e8",
    accent:"#ff6ab5",
    card:  "rgba(255,255,255,0.08)",
    stroke:"rgba(255,255,255,0.14)",
  },
};

export const EXPORT_MODES = {
  hero:   { label: "Best rank only",       short: "Hero"   },
  all:    { label: "All muscle groups",    short: "Grid"   },
  detail: { label: "All groups + details", short: "Detail" },
};

/* ---------- Image cache ---------- */
const imageCache = new Map();
function loadImage(src) {
  if (imageCache.has(src)) return imageCache.get(src);
  const p = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
  imageCache.set(src, p);
  return p;
}

/**
 * Ensure the Inter webfont is actually rendered on the canvas, not the
 * system fallback. Canvas 2D doesn't participate in the browser's font
 * loading pipeline: if we draw before Inter is ready, we get a generic
 * sans-serif with poor weights (bold text looks thin & washed out).
 * `document.fonts.load()` returns a Promise per (weight, size) so we
 * warm up the ones we actually use before painting.
 */
async function ensureFonts() {
  if (typeof document === "undefined" || !document.fonts?.load) return;
  try {
    await Promise.all([
      document.fonts.load("400 22px Inter"),
      document.fonts.load("500 22px Inter"),
      document.fonts.load("600 30px Inter"),
      document.fonts.load("700 24px Inter"),
      document.fonts.load("800 60px Inter"),
      document.fonts.load("900 90px Inter"),
      // Space Grotesk powers the hero headline — geometric display
      // face with more character than Inter at large sizes.
      document.fonts.load('700 90px "Space Grotesk"'),
      document.fonts.load('600 30px "Space Grotesk"'),
    ]);
  } catch {
    /* Fallback silently — the system sans-serif is still readable. */
  }
}

/**
 * Render the export image. Returns a fully painted <canvas> (off-screen),
 * ready to be drawn into a preview or exported as a Blob via `toBlob()`.
 */
export async function renderExportCanvas(result, meta, opts = {}) {
  const format = EXPORT_FORMATS[opts.format] ?? EXPORT_FORMATS.square;
  const theme  = EXPORT_THEMES[opts.theme]   ?? EXPORT_THEMES.dark;
  const mode   = EXPORT_MODES[opts.mode]     ?? EXPORT_MODES.all;
  // Watermark is always shown — the project is open-source and non-profit,
  // and the URL is the only thing that lets people discover it back from
  // a screenshot. Kept as a hard-coded true (was previously optional).
  const watermark = true;
  const hideBw = opts.hideBw === true;

  await ensureFonts();

  const canvas = document.createElement("canvas");
  canvas.width  = format.w;
  canvas.height = format.h;
  const ctx = canvas.getContext("2d");

  drawBackground(ctx, format, theme, opts.theme === "light");
  await drawContent(ctx, format, theme, opts.mode ?? "all", result, meta, { hideBw });
  drawFooter(ctx, format, theme, meta, watermark);

  return canvas;
}

/* ---------- Background ---------- */
function drawBackground(ctx, { w, h }, th, isLight = false) {
  // Base flat fill + two soft radial blobs for depth. Matches the
  // ambient direction of the site without depending on backdrop-filter.
  ctx.fillStyle = th.bg1;
  ctx.fillRect(0, 0, w, h);

  const blob = (cx, cy, r, color, alpha) => {
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, hexA(color, alpha));
    g.addColorStop(1, hexA(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  };
  blob(w * 0.15, h * 0.10, Math.max(w, h) * 0.55, th.bg2, 0.85);
  blob(w * 0.90, h * 0.90, Math.max(w, h) * 0.60, th.bg3, 0.70);
  blob(w * 0.50, h * 0.50, Math.max(w, h) * 0.45, th.accent, 0.10);

  // Vignette — dark on dark themes for depth, LIGHT (white) on light
  // themes to avoid a muddy grey wash that killed the previous export.
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.max(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, isLight ? "rgba(255,255,255,0)" : "rgba(0,0,0,0)");
  vg.addColorStop(1, isLight ? "rgba(15,20,36,0.10)" : "rgba(0,0,0,0.35)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}

/* ---------- Content dispatch ---------- */
async function drawContent(ctx, fmt, th, mode, result, meta, extra = {}) {
  const { w, h } = fmt;
  const pad = Math.round(w * 0.06);

  // Header (title + subtitle) — same across all modes so the branding stays consistent.
  drawHeader(ctx, fmt, th, pad, meta, result, extra);

  const groups = Object.values(result.groups);
  const withData = groups.filter((g) => g.hasData);
  const best = withData.length
    ? withData.reduce((a, b) => (b.tierIndex > a.tierIndex ? b : a))
    : null;

  // Header height is driven by its own fonts (which scale with `w`),
  // NOT by a fixed % of `h` — otherwise landscape (short h, huge fonts)
  // has the title bleed into the content area.
  const headerH = headerHeight(w, pad);
  const headerBottom = headerH + Math.round(pad * 0.4);
  const footerTop = h - Math.round(h * 0.08);
  const contentTop = headerBottom;
  const contentBottom = footerTop - pad * 0.5;

  if (mode === "hero" && best) {
    await drawHeroCard(ctx, fmt, th, pad, contentTop, contentBottom, best, extra);
  } else if (mode === "detail") {
    await drawDetailedGrid(ctx, fmt, th, pad, contentTop, contentBottom, groups, best, extra);
  } else {
    await drawGrid(ctx, fmt, th, pad, contentTop, contentBottom, groups, best);
  }
}

/* ---------- Header ---------- */
/* Return the pixel height the header will occupy for a given canvas
   width & pad. Kept in sync with drawHeader below so `drawContent` can
   place the content area right below the last baseline. */
function headerHeight(w, pad) {
  const eyebrowSize = scaleFont(w, 20);
  const titleSize   = scaleFont(w, 56);
  const subSize     = scaleFont(w, 22);
  const topPad      = Math.round(pad * 0.55);
  const gapEyebrow  = Math.round(titleSize * 0.35);
  const gapSub      = Math.round(titleSize * 0.55);
  const eyebrowY = topPad + eyebrowSize;
  const titleY   = eyebrowY + gapEyebrow + titleSize;
  const subY     = titleY + gapSub;
  // Subtitle sits on its baseline at subY; add a descent buffer.
  return subY + Math.round(subSize * 0.3);
}

function drawHeader(ctx, { w, h }, th, pad, meta, result, extra = {}) {
  const cx = w / 2;
  // Layout the three header lines RELATIVE TO THEIR OWN FONT HEIGHTS
  // (which scale with `w`), instead of fixed % of `h`. Otherwise the
  // title font (scaleFont(w,56) → ~100px at 1920) overshoots its Y slot
  // computed from `h` (1080) and swallows the eyebrow above.
  const eyebrowSize = scaleFont(w, 20);
  const titleSize   = scaleFont(w, 56);
  const subSize     = scaleFont(w, 22);
  const topPad      = Math.round(pad * 0.55);
  const gapEyebrow  = Math.round(titleSize * 0.35);
  const gapSub      = Math.round(titleSize * 0.55);

  const eyebrowY = topPad + eyebrowSize;
  const titleY   = eyebrowY + gapEyebrow + titleSize;
  const subY     = titleY + gapSub;

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = th.muted;
  ctx.font = `600 ${eyebrowSize}px Inter, system-ui, sans-serif`;
  ctx.fillText("HEVY RANKS", cx, eyebrowY);

  ctx.fillStyle = th.text;
  ctx.font = `800 ${titleSize}px Inter, system-ui, sans-serif`;
  ctx.fillText("My strength ranks", cx, titleY);

  const src = meta?.source ? ` · ${meta.source}` : "";
  const sessions = meta?.sessions ? ` · ${meta.sessions} workouts` : "";
  const bw = !extra.hideBw && Number.isFinite(result?.bodyweightKg) && result.bodyweightKg > 0
    ? ` · ${Math.round(result.bodyweightKg)} kg BW`
    : "";
  ctx.fillStyle = th.muted;
  ctx.font = `500 ${subSize}px Inter, system-ui, sans-serif`;
  ctx.fillText(`Based on my real training${src}${sessions}${bw}`, cx, subY);
  // Suppress unused `h` warning — we now derive Y from `w` and pad.
  void h;
}

/* ---------- Hero card ---------- */
async function drawHeroCard(ctx, fmt, th, pad, top, bottom, g, extra = {}) {
  const { w, h } = fmt;
  const availableH = bottom - top;

  // For very wide formats (landscape 16:9), the vertical stack has
  // to shrink so aggressively that the emblem looks lonely in a huge
  // canvas. Switch to a side-by-side layout where the emblem sits
  // left and the text stacks right — natural fit for the aspect.
  if (w > h * 1.2) {
    await drawHeroSideBySide(ctx, fmt, th, pad, top, bottom, g);
    void extra;
    return;
  }

  const cx = w / 2;
  const boxW = w - pad * 2;

  // Raw sizes at "ideal" scale — will be uniformly shrunk if the
  // computed contentH exceeds availableH (landscape 16:9 and, to a
  // lesser extent, square). Keeps proportions consistent across
  // formats instead of clipping text into the footer.
  const rawEmblem      = Math.min(boxW * 0.48, availableH * 0.55, scaleFont(w, 520));
  const rawGapEmToT    = scaleFont(w, 60);
  const rawTitle       = scaleFont(w, 96);
  const rawGapTToB     = scaleFont(w, 40);
  const rawBadge       = scaleFont(w, 34) + 28;
  const rawGapBToC     = scaleFont(w, 54);
  const rawComp        = scaleFont(w, 24);
  const rawGapCToTop   = scaleFont(w, 30);
  const rawTopLift     = g.best?.title ? scaleFont(w, 20) + 8 : 0;
  const rawInnerPad    = scaleFont(w, 44);

  const rawContentH = rawInnerPad + rawEmblem + rawGapEmToT + rawTitle
    + rawGapTToB + rawBadge + rawGapBToC + rawComp
    + rawGapCToTop + rawTopLift + rawInnerPad;

  // Auto-fit: 1.0 when everything fits (portrait), <1 when it would
  // overflow (landscape). No upscaling — a small hero on a large
  // portrait looks premium centered, not stretched.
  const fit = Math.min(1, availableH / rawContentH);

  const emblemSize      = rawEmblem      * fit;
  const gapEmblemToText = rawGapEmToT    * fit;
  const titleSize       = rawTitle       * fit;
  const gapTitleToBadge = rawGapTToB     * fit;
  const badgeFontSize   = scaleFont(w, 34) * fit;
  const gapBadgeToComp  = rawGapBToC     * fit;
  const compSize        = rawComp        * fit;
  const gapCompToTop    = rawGapCToTop   * fit;
  const topLiftFontSize = scaleFont(w, 20) * fit;
  const innerPad        = rawInnerPad    * fit;

  const contentH = rawContentH * fit;
  const cardY = top + Math.max(0, (availableH - contentH) / 2);

  drawCard(ctx, pad, cardY, boxW, contentH, th, 32, g.tier.color, 0.35);

  const emblemY = cardY + innerPad;
  await drawRankEmblem(ctx, g.tier, cx - emblemSize / 2, emblemY, emblemSize, 0.12);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // 1) Muscle group — Space Grotesk 700, real display face (Inter 900
  //    used to be synthesised at large sizes → mushy edges).
  const groupY = emblemY + emblemSize + gapEmblemToText + titleSize * 0.85;
  ctx.fillStyle = th.text;
  ctx.font = `700 ${titleSize}px "Space Grotesk", Inter, system-ui, sans-serif`;
  drawText(ctx, (LABELS_EN[g.group.key] ?? g.group.key).toUpperCase(), cx, groupY, -0.02);

  // 2) Rank badge — pill with tier color as background, contrasted text.
  const badgeText = g.tier.name.toUpperCase();
  const badgeFont = `800 ${badgeFontSize}px Inter, system-ui, sans-serif`;
  const badgeY = groupY + gapTitleToBadge + badgeFontSize * 0.5;
  drawTierBadge(ctx, cx, badgeY, badgeText, badgeFont, g.tier.color, th);

  // 3) Composite ratio.
  const compY = badgeY + gapBadgeToComp + compSize * 0.4;
  ctx.fillStyle = th.muted;
  ctx.font = `600 ${compSize}px Inter, system-ui, sans-serif`;
  ctx.fillText(`Composite ${g.eqRatio.toFixed(2)}× bodyweight`, cx, compY);

  // 4) Top lift reference.
  if (g.best?.title) {
    ctx.fillStyle = th.muted;
    ctx.font = `500 ${topLiftFontSize}px Inter, system-ui, sans-serif`;
    const line = `Top: ${g.best.title} · est. 1RM ${g.best.best1RM.toFixed(0)} kg`;
    ctx.fillText(trimText(ctx, line, boxW - pad * 2), cx, compY + gapCompToTop + topLiftFontSize * 0.5);
  }

  // Silence extra param warning.
  void extra;
}

/* Landscape (16:9) layout for the Hero mode: emblem on the left, text
   stacked on the right. Avoids the "tiny emblem lost in a big empty
   card" effect that a shrunken vertical stack produces on wide canvases. */
async function drawHeroSideBySide(ctx, fmt, th, pad, top, bottom, g) {
  const { w } = fmt;
  const availableH = bottom - top;
  const boxW = w - pad * 2;

  // Card fills the whole available slot horizontally, and a
  // comfortable ~85 % of the available height (leaves a bit of air
  // above the footer).
  const cardH = availableH * 0.9;
  const cardY = top + (availableH - cardH) / 2;
  drawCard(ctx, pad, cardY, boxW, cardH, th, 32, g.tier.color, 0.35);

  const innerPad = scaleFont(w, 40);

  // Emblem block on the left (~40% of card width), vertically centered.
  const emblemMax = Math.min(cardH - innerPad * 2, boxW * 0.42);
  const emblemSize = Math.min(emblemMax, scaleFont(w, 620));
  const emblemX = pad + innerPad + (boxW * 0.42 - emblemSize) / 2;
  const emblemY = cardY + (cardH - emblemSize) / 2;
  await drawRankEmblem(ctx, g.tier, emblemX, emblemY, emblemSize, 0.14);

  // Text column on the right, everything left-aligned.
  const tx = pad + boxW * 0.44;
  const txMax = pad + boxW - innerPad - tx;

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  const titleSize   = scaleFont(w, 100);
  const badgeSize   = scaleFont(w, 34);
  const compSize    = scaleFont(w, 26);
  const topSize     = scaleFont(w, 20);

  // Stack the block vertically, centered around the card's midline.
  const blockH = titleSize + scaleFont(w, 30) + badgeSize + 28
                 + scaleFont(w, 44) + compSize
                 + (g.best?.title ? scaleFont(w, 34) + topSize : 0);
  let cy = cardY + (cardH - blockH) / 2;

  // 1) Muscle group headline
  cy += titleSize * 0.85;
  ctx.fillStyle = th.text;
  ctx.font = `700 ${titleSize}px "Space Grotesk", Inter, system-ui, sans-serif`;
  drawText(ctx, (LABELS_EN[g.group.key] ?? g.group.key).toUpperCase(), tx, cy, -0.02);

  // 2) Tier badge (aligned left with tx)
  cy += scaleFont(w, 30);
  const badgeText = g.tier.name.toUpperCase();
  const badgeFont = `800 ${badgeSize}px Inter, system-ui, sans-serif`;
  ctx.font = badgeFont;
  const badgeW = ctx.measureText(badgeText).width + Math.max(28, badgeSize * 0.5) * 2;
  const badgeH = badgeSize + 28;
  drawTierBadge(ctx, tx + badgeW / 2, cy + badgeH / 2, badgeText, badgeFont, g.tier.color, th);

  // 3) Composite
  cy += badgeH + scaleFont(w, 44);
  ctx.fillStyle = th.muted;
  ctx.font = `600 ${compSize}px Inter, system-ui, sans-serif`;
  ctx.fillText(`Composite ${g.eqRatio.toFixed(2)}× bodyweight`, tx, cy);

  // 4) Top lift
  if (g.best?.title) {
    cy += scaleFont(w, 34);
    ctx.fillStyle = th.muted;
    ctx.font = `500 ${topSize}px Inter, system-ui, sans-serif`;
    const line = `Top: ${g.best.title} · est. 1RM ${g.best.best1RM.toFixed(0)} kg`;
    ctx.fillText(trimText(ctx, line, txMax), tx, cy);
  }
}

/* Rounded pill drawn behind a piece of text — used for the tier badge
   in the hero. Auto-sized to the text width. */
function drawTierBadge(ctx, cx, cy, text, font, color, th) {
  ctx.save();
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const m = ctx.measureText(text);
  const padX = Math.max(24, m.width * 0.15);
  const padY = 14;
  const size = parseInt(font.match(/(\d+)px/)?.[1] ?? "32", 10);
  const w = m.width + padX * 2;
  const h = size + padY * 2;
  const x = cx - w / 2;
  const y = cy - h / 2;

  // Subtle colored halo behind the pill for that "featured" glow,
  // kept much softer than the previous emblem shadow.
  ctx.shadowColor = color;
  ctx.shadowBlur = h * 0.6;
  ctx.fillStyle = color;
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;

  // Text color: contrast against the badge color. Dark themes usually
  // have light tier colors, so black-ish reads best.
  ctx.fillStyle = pickContrastText(color);
  ctx.fillText(text, cx, cy + 1);
  ctx.restore();
}

/* Return a dark or light color depending on which reads best on top
   of the given hex background. Approximate perceptual luminance. */
function pickContrastText(hex) {
  if (!hex || hex[0] !== "#" || hex.length < 7) return "#0a0b1a";
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return l > 0.55 ? "#0a0b1a" : "#ffffff";
}

/* fillText with an optional letter-spacing simulated per-character.
   Canvas doesn't natively honour letterSpacing on all browsers, so we
   render one character at a time when spacing is requested. */
function drawText(ctx, text, x, y, spacingEm = 0) {
  if (!spacingEm) {
    ctx.fillText(text, x, y);
    return;
  }
  const size = parseInt(ctx.font.match(/(\d+)px/)?.[1] ?? "16", 10);
  const spacing = size * spacingEm;
  const widths = [...text].map((c) => ctx.measureText(c).width + spacing);
  const total = widths.reduce((a, b) => a + b, 0) - spacing;
  const align = ctx.textAlign;
  let cursor;
  if (align === "center") cursor = x - total / 2;
  else if (align === "right") cursor = x - total;
  else cursor = x;
  const prevAlign = ctx.textAlign;
  ctx.textAlign = "left";
  for (let i = 0; i < text.length; i++) {
    ctx.fillText(text[i], cursor, y);
    cursor += widths[i];
  }
  ctx.textAlign = prevAlign;
}

/* ---------- Grid (all groups) ---------- */
async function drawGrid(ctx, fmt, th, pad, top, bottom, groups, best) {
  const { w } = fmt;
  const boxW = w - pad * 2;
  const boxH = bottom - top;

  const cols = boxW > boxH ? 3 : 2;
  const rows = Math.ceil(groups.length / cols);
  const cellGap = Math.round(pad * 0.5);
  const cellW = (boxW - cellGap * (cols - 1)) / cols;
  const cellH = (boxH - cellGap * (rows - 1)) / rows;

  // Cap the font-scaling reference width so that in short landscapes
  // (small cellH but huge canvas w) fonts don't explode past the cell
  // bottom. The 3.2 factor keeps the 3-line stack (name/tier/ratio)
  // fitting under the emblem with breathing room.
  const refW = Math.min(w, Math.round(cellH * 3.2));

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = pad + col * (cellW + cellGap);
    const y = top + row * (cellH + cellGap);
    await drawGroupCell(ctx, x, y, cellW, cellH, th, g, refW, g === best);
  }
}

async function drawGroupCell(ctx, x, y, cw, ch, th, g, refW, isBest) {
  drawCard(ctx, x, y, cw, ch, th, 24, isBest ? g.tier.color : null);

  const em = Math.min(cw * 0.55, ch * 0.55);
  const ex = x + (cw - em) / 2;
  const ey = y + ch * 0.10;
  if (g.hasData) {
    await drawRankEmblem(ctx, g.tier, ex, ey, em);
  } else {
    ctx.save();
    ctx.globalAlpha = 0.35;
    // draw the lowest-tier emblem greyed out
    await drawRankEmblem(ctx, { name: "Locked", img: "rank-01-bronze.png" }, ex, ey, em);
    ctx.restore();
  }

  const cx = x + cw / 2;
  const nameY = ey + em + scaleFont(refW, 36);

  ctx.textAlign = "center";
  ctx.fillStyle = th.muted;
  ctx.font = `700 ${scaleFont(refW, 16)}px Inter, system-ui, sans-serif`;
  ctx.fillText((LABELS_EN[g.group.key] ?? g.group.key).toUpperCase(), cx, nameY);

  const tierY = nameY + scaleFont(refW, 30);
  ctx.fillStyle = g.hasData ? g.tier.color : th.muted;
  ctx.font = `800 ${scaleFont(refW, 30)}px Inter, system-ui, sans-serif`;
  ctx.fillText(g.hasData ? g.tier.name : "—", cx, tierY);

  if (g.hasData) {
    ctx.fillStyle = th.muted;
    ctx.font = `500 ${scaleFont(refW, 15)}px Inter, system-ui, sans-serif`;
    ctx.fillText(`${g.eqRatio.toFixed(2)}× BW`, cx, tierY + scaleFont(refW, 22));
  }
}

/* ---------- Detailed grid (adds best-lift line) ---------- */
async function drawDetailedGrid(ctx, fmt, th, pad, top, bottom, groups, best) {
  const { w } = fmt;
  const boxW = w - pad * 2;
  const boxH = bottom - top;

  const cols = boxW > boxH ? 2 : 1;
  const rows = Math.ceil(groups.length / cols);
  const cellGap = Math.round(pad * 0.4);
  const cellW = (boxW - cellGap * (cols - 1)) / cols;
  const cellH = (boxH - cellGap * (rows - 1)) / rows;

  // Detail cells have 4 text rows (label + tier + comp + top-lift).
  // Cap the font-scaling reference so those rows stay inside cellH in
  // short landscapes.
  const refW = Math.min(w, Math.round(cellH * 4.2));

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = pad + col * (cellW + cellGap);
    const y = top + row * (cellH + cellGap);
    await drawDetailCell(ctx, x, y, cellW, cellH, th, g, refW, g === best);
  }
}

async function drawDetailCell(ctx, x, y, cw, ch, th, g, refW, isBest) {
  drawCard(ctx, x, y, cw, ch, th, 22, isBest ? g.tier.color : null);

  const em = Math.min(ch * 0.62, cw * 0.28);
  const ex = x + ch * 0.10;
  const ey = y + (ch - em) / 2;
  if (g.hasData) {
    await drawRankEmblem(ctx, g.tier, ex, ey, em);
  } else {
    ctx.save();
    ctx.globalAlpha = 0.35;
    await drawRankEmblem(ctx, { name: "Locked", img: "rank-01-bronze.png" }, ex, ey, em);
    ctx.restore();
  }

  // Text column, left-aligned starting to the right of the emblem.
  const tx = ex + em + ch * 0.08;
  const twMax = x + cw - tx - ch * 0.10;
  const centerY = y + ch / 2;

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = th.muted;
  ctx.font = `700 ${scaleFont(refW, 16)}px Inter, system-ui, sans-serif`;
  ctx.fillText((LABELS_EN[g.group.key] ?? g.group.key).toUpperCase(), tx, centerY - scaleFont(refW, 34));

  ctx.fillStyle = g.hasData ? g.tier.color : th.muted;
  ctx.font = `800 ${scaleFont(refW, 34)}px Inter, system-ui, sans-serif`;
  ctx.fillText(g.hasData ? g.tier.name : "No data", tx, centerY);

  if (g.hasData) {
    ctx.fillStyle = th.muted;
    ctx.font = `500 ${scaleFont(refW, 17)}px Inter, system-ui, sans-serif`;
    ctx.fillText(`Composite ${g.eqRatio.toFixed(2)}× BW`, tx, centerY + scaleFont(refW, 26));

    if (g.best?.title) {
      ctx.fillStyle = th.muted;
      ctx.font = `500 ${scaleFont(refW, 15)}px Inter, system-ui, sans-serif`;
      const line = `Top: ${trimText(ctx, g.best.title, twMax)}`;
      ctx.fillText(line, tx, centerY + scaleFont(refW, 50));
    }
  }
}

/* ---------- Footer ---------- */
function drawFooter(ctx, { w, h }, th, meta, watermark) {
  if (!watermark) return;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = th.muted;
  ctx.font = `600 ${scaleFont(w, 18)}px Inter, system-ui, sans-serif`;
  ctx.fillText("benjipy.github.io/hevy-ranks · open-source · not affiliated with Hevy", w / 2, h - Math.round(h * 0.035));
}

/* ---------- Primitives ---------- */
function drawCard(ctx, x, y, w, h, th, radius = 20, borderColor = null, borderAlpha = 1) {
  roundRect(ctx, x, y, w, h, radius);
  ctx.fillStyle = th.card;
  ctx.fill();
  ctx.lineWidth = borderColor ? 3 : 1.5;
  if (borderColor && borderAlpha < 1) {
    ctx.save();
    ctx.globalAlpha = borderAlpha;
    ctx.strokeStyle = borderColor;
    ctx.stroke();
    ctx.restore();
  } else {
    ctx.strokeStyle = borderColor ?? th.stroke;
    ctx.stroke();
  }
  // Inset top highlight for the glass feel (even on non-glass browsers,
  // this reads as a subtle bezel).
  ctx.save();
  ctx.beginPath();
  roundRect(ctx, x, y, w, h, radius);
  ctx.clip();
  const g = ctx.createLinearGradient(0, y, 0, y + Math.min(h, 40));
  g.addColorStop(0, "rgba(255,255,255,0.10)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, Math.min(h, 40));
  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

async function drawRankEmblem(ctx, tier, x, y, size, glowFactor = 0.22) {
  try {
    const img = await loadImage(`assets/ranks/${tier.img}`);
    // Soft coloured glow around the emblem, tinted by the tier color.
    if (tier.color && glowFactor > 0) {
      ctx.save();
      ctx.shadowColor = tier.color;
      ctx.shadowBlur = size * glowFactor;
      ctx.drawImage(img, x, y, size, size);
      ctx.restore();
    } else {
      ctx.drawImage(img, x, y, size, size);
    }
  } catch {
    // Fallback: solid disc so layout stays consistent if an emblem 404s.
    ctx.fillStyle = tier.color ?? "#666";
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

function trimText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = "…";
  let lo = 0, hi = text.length;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid) + ellipsis).width <= maxWidth) lo = mid;
    else hi = mid - 1;
  }
  return text.slice(0, lo).trimEnd() + ellipsis;
}

function scaleFont(refW, sizeAt1080) {
  // Font sizes tuned for a 1080-wide canvas — scale linearly for other widths.
  return Math.round(sizeAt1080 * (refW / 1080));
}

function hexA(hex, alpha) {
  // Accepts #rrggbb or rgba(...) — returns the same color with the given alpha.
  if (hex.startsWith("#") && hex.length === 7) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
  }
  return hex;
}

/**
 * Convenience helper — turns a canvas into a File the OS can share
 * natively (via the Web Share API level 2 files support).
 */
export async function canvasToShareFile(canvas, filename = "hevy-ranks.png") {
  const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
  return new File([blob], filename, { type: "image/png" });
}
