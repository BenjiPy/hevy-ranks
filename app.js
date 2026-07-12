import { HevyClient } from "./src/hevy.js";
import { parseHevyCsv } from "./src/csv.js";
import {
  buildCatalog,
  computeRanks,
  workoutsToSessions,
  RANK_TIERS,
  GROUPS,
} from "./src/engine.js";

const RANK_IMG = (tier) => `assets/ranks/${tier.img}`;
const RESULTS_KEY = "hevy_results_html";
const VIEW_KEY = "hevy_view";
const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const fmt = (n) => nf.format(n);

/* Display names used in the web UI (kept separate from engine labels). */
const LABELS_EN = {
  legs: "Legs",
  chest: "Chest",
  back: "Back",
  shoulders: "Shoulders",
  arms: "Arms",
  core: "Core",
};
const REF_EN = {
  legs: "Squat",
  chest: "Bench press",
  back: "Barbell row",
  shoulders: "Overhead press",
  arms: "Barbell curl",
  core: "Weighted crunch",
};
const TIER_DESC = [
  "Just getting started.",
  "Building a base.",
  "Solid recreational strength.",
  "Strong intermediate.",
  "Advanced lifter.",
  "Highly advanced.",
  "Elite territory.",
  "Top 1% strength.",
  "Almost superhuman.",
];

let catalogPromise = null;
function loadCatalog() {
  if (!catalogPromise) {
    catalogPromise = fetch("data/exercise-templates.json")
      .then((r) => {
        if (!r.ok) throw new Error("Exercise catalog not found.");
        return r.json();
      })
      .then((arr) => buildCatalog(arr));
  }
  return catalogPromise;
}

/* ---------------- Navigation ---------------- */
const views = [...document.querySelectorAll(".view")];
let currentView = views.find((v) => !v.classList.contains("hidden"))?.id ?? "landing";
history.replaceState({ view: currentView }, "");

function show(id, push = true) {
  if (id === currentView) return;
  currentView = id;
  for (const v of views) v.classList.toggle("hidden", v.id !== id);
  window.scrollTo({ top: 0, behavior: "smooth" });
  if (push) history.pushState({ view: id }, "");
  if (id !== "loading") {
    try {
      sessionStorage.setItem(VIEW_KEY, id);
    } catch {
      /* storage unavailable: navigation still works in-memory */
    }
  }
}

window.addEventListener("popstate", (e) => {
  show(e.state?.view ?? "landing", false);
});

document.addEventListener("click", (e) => {
  const back = e.target.closest("[data-back]");
  if (back) {
    history.back();
    return;
  }
  const btn = e.target.closest("[data-goto]");
  if (btn) show(btn.dataset.goto);
});

/* ---------------- Toast ---------------- */
const toast = document.getElementById("toast");
let toastTimer;
function showToast(msg) {
  toast.textContent = msg;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 6000);
}

/* ---------------- Decorative rank strip ---------------- */
function fillStrip(el) {
  el.innerHTML = RANK_TIERS.map(
    (t) =>
      `<span class="rs-item" data-tip="${t.name}" style="--tip-color:${t.color}">` +
      `<img src="${RANK_IMG(t)}" alt="${t.name}" />` +
      `</span>`
  ).join("");
}
fillStrip(document.getElementById("rankStrip"));
fillParade(document.getElementById("rankParade"));

/* ---------------- Loading rank parade ---------------- */
function fillParade(el) {
  if (!el) return;
  el.innerHTML = RANK_TIERS.map(
    (t, i) =>
      `<img src="${RANK_IMG(t)}" alt="" style="--i:${i};--tint:${t.color}" />`
  ).join("");
}
buildRanksPage();
enhanceSelects();
restoreResults();
loadAppVersion();

/* Fetch the version from package.json (single source of truth). */
function loadAppVersion() {
  const el = document.getElementById("appVersion");
  if (!el) return;
  fetch("package.json", { cache: "no-cache" })
    .then((r) => (r.ok ? r.json() : null))
    .then((pkg) => {
      if (pkg?.version) el.textContent = pkg.version;
      else el.textContent = "?";
    })
    .catch(() => {
      el.textContent = "?";
    });
}

