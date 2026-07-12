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
const nf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const fmt = (n) => nf.format(n);

/* English display names (engine keeps French labels for the CLI). */
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
    (t) => `<img src="${RANK_IMG(t)}" alt="${t.name}" title="${t.name}" />`
  ).join("");
}
fillStrip(document.getElementById("rankStrip"));
buildRanksPage();
enhanceSelects();
restoreResults();

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

dropzone.addEventListener("click", () => csvFile.click());
csvFile.addEventListener("change", () => {
  if (csvFile.files[0]) readCsv(csvFile.files[0]);
});
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
  if (f) readCsv(f);
});

function readCsv(file) {
  const reader = new FileReader();
  reader.onload = () => {
    csvText = reader.result;
    dzText.textContent = `✓ ${file.name}`;
    dropzone.classList.add("loaded");
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
function groupRow(g) {
  const label = LABELS_EN[g.group.key];
  if (!g.hasData) {
    return `<div class="grow empty">
      <img class="grow-emblem" src="${RANK_IMG(RANK_TIERS[0])}" alt="" style="filter:grayscale(1)" />
      <div class="grow-main">
        <div class="grow-head"><span class="grow-name">${label}</span></div>
        <div class="gtrack">${trackBars(-1)}</div>
        <div class="grow-detail">No data loaded yet.</div>
      </div>
      <div class="grow-right"><div class="grow-tier" style="color:var(--muted-2)">—</div></div>
    </div>`;
  }
  const b = g.best;
  const nextTxt = g.next
    ? `Next: ${g.next.tier.name} · +${fmt(g.next.remaining)}× BW`
    : "Max rank reached";
  return `<div class="grow">
    <img class="grow-emblem" src="${RANK_IMG(g.tier)}" alt="${g.tier.name}" />
    <div class="grow-main">
      <div class="grow-head">
        <span class="grow-name">${label}</span>
        <span class="grow-next">${nextTxt}</span>
      </div>
      <div class="gtrack">${trackBars(g.tierIndex)}</div>
      <div class="grow-detail"><strong>${b.title}</strong> · ${fmt(b.load)} kg × ${b.reps} · est. 1RM ${fmt(b.best1RM)} kg</div>
    </div>
    <div class="grow-right">
      <div class="grow-tier">${g.tier.name}</div>
      <div class="grow-ratio">${fmt(b.eqRatio)}× BW</div>
    </div>
  </div>`;
}

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
      <div class="best-sub">${LABELS_EN[best.group.key]} · ${best.best.title} — est. 1RM ${fmt(
      best.best.best1RM
    )} kg (${fmt(best.best.eqRatio)}× bodyweight)</div>`;
  } else {
    bestEl.innerHTML = `<div class="best-label">Result</div>
      <div class="best-tier">No usable data</div>
      <div class="best-sub">No exercise with a measurable load was found.</div>`;
  }

  document.getElementById("groups").innerHTML = groups.map(groupRow).join("");

  document.getElementById("resultsMeta").innerHTML = `Source: <strong>${
    meta.source
  }</strong> · ${meta.sessions} workouts · Bodyweight: <strong>${fmt(
    result.bodyweightKg
  )} kg</strong>`;

  const unmatched = result.unmatched.size;
  document.getElementById("disclaimer").textContent = unmatched
    ? `${unmatched} exercise(s) weren't recognized (custom / not loaded) and were skipped. Ranks are tunable estimates.`
    : "Ranks are estimates based on the Epley 1RM and tunable strength standards.";

  persistResults();
  show("results");
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
  let saved = null;
  try {
    saved = sessionStorage.getItem(RESULTS_KEY);
  } catch {
    /* ignore */
  }
  if (!saved) return;
  document.getElementById("results").innerHTML = saved;
  document.getElementById("resumeRow")?.classList.remove("hidden");
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
