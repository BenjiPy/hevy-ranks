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
    bg1:   "#f7f8fb",
    bg2:   "#e5eaf5",
    bg3:   "#dbe2f2",
    text:  "#0f1424",
    muted: "#4c5670",
    accent:"#4a6cff",
    card:  "rgba(15,20,36,0.05)",
    stroke:"rgba(15,20,36,0.12)",
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
  const watermark = opts.watermark !== false;

  await ensureFonts();

  const canvas = document.createElement("canvas");
  canvas.width  = format.w;
  canvas.height = format.h;
  const ctx = canvas.getContext("2d");

  drawBackground(ctx, format, theme);
  await drawContent(ctx, format, theme, opts.mode ?? "all", result, meta);
  drawFooter(ctx, format, theme, meta, watermark);

  return canvas;
}

/* ---------- Background ---------- */
function drawBackground(ctx, { w, h }, th) {
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

  // Subtle vignette so text stays readable near edges.
  const vg = ctx.createRadialGradient(w / 2, h / 2, Math.max(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, "rgba(0,0,0,0)");
  vg.addColorStop(1, "rgba(0,0,0,0.35)");
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, w, h);
}

/* ---------- Content dispatch ---------- */
async function drawContent(ctx, fmt, th, mode, result, meta) {
  const { w, h } = fmt;
  const pad = Math.round(w * 0.06);

  // Header (title + subtitle) — same across all modes so the branding stays consistent.
  drawHeader(ctx, fmt, th, pad, meta);

  const groups = Object.values(result.groups);
  const withData = groups.filter((g) => g.hasData);
  const best = withData.length
    ? withData.reduce((a, b) => (b.tierIndex > a.tierIndex ? b : a))
    : null;

  const headerBottom = Math.round(h * 0.22);
  const footerTop = h - Math.round(h * 0.08);
  const contentTop = headerBottom;
  const contentBottom = footerTop - pad * 0.5;

  if (mode === "hero" && best) {
    await drawHeroCard(ctx, fmt, th, pad, contentTop, contentBottom, best);
  } else if (mode === "detail") {
    await drawDetailedGrid(ctx, fmt, th, pad, contentTop, contentBottom, groups, best);
  } else {
    await drawGrid(ctx, fmt, th, pad, contentTop, contentBottom, groups, best);
  }
}

/* ---------- Header ---------- */
function drawHeader(ctx, { w, h }, th, pad, meta) {
  const cx = w / 2;
  const eyebrowY = Math.round(h * 0.07);
  const titleY   = Math.round(h * 0.11);
  const subY     = Math.round(h * 0.16);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  ctx.fillStyle = th.muted;
  ctx.font = `600 ${scaleFont(w, 20)}px Inter, system-ui, sans-serif`;
  ctx.fillText("HEVY RANKS", cx, eyebrowY);

  ctx.fillStyle = th.text;
  ctx.font = `800 ${scaleFont(w, 56)}px Inter, system-ui, sans-serif`;
  ctx.fillText("My strength ranks", cx, titleY);

  const src = meta?.source ? ` · ${meta.source}` : "";
  const sessions = meta?.sessions ? ` · ${meta.sessions} workouts` : "";
  ctx.fillStyle = th.muted;
  ctx.font = `500 ${scaleFont(w, 22)}px Inter, system-ui, sans-serif`;
  ctx.fillText(`Based on my real training${src}${sessions}`, cx, subY);
}

/* ---------- Hero card ---------- */
async function drawHeroCard(ctx, fmt, th, pad, top, bottom, g) {
  const { w } = fmt;
  const cx = w / 2;
  const boxH = bottom - top;
  const boxW = w - pad * 2;
  const boxY = top + boxH * 0.05;

  // Slight accent-tinted border on the hero card so it feels featured.
  drawCard(ctx, pad, boxY, boxW, boxH * 0.9, th, 32, g.tier.color, 0.35);

  // Emblem — glow toned down (was 0.22 * size, felt neon). Enough to
  // signal "special" without overpowering the text hierarchy below.
  const emblemSize = Math.min(boxW * 0.52, boxH * 0.50);
  const emblemY = boxY + boxH * 0.07;
  await drawRankEmblem(ctx, g.tier, cx - emblemSize / 2, emblemY, emblemSize, 0.12);

  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  // 1) Muscle group — the real headline (what the user is proud of).
  //    Big, tight kerning, in the theme text color for max contrast.
  const groupY = emblemY + emblemSize + scaleFont(w, 68);
  ctx.fillStyle = th.text;
  ctx.font = `900 ${scaleFont(w, 90)}px Inter, system-ui, sans-serif`;
  ctx.letterSpacing = "-2px";
  drawText(ctx, (LABELS_EN[g.group.key] ?? g.group.key).toUpperCase(), cx, groupY, -0.03);

  // 2) Rank badge — pill-shaped, tier color as background, dark text.
  //    Reads as a real "achievement badge" rather than a colored word.
  const badgeText = g.tier.name.toUpperCase();
  const badgeFont = `800 ${scaleFont(w, 34)}px Inter, system-ui, sans-serif`;
  const badgeY = groupY + scaleFont(w, 40);
  drawTierBadge(ctx, cx, badgeY, badgeText, badgeFont, g.tier.color, th);

  // 3) Composite ratio — muted, tabular.
  const compY = badgeY + scaleFont(w, 58);
  ctx.fillStyle = th.muted;
  ctx.font = `600 ${scaleFont(w, 24)}px Inter, system-ui, sans-serif`;
  ctx.fillText(`Composite ${g.eqRatio.toFixed(2)}× bodyweight`, cx, compY);

  // 4) Top lift — tiny, just the reference so people know what drove it.
  if (g.best?.title) {
    ctx.fillStyle = th.muted;
    ctx.font = `500 ${scaleFont(w, 20)}px Inter, system-ui, sans-serif`;
    const line = `Top: ${g.best.title} · est. 1RM ${g.best.best1RM.toFixed(0)} kg`;
    ctx.fillText(trimText(ctx, line, boxW - pad * 2), cx, compY + scaleFont(w, 34));
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

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = pad + col * (cellW + cellGap);
    const y = top + row * (cellH + cellGap);
    await drawGroupCell(ctx, x, y, cellW, cellH, th, g, w, g === best);
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

  for (let i = 0; i < groups.length; i++) {
    const g = groups[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = pad + col * (cellW + cellGap);
    const y = top + row * (cellH + cellGap);
    await drawDetailCell(ctx, x, y, cellW, cellH, th, g, w, g === best);
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
  ctx.fillText("hevy-ranks.pages.dev · open-source · not affiliated with Hevy", w / 2, h - Math.round(h * 0.035));
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