/* ---------------- Custom listbox (replaces native <select>) ---------------- */
function enhanceSelects() {
  const closeAll = (except) =>
    document.querySelectorAll(".select.open").forEach((w) => {
      if (w !== except) w.classList.remove("open");
    });

  for (const sel of document.querySelectorAll(".field select")) {
    const wrap = document.createElement("div");
    wrap.className = "select";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "select-btn";
    btn.setAttribute("aria-haspopup", "listbox");
    btn.setAttribute("aria-expanded", "false");
    const val = document.createElement("span");
    val.className = "select-val";
    val.textContent = sel.options[sel.selectedIndex]?.textContent ?? "";
    btn.appendChild(val);
    btn.insertAdjacentHTML(
      "beforeend",
      '<svg class="select-arrow" width="12" height="8" viewBox="0 0 12 8" aria-hidden="true"><path d="M1 1l5 5 5-5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'
    );

    const list = document.createElement("ul");
    list.className = "select-list";
    list.setAttribute("role", "listbox");
    for (const o of sel.options) {
      const li = document.createElement("li");
      li.className = "select-option";
      li.setAttribute("role", "option");
      li.dataset.value = o.value;
      li.textContent = o.textContent;
      if (o.selected) li.setAttribute("aria-selected", "true");
      li.addEventListener("click", () => {
        sel.value = o.value;
        val.textContent = o.textContent;
        for (const c of list.children) c.removeAttribute("aria-selected");
        li.setAttribute("aria-selected", "true");
        wrap.classList.remove("open");
        btn.setAttribute("aria-expanded", "false");
        sel.dispatchEvent(new Event("change", { bubbles: true }));
      });
      list.appendChild(li);
    }

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const willOpen = !wrap.classList.contains("open");
      closeAll(wrap);
      wrap.classList.toggle("open", willOpen);
      btn.setAttribute("aria-expanded", String(willOpen));
    });

    sel.classList.add("select-native");
    sel.parentNode.insertBefore(wrap, sel);
    wrap.append(btn, list);
  }

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".select")) closeAll(null);
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAll(null);
  });
}

/* ---------------- API mode ---------------- */
const apiKeyInput = document.getElementById("apiKey");
const rememberBox = document.getElementById("remember");
const savedKey = localStorage.getItem("hevy_api_key");
if (savedKey) {
  apiKeyInput.value = savedKey;
  rememberBox.checked = true;
}

document.getElementById("runApi").addEventListener("click", async () => {
  const key = apiKeyInput.value.trim();
  if (!key) return showToast("Enter your Hevy API key.");
  const sex = document.getElementById("sexApi").value;
  const bwInput = Number(document.getElementById("bwApi").value);

  if (rememberBox.checked) localStorage.setItem("hevy_api_key", key);
  else localStorage.removeItem("hevy_api_key");

  show("loading");
  const setLoad = (t) => (document.getElementById("loadingText").textContent = t);
  try {
    const catalog = await loadCatalog();
    const client = new HevyClient(key);

    setLoad("Fetching bodyweight…");
    let bodyweight = Number.isFinite(bwInput) && bwInput > 0 ? bwInput : null;
    if (!bodyweight) {
      try {
        bodyweight = await client.getLatestBodyweight();
      } catch {
        /* CORS or missing: ask manually */
      }
    }
    if (!bodyweight) {
      show("setup-api");
      return showToast("Bodyweight not found — enter it manually.");
    }

    setLoad("Loading your workouts…");
    const workouts = await client.getAllWorkouts({
      onProgress: (p, t) => setLoad(`Loading workouts… ${p}/${t}`),
    });

    const sessions = workoutsToSessions(workouts);
    const result = computeRanks(sessions, catalog, { bodyweightKg: bodyweight, sex });
    render(result, { source: "Hevy API", sessions: sessions.length });
  } catch (err) {
    show("setup-api");
    showToast(
      "API failed (" +
        (err?.message || "error") +
        "). The browser may block Hevy (CORS) — try CSV mode."
    );
  }
});

/* ---------------- CSV mode ---------------- */
const dropzone = document.getElementById("dropzone");
const csvFile = document.getElementById("csvFile");
const dzText = document.getElementById("dzText");
let csvText = null;

/* The file input overlays the whole dropzone (opacity:0). No <label>,
   no JS click relay, no clip-path — this is the only pattern where
   iOS Safari reliably fires `change` after the picker returns. */
csvFile.addEventListener("change", () => {
  if (csvFile.files[0]) acceptFile(csvFile.files[0]);
});

/* Hard cap for CSV imports (safety net; a real Hevy export is a few MB max).
   Anything bigger is almost certainly not a Hevy CSV. */
const MAX_CSV_BYTES = 20 * 1024 * 1024; // 20 MB
const CSV_MIME_ALLOW = new Set([
  "text/csv",
  "text/plain",
  "application/csv",
  "application/vnd.ms-excel",
  "application/octet-stream", // iOS often reports this for .csv from Files
  "", // some pickers report no MIME at all
]);

/* Client-side validation of the picked file. `accept=` on the input is
   only a UX hint (spec allows the picker to ignore it), so we re-check
   here before doing anything. Rejects bin/img/pdf/etc. with a clear
   message instead of failing silently downstream. */
function acceptFile(file) {
  const name = (file.name || "").toLowerCase();
  const looksCsvByName = name.endsWith(".csv") || name.endsWith(".txt");
  const looksCsvByMime = CSV_MIME_ALLOW.has(file.type || "");

  if (!looksCsvByName && !looksCsvByMime) {
    csvFile.value = "";
    return showToast(
      `"${file.name}" doesn't look like a CSV. Export your Hevy data as CSV first.`
    );
  }
  if (file.size > MAX_CSV_BYTES) {
    csvFile.value = "";
    return showToast(
      `File too big (${(file.size / 1024 / 1024).toFixed(1)} MB). Hevy exports are usually under 20 MB.`
    );
  }
  if (file.size === 0) {
    csvFile.value = "";
    return showToast("That file is empty.");
  }
  readCsv(file);
}
["dragover", "dragenter"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.add("drag");
  })
);
["dragleave", "drop"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.remove("drag");
  })
);
dropzone.addEventListener("drop", (e) => {
  const f = e.dataTransfer.files[0];
  if (f) acceptFile(f);
});

function readCsv(file) {
  const reader = new FileReader();
  reader.onload = () => {
    csvText = reader.result;
    dzText.textContent = `✓ ${file.name}`;
    dropzone.classList.add("loaded");
  };
  reader.onerror = () => {
    csvText = null;
    dropzone.classList.remove("loaded");
    showToast(
      "Couldn't read that file. On iOS, make sure it's downloaded from iCloud first."
    );
  };
  reader.readAsText(file);
}

document.getElementById("runCsv").addEventListener("click", async () => {
  if (!csvText) return showToast("Choose a CSV file first.");
  const bw = Number(document.getElementById("bwCsv").value);
  if (!Number.isFinite(bw) || bw <= 0)
    return showToast("Enter your bodyweight.");
  const sex = document.getElementById("sexCsv").value;

  show("loading");
  document.getElementById("loadingText").textContent = "Parsing CSV…";
  try {
    const catalog = await loadCatalog();
    const sessions = parseHevyCsv(csvText);
    if (!sessions.length) throw new Error("Empty CSV or unexpected format");
    const result = computeRanks(sessions, catalog, { bodyweightKg: bw, sex });
    render(result, { source: "CSV import", sessions: sessions.length });
  } catch (err) {
    show("setup-csv");
    showToast("CSV error: " + (err?.message || "invalid format"));
  }
});

/* ---------------- Radar chart ---------------- */
function radarSvg(groups) {
  const W = 460;
  const H = 400;
  const cx = 230;
  const cy = 200;
  const R = 128;
  const n = groups.length;
  const ang = (i) => ((-90 + (360 / n) * i) * Math.PI) / 180;
  const pt = (i, r) => [cx + R * r * Math.cos(ang(i)), cy + R * r * Math.sin(ang(i))];
  const poly = (r) =>
    groups.map((_, i) => pt(i, r).map((v) => v.toFixed(1)).join(",")).join(" ");

  const rings = [0.25, 0.5, 0.75, 1]
    .map((r) => `<polygon class="grid-line" points="${poly(r)}" />`)
    .join("");
  const axes = groups
    .map((_, i) => {
      const [x, y] = pt(i, 1);
      return `<line class="axis" x1="${cx}" y1="${cy}" x2="${x.toFixed(1)}" y2="${y.toFixed(1)}" />`;
    })
    .join("");
  const vals = groups.map((g) => (g.tierIndex != null ? g.tierIndex : 0) / 8);
  const area = groups
    .map((g, i) => pt(i, Math.max(0.03, vals[i])).map((v) => v.toFixed(1)).join(","))
    .join(" ");
  const dots = groups
    .map((g, i) => {
      const [x, y] = pt(i, Math.max(0.03, vals[i]));
      return `<circle class="dot" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" />`;
    })
    .join("");
  const labels = groups
    .map((g, i) => {
      const [x, y] = pt(i, 1.22);
      let anchor = "middle";
      if (x < cx - 12) anchor = "end";
      else if (x > cx + 12) anchor = "start";
      const dy = y < cy - 30 ? -2 : 4;
      const tier = g.tier ? g.tier.name : "—";
      return `<text class="lbl" x="${x.toFixed(1)}" y="${(y + dy).toFixed(1)}" text-anchor="${anchor}">${LABELS_EN[g.group.key]}</text>
        <text class="lbl-sub" x="${x.toFixed(1)}" y="${(y + dy + 14).toFixed(1)}" text-anchor="${anchor}">${tier}</text>`;
    })
    .join("");

  return `<svg class="radar" viewBox="0 0 ${W} ${H}" role="img" aria-label="Strength radar">
    ${rings}${axes}
    <polygon class="area" points="${area}" />
    ${dots}${labels}
  </svg>`;
}

/* ---------------- Group rows ---------------- */
function trackBars(idx) {
  let s = "";
  for (let i = 0; i < RANK_TIERS.length; i++) {
    const cls = i === idx ? "cur" : i < idx ? "on" : "";
    s += `<i class="${cls}"></i>`;
  }
  return s;
}

const REASON_LABEL = {
  isolation: "Isolation",
  few_sessions: "Too few sessions",
  unknown: "Unrecognized exercise",
  no_load: "No measurable load",
};
const REASON_HELP = {
  isolation:
    "Excluded because at least one compound lift is available. Kept for reference.",
  few_sessions: "Needs at least 3 distinct training days to count.",
};

function liftsTable(lifts, { showReason = false } = {}) {
  if (!lifts.length) return `<p class="composite-info">Nothing to show.</p>`;
  const rows = lifts
    .map((l) => {
      const reasonCell = showReason
        ? `<td><span class="reason-tag ${l.reason}">${REASON_LABEL[l.reason] ?? l.reason}</span></td>`
        : "";
      return `<tr>
        <td class="lift-title">${escapeHtml(l.title)}</td>
        <td class="num">${fmt(l.load)} kg × ${l.reps}</td>
        <td class="num">${fmt(l.best1RM)} kg</td>
        <td class="num">${l.coeff != null ? fmt(l.coeff) : "—"}</td>
        <td class="num">${l.sessionsCount}</td>
        <td class="num lift-ratio">${l.eqRatio != null ? fmt(l.eqRatio) + "×" : "—"}</td>
        ${reasonCell}
      </tr>`;
    })
    .join("");
  const reasonHead = showReason ? "<th>Reason</th>" : "";
  return `<table class="lifts-table">
    <thead><tr>
      <th>Exercise</th>
      <th class="num">Best set</th>
      <th class="num">Est. 1RM</th>
      <th class="num">Coeff</th>
      <th class="num">Sessions</th>
      <th class="num">Ratio</th>
      ${reasonHead}
    </tr></thead>
    <tbody>${rows}</tbody>
  </table>`;
}

function groupItem(g) {
  const label = LABELS_EN[g.group.key];
  if (!g.hasData) {
    // Group with no usable data: non-clickable header
    const excludedNote = g.excluded.length
      ? ` · ${g.excluded.length} lift(s) skipped (see below)`
      : "";
    return `<div class="grow-item empty">
      <button class="grow-row" type="button" aria-expanded="false" disabled>
        <img class="grow-emblem" src="${RANK_IMG(RANK_TIERS[0])}" alt="" style="filter:grayscale(1)" />
        <div class="grow-main">
          <div class="grow-head"><span class="grow-name">${label}</span></div>
          <div class="gtrack">${trackBars(-1)}</div>
          <div class="grow-detail">No qualifying exercise yet${excludedNote}.</div>
        </div>
        <div class="grow-right"><div class="grow-tier" style="color:var(--muted-2)">—</div></div>
        <span class="chevron">▾</span>
      </button>
    </div>`;
  }
  const nextTxt = g.next
    ? `Next: ${g.next.tier.name} · +${fmt(g.next.remaining)}× BW`
    : "Max rank reached";
  const cappedBadge = g.capped
    ? ` <span class="reason-tag isolation" title="Not enough data — rank is capped">capped</span>`
    : "";

  const sourceExplanation = {
    compound: `Composite of your <strong>top ${g.used.length} compound lift(s)</strong> for this group (weights: 1.0 / 0.5 / 0.25).`,
    isolation: `<em>No compound lift with 3+ sessions found — using isolation lifts as a fallback. Rank is capped at Titan.</em>`,
    few_sessions: `<em>No exercise reached 3 sessions yet — using what's available. Rank is capped at Platinum until you log more sessions.</em>`,
  }[g.source] ?? "";

  const cappedTip = {
    isolation: `Log a few sessions of a compound lift (squat, bench, row, OHP, etc.) to unlock the top tiers for this group.`,
    few_sessions: `Keep training — an exercise needs at least 3 sessions to fully count toward your rank.`,
  }[g.source];

  const composite = `
    <p class="composite-info">
      ${sourceExplanation}
      Overall ratio: <strong>${fmt(g.eqRatio)}× bodyweight</strong>.
    </p>
    ${cappedTip ? `<p class="capped-note">${cappedTip}</p>` : ""}
  `;

  const detail = `
    <div class="grow-detail-panel">
      ${composite}
      <h4>Used in your rank (${g.used.length})</h4>
      ${liftsTable(g.used)}
      ${g.excluded.length
        ? `<h4>Not used (${g.excluded.length})</h4>${liftsTable(g.excluded, { showReason: true })}`
        : ""}
    </div>
  `;

  return `<div class="grow-item" data-group="${g.group.key}">
    <button class="grow-row" type="button" aria-expanded="false" data-toggle-group="${g.group.key}">
      <img class="grow-emblem" src="${RANK_IMG(g.tier)}" alt="${g.tier.name}" />
      <div class="grow-main">
        <div class="grow-head">
          <span class="grow-name">${label}${cappedBadge}</span>
          <span class="grow-next">${nextTxt}</span>
        </div>
        <div class="gtrack">${trackBars(g.tierIndex)}</div>
      </div>
      <div class="grow-right">
        <div class="grow-tier">${g.tier.name}</div>
        <div class="grow-ratio">${fmt(g.eqRatio)}× BW</div>
      </div>
      <span class="chevron">▾</span>
    </button>
    ${detail}
  </div>`;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

/* ---------------- Unmatched section ---------------- */
function renderUnmatched(details) {
  const section = document.getElementById("unmatchedSection");
  const listEl = document.getElementById("unmatchedList");
  const leadEl = document.getElementById("unmatchedLead");
  if (!section) return;

  const items = [...(details?.values() ?? [])]
    .map((d) => ({
      title: d.title,
      sessions: d.sessions?.size ?? 0,
      reason: d.reason,
    }))
    .sort((a, b) => b.sessions - a.sessions);

  if (!items.length) {
    section.classList.add("hidden");
    listEl.innerHTML = "";
    return;
  }
  section.classList.remove("hidden");
  leadEl.textContent =
    "These exercises were skipped because they aren't recognized as strength lifts (custom, cardio, mobility, etc.). Reach out if a lift you care about is here.";
  listEl.innerHTML = items
    .map(
      (i) => `<li>
        <span class="um-title" title="${escapeHtml(i.title)}">${escapeHtml(i.title)}</span>
        <span class="um-meta">
          <span>${i.sessions} session${i.sessions > 1 ? "s" : ""}</span>
          <span class="reason-tag ${i.reason}">${REASON_LABEL[i.reason] ?? i.reason}</span>
        </span>
      </li>`
    )
    .join("");
}

/* ---------------- Accordion click handling (delegated) ---------------- */
document.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-toggle-group]");
  if (!btn || btn.disabled) return;
  const item = btn.closest(".grow-item");
  if (!item) return;
  const open = item.classList.toggle("open");
  btn.setAttribute("aria-expanded", String(open));
  persistResults();
});

/* ---------------- Render results ---------------- */
function render(result, meta) {
  const groups = Object.values(result.groups);
  const withData = groups.filter((g) => g.hasData);

  document.getElementById("radarWrap").innerHTML = radarSvg(groups);

  const bestEl = document.getElementById("best");
  if (withData.length) {
    const best = withData.reduce((a, b) => (b.tierIndex > a.tierIndex ? b : a));
    bestEl.innerHTML = `
      <div class="best-label">Your top rank</div>
      <img src="${RANK_IMG(best.tier)}" alt="${best.tier.name}" />
      <div class="best-tier">${best.tier.name}</div>
      <div class="best-sub">${LABELS_EN[best.group.key]} · composite ${fmt(
      best.eqRatio
    )}× bodyweight (top: ${escapeHtml(best.best.title)}, est. 1RM ${fmt(
      best.best.best1RM
    )} kg)</div>`;
  } else {
    bestEl.innerHTML = `<div class="best-label">Result</div>
      <div class="best-tier">No usable data</div>
      <div class="best-sub">No exercise with a measurable load was found.</div>`;
  }

  document.getElementById("groups").innerHTML = groups.map(groupItem).join("");
  renderUnmatched(result.unmatchedDetails);

  document.getElementById("resultsMeta").innerHTML = `Source: <strong>${
    meta.source
  }</strong> · ${meta.sessions} workouts · Bodyweight: <strong>${fmt(
    result.bodyweightKg
  )} kg</strong>`;

  const capped = groups.filter((g) => g.capped).length;
  const cappedNote = capped
    ? ` ${capped} group(s) are capped at Titan (no compound lift with 3+ sessions found).`
    : "";
  document.getElementById("disclaimer").textContent =
    "Ranks come from a composite of your top compound lifts per group (Epley 1RM ÷ coefficient ÷ bodyweight). Isolation lifts and exercises with fewer than 3 sessions are shown in the details but don't drive the rank." +
    cappedNote;

  persistResults();
  show("results");

  const topColor =
    withData.length
      ? withData.reduce((a, b) => (b.tierIndex > a.tierIndex ? b : a)).tier.color
      : null;
  fireConfetti(topColor);
}

/* ---------------- Confetti burst (results reveal) ---------------- */
/* Small canvas particle system, zero dependency. Fires once per render()
   call, skipped on restore-from-storage and on prefers-reduced-motion. */
function fireConfetti(accent) {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  const canvas = document.getElementById("confetti");
  if (!canvas) return;

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const resize = () => {
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
  };
  resize();
  window.addEventListener("resize", resize, { once: true });
  canvas.classList.add("on");

  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  const palette = [
    accent || "#6c8cff",
    ...RANK_TIERS.map((t) => t.color),
  ];

  const count = Math.min(
    220,
    Math.max(120, Math.round((window.innerWidth * window.innerHeight) / 9000))
  );
  const particles = [];
  const gravity = 0.35 * dpr;
  const drag = 0.992;

  const rand = (a, b) => a + Math.random() * (b - a);

  const spawn = (originX) => {
    for (let i = 0; i < count / 2; i++) {
      const angle = rand(-Math.PI, 0) + rand(-0.3, 0.3);
      const speed = rand(9, 18) * dpr;
      particles.push({
        x: originX,
        y: H * 0.72,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - rand(2, 6) * dpr,
        w: rand(6, 12) * dpr,
        h: rand(8, 16) * dpr,
        color: palette[Math.floor(Math.random() * palette.length)],
        rot: rand(0, Math.PI * 2),
        vr: rand(-0.25, 0.25),
        life: rand(90, 160),
        shape: Math.random() < 0.5 ? "rect" : "circle",
      });
    }
  };
  spawn(W * 0.2);
  spawn(W * 0.8);

  let frames = 0;
  const maxFrames = 260;
  let raf;

  const step = () => {
    frames++;
    ctx.clearRect(0, 0, W, H);
    for (const p of particles) {
      p.vx *= drag;
      p.vy = p.vy * drag + gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      p.life--;

      const alpha = Math.max(0, Math.min(1, p.life / 60));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === "rect") {
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      } else {
        ctx.beginPath();
        ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    if (frames < maxFrames && particles.some((p) => p.life > 0 && p.y < H + 40)) {
      raf = requestAnimationFrame(step);
    } else {
      cancelAnimationFrame(raf);
      ctx.clearRect(0, 0, W, H);
      canvas.classList.remove("on");
    }
  };
  raf = requestAnimationFrame(step);
}

/* ---------------- Persist results (survive navigation & reload) ---------------- */
function persistResults() {
  document.getElementById("resumeRow")?.classList.remove("hidden");
  try {
    sessionStorage.setItem(
      RESULTS_KEY,
      document.getElementById("results").innerHTML
    );
  } catch {
    /* storage unavailable (private mode, quota): keep in-DOM only */
  }
}

function restoreResults() {
  let savedHtml = null;
  let savedView = null;
  try {
    savedHtml = sessionStorage.getItem(RESULTS_KEY);
    savedView = sessionStorage.getItem(VIEW_KEY);
  } catch {
    /* storage unavailable: nothing to restore */
  }

  const hasResults = Boolean(savedHtml);
  if (hasResults) {
    document.getElementById("results").innerHTML = savedHtml;
    document.getElementById("resumeRow")?.classList.remove("hidden");
  }

  /* Re-open the last view (skip transient/invalid ones). */
  const restorable = new Set([
    "landing",
    "setup-api",
    "setup-csv",
    "ranks",
    ...(hasResults ? ["results"] : []),
  ]);
  if (savedView && savedView !== "landing" && restorable.has(savedView)) {
    show(savedView, false);
    history.replaceState({ view: savedView }, "");
  }
}

/* ---------------- How-it-works page ---------------- */
function buildRanksPage() {
  document.getElementById("tierGrid").innerHTML = RANK_TIERS.map(
    (t, i) => `<div class="tier-cell">
      <img src="${RANK_IMG(t)}" alt="${t.name}" />
      <div class="tc-idx">Rank ${i + 1} / 9</div>
      <div class="tc-name">${t.name}</div>
      <div class="tc-desc">${TIER_DESC[i]}</div>
    </div>`
  ).join("");

  const head = `<thead><tr><th>Muscle</th>${RANK_TIERS.map(
    (t) => `<th>${t.name}</th>`
  ).join("")}</tr></thead>`;
  const body =
    "<tbody>" +
    Object.values(GROUPS)
      .map((g) => {
        const cells = g.thresholds
          .map((thr, i) => `<td>${i === 0 ? "Entry" : "≥ " + fmt(thr) + "×"}</td>`)
          .join("");
        return `<tr><th><span class="grp">${LABELS_EN[g.key]}</span><span class="ref">ref: ${REF_EN[g.key]}</span></th>${cells}</tr>`;
      })
      .join("") +
    "</tbody>";
  document.getElementById("thresholdTable").innerHTML = head + body;
}
