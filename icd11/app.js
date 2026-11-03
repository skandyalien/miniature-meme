/* ICD-11 Explorer — browse and search the WHO ICD-11 MMS tabular list. */
(function () {
  "use strict";
  const IX = window.ICD_INDEX;
  const $ = (id) => document.getElementById(id);
  const rows = IX.rows; // [key, code, title, parent, kind(h|b|c), chapter, lid]
  const K = 0, CODE = 1, TITLE = 2, PARENT = 3, KIND = 4, CH = 5, LID = 6;
  const KIND_LABEL = { h: "Chapter", b: "Block", c: "Category" };

  /* ---------- structure ---------- */
  const byKey = new Map();
  const kids = new Map();
  const roots = [];
  rows.forEach((r, i) => byKey.set(r[K], i));
  rows.forEach((r, i) => {
    let p = r[PARENT];
    if (r[KIND] === "h") { roots.push(i); return; }
    if (!p || !byKey.has(p)) p = "CH" + r[CH];
    if (!kids.has(p)) kids.set(p, []);
    kids.get(p).push(i);
  });

  // Map "first-last" code ranges (as cited in exclusions) to the block that spans them.
  const rangeMap = new Map();
  (function spans() {
    function walk(i) {
      const r = rows[i];
      let first = r[CODE] || "", last = r[CODE] || "";
      for (const c of kids.get(r[K]) || []) {
        const s = walk(c);
        if (!first && s[0]) first = s[0];
        if (s[1]) last = s[1];
      }
      if (r[KIND] !== "c" && first) {
        const k = first + "-" + last;
        if (!rangeMap.has(k)) rangeMap.set(k, r[K]);
      }
      return [first, last];
    }
    roots.forEach(walk);
  })();

  function ancestors(key) {
    const out = [];
    let i = byKey.get(key);
    while (i !== undefined) {
      const p = rows[i][PARENT] || (rows[i][KIND] !== "h" ? "CH" + rows[i][CH] : "");
      if (!p || !byKey.has(p)) break;
      out.unshift(p);
      i = byKey.get(p);
    }
    return out;
  }

  /* ---------- chapter detail loading (script tags so file:// works) ---------- */
  const details = new Map();
  const loaded = new Map();
  window.ICD_LOAD_CHAPTER = function (no, data) {
    for (const k in data) details.set(k, data[k]);
    const l = loaded.get(no);
    if (l) l.resolve();
  };
  function loadChapter(no) {
    if (loaded.has(no)) return loaded.get(no).promise;
    let resolve, reject;
    const promise = new Promise((a, b) => { resolve = a; reject = b; });
    loaded.set(no, { promise, resolve });
    const s = document.createElement("script");
    s.src = "data/ch-" + no + ".js";
    s.onerror = () => { loaded.delete(no); reject(new Error("Could not load chapter " + no)); };
    document.head.appendChild(s);
    return promise;
  }
  function loadAll() { return Promise.all(IX.chapters.map((c) => loadChapter(c.no))); }

  /* ---------- helpers ---------- */
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const toHash = (key) => (/^(Block|CH|U\d)/.test(key) ? key : key.replace(/\./g, "-"));
  const fromHash = (h) => (/^(Block|CH|U\d)/.test(h) ? h : h.replace(/-/g, "."));
  const codeLabel = (r) => r[CODE] || (r[KIND] === "h" ? "Ch " + r[CH] : "");
  const REF = /\(([0-9A-Z]{2,4}(?:\.[0-9A-Z]{1,4})?)(?:\s*[-‐‑–]\s*([0-9A-Z]{2,4}(?:\.[0-9A-Z]{1,4})?))?\)/g;

  function linkify(text) {
    return esc(text).replace(REF, (m, a, b) => {
      let target = b ? rangeMap.get(a + "-" + b) : null;
      if (!target && byKey.has(a)) target = a;
      if (!target) return m;
      return '(<a class="ref" href="#' + toHash(target) + '">' + a + (b ? "–" + b : "") + "</a>)";
    });
  }
  function highlight(text, tokens) {
    let h = esc(text);
    if (!tokens.length) return h;
    const rx = new RegExp("(" + tokens.map((t) => esc(t).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "gi");
    return h.replace(rx, "<mark>$1</mark>");
  }
  function store(key, val) { try { if (val === undefined) return JSON.parse(localStorage.getItem(key) || "null"); localStorage.setItem(key, JSON.stringify(val)); } catch (e) { return null; } }

  /* ---------- state ---------- */
  let current = null;
  const expanded = new Set();
  const rowEls = new Map();
  const list = $("list");
  const onlyCh6 = $("onlyCh6");
  const fulltext = $("fulltext");
  const q = $("q");

  /* ---------- tree ---------- */
  function rowHtml(i, depth) {
    const r = rows[i];
    const has = kids.has(r[K]);
    const open = expanded.has(r[K]);
    return '<div class="node" data-k="' + esc(r[K]) + '"><div class="row k-' + r[KIND] + (current === r[K] ? " sel" : "") +
      '" style="--d:' + depth + '" role="treeitem" tabindex="-1" aria-expanded="' + (has ? open : "") + '">' +
      '<span class="caret' + (has ? "" : " leaf") + '">' + (open ? "▼" : "▶") + "</span>" +
      '<span class="code">' + esc(codeLabel(r)) + '</span><span class="t">' + esc(r[TITLE]) + "</span></div>" +
      (has && open ? '<div class="kids">' + kids.get(r[K]).map((c) => rowHtml(c, depth + 1)).join("") + "</div>" : "") + "</div>";
  }
  function renderTree() {
    const top = onlyCh6.checked ? roots.filter((i) => rows[i][CH] === "06") : roots;
    $("railTitle").textContent = onlyCh6.checked ? "Chapter 06 · Mental" : "All chapters";
    list.innerHTML = '<div role="tree">' + top.map((i) => rowHtml(i, 0)).join("") + "</div>";
    indexRows();
    const sel = current && rowEls.get(current);
    if (sel) sel.scrollIntoView({ block: "center" });
  }
  function indexRows() {
    rowEls.clear();
    list.querySelectorAll(".node").forEach((n) => rowEls.set(n.dataset.k, n.firstElementChild));
  }
  function toggle(key, force) {
    const node = rowEls.get(key) && rowEls.get(key).parentElement;
    const open = force !== undefined ? force : !expanded.has(key);
    if (open) expanded.add(key); else expanded.delete(key);
    if (!node || !kids.has(key)) return;
    const depth = (ancestors(key).length - (onlyCh6.checked ? 0 : 0));
    const old = node.querySelector(":scope > .kids");
    if (old) old.remove();
    const row = node.firstElementChild;
    row.querySelector(".caret").textContent = open ? "▼" : "▶";
    row.setAttribute("aria-expanded", open);
    if (open) {
      node.insertAdjacentHTML("beforeend", '<div class="kids">' + kids.get(key).map((c) => rowHtml(c, depth + 1)).join("") + "</div>");
      node.querySelectorAll(":scope > .kids .node").forEach((n) => rowEls.set(n.dataset.k, n.firstElementChild));
    }
  }
  function reveal(key) {
    if (searching()) return;
    const chain = ancestors(key);
    let needRender = false;
    for (const a of chain) if (!expanded.has(a)) { expanded.add(a); needRender = true; }
    if (needRender || !rowEls.get(key)) renderTree();
    list.querySelectorAll(".row.sel").forEach((e) => e.classList.remove("sel"));
    const el = rowEls.get(key);
    if (el) { el.classList.add("sel"); el.scrollIntoView({ block: "nearest" }); }
  }
  list.addEventListener("click", (ev) => {
    const row = ev.target.closest(".row");
    if (!row) return;
    const key = row.parentElement.dataset.k;
    if (ev.target.classList.contains("caret") && !searching()) { toggle(key); return; }
    if (!searching() && kids.has(key) && current === key) toggle(key);
    else if (!searching() && kids.has(key)) toggle(key, true);
    go(key);
    closeDrawer();
  });

  /* ---------- search ---------- */
  let hay = null, hayFull = null;
  const searching = () => q.value.trim().length > 0;
  function buildHay() {
    if (!hay) hay = rows.map((r) => (r[CODE] + " " + r[TITLE]).toLowerCase());
  }
  function buildHayFull() {
    hayFull = rows.map((r) => {
      const d = details.get(r[K]);
      if (!d) return "";
      return [].concat(d.d || [], d.n || [], d.a || [], d.i || [], d.cn || []).join(" ").toLowerCase();
    });
  }
  function snippet(i, tokens) {
    const d = details.get(rows[i][K]);
    if (!d) return "";
    const txt = [].concat(d.d || [], d.n || [], d.a || [], d.i || [], d.cn || []).join(" ");
    const lo = txt.toLowerCase();
    let at = -1;
    for (const t of tokens) { at = lo.indexOf(t); if (at >= 0) break; }
    if (at < 0) return "";
    const s = Math.max(0, at - 60);
    return (s > 0 ? "…" : "") + txt.slice(s, at + 110) + "…";
  }
  function runSearch() {
    const raw = q.value.trim();
    if (!raw) { renderTree(); return; }
    buildHay();
    const ql = raw.toLowerCase();
    const tokens = ql.split(/\s+/).filter(Boolean);
    const codeQ = ql.replace(/\s+/g, "");
    const useFull = fulltext.checked && hayFull;
    const ch6 = onlyCh6.checked;
    const hits = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (ch6 && r[CH] !== "06") continue;
      const code = r[CODE].toLowerCase();
      const h = hay[i];
      let score = -1;
      if (code && code === codeQ) score = 0;
      else if (code && codeQ.length >= 2 && code.startsWith(codeQ)) score = 1;
      else if (h.indexOf(ql) >= 0) score = r[TITLE].toLowerCase().startsWith(ql) ? 2 : 3;
      else if (tokens.every((t) => h.indexOf(t) >= 0)) score = 4;
      else if (useFull && hayFull[i] && tokens.every((t) => hayFull[i].indexOf(t) >= 0 || h.indexOf(t) >= 0)) score = 5;
      if (score >= 0) hits.push([score, i]);
    }
    hits.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const LIMIT = 500;
    const shown = hits.slice(0, LIMIT);
    $("railTitle").textContent = hits.length.toLocaleString() + " result" + (hits.length === 1 ? "" : "s") + (hits.length > LIMIT ? " · first " + LIMIT : "");
    if (!hits.length) {
      list.innerHTML = '<div class="empty">No codes match “' + esc(raw) + "”." +
        (fulltext.checked ? "" : " Tick <b>Search descriptions too</b> to look inside definitions, inclusions and coding notes.") + "</div>";
      return;
    }
    list.innerHTML = '<div class="res">' + shown.map(([s, i]) => {
      const r = rows[i];
      const parent = r[PARENT] && byKey.has(r[PARENT]) ? rows[byKey.get(r[PARENT])] : null;
      const ctx = s === 5 ? highlight(snippet(i, tokens), tokens) : parent ? esc((parent[CODE] ? parent[CODE] + " · " : "") + parent[TITLE]) : "";
      return '<div class="node" data-k="' + esc(r[K]) + '"><div class="row k-' + r[KIND] + (current === r[K] ? " sel" : "") + '">' +
        '<span class="code">' + esc(codeLabel(r)) + '</span><span class="t">' + highlight(r[TITLE], tokens) + "</span>" +
        (ctx ? '<span class="ctx">' + ctx + "</span>" : "") + "</div></div>";
    }).join("") + "</div>";
    indexRows();
    list.scrollTop = 0;
  }
  let timer = null;
  q.addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(runSearch, 120); if (searching()) openDrawer(); });
  q.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { q.value = ""; runSearch(); if (current) reveal(current); }
    if (e.key === "Enter") {
      clearTimeout(timer); runSearch();
      const first = list.querySelector(".node");
      if (first) { go(first.dataset.k); closeDrawer(); }
    }
  });
  fulltext.addEventListener("change", () => {
    store("icd11.fulltext", fulltext.checked);
    if (fulltext.checked && !hayFull) {
      $("railTitle").textContent = "Loading all descriptions…";
      loadAll().then(() => { buildHayFull(); runSearch(); }).catch(() => { $("railTitle").textContent = "Could not load descriptions"; });
    } else runSearch();
  });
  onlyCh6.addEventListener("change", () => { store("icd11.ch6", onlyCh6.checked); searching() ? runSearch() : renderTree(); });
  $("collapseBtn").addEventListener("click", () => {
    if (searching()) { q.value = ""; }
    expanded.clear(); renderTree();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "/" && document.activeElement !== q && !/input|textarea/i.test(document.activeElement.tagName)) { e.preventDefault(); q.focus(); q.select(); }
  });

  /* ---------- entry sheet ---------- */
  const sheet = $("sheet");
  function list_(items, cls, label) {
    if (!items || !items.length) return "";
    return '<section class="sec-' + cls + '"><h3>' + label + '</h3><ul class="items">' + items.map((t) => "<li>" + linkify(t) + "</li>").join("") + "</ul></section>";
  }
  function paras(items, cls, label) {
    if (!items || !items.length) return "";
    return '<section class="sec-' + cls + '"><h3>' + label + "</h3>" + items.map((t) => "<p>" + linkify(t) + "</p>").join("") + "</section>";
  }
  function renderEntry(key) {
    const i = byKey.get(key);
    const r = rows[i];
    const d = details.get(key) || {};
    const chain = ancestors(key);
    const crumbs = chain.map((a) => {
      const ar = rows[byKey.get(a)];
      return '<a href="#' + toHash(a) + '">' + esc((ar[CODE] ? ar[CODE] + " " : ar[KIND] === "h" ? "Ch " + ar[CH] + " " : "") + ar[TITLE]) + "</a>";
    }).join('<span class="sep">›</span>');
    const childRows = (kids.get(key) || []).map((c) => {
      const cr = rows[c];
      return '<li class="k-' + cr[KIND] + '"><a href="#' + toHash(cr[K]) + '"><span class="code">' + esc(codeLabel(cr)) + '</span><span class="t">' + esc(cr[TITLE]) + "</span></a></li>";
    }).join("");
    const lid = r[LID];
    const who = "https://icd.who.int/browse/latestrelease/mms/en#" + encodeURIComponent(lid);
    const uri = "http://id.who.int/icd/release/11/mms/" + lid;
    const hasText = d.d || d.i || d.x || d.ce || d.cn || d.n || d.a;
    sheet.innerHTML =
      '<article class="entry">' +
      (crumbs ? '<div class="crumbs">' + crumbs + "</div>" : "") +
      '<div><span class="entry-code">' + esc(codeLabel(r) || "Block") + '</span><span class="kind">' + KIND_LABEL[r[KIND]] + (/\/(other|unspecified)$/.test(lid) ? " · residual" : "") + "</span></div>" +
      "<h2>" + esc(r[TITLE]) + "</h2>" +
      '<div class="actions">' + (r[CODE] ? '<button class="btn" type="button" id="copyBtn">Copy code</button>' : "") +
      '<button class="btn" type="button" id="copyFullBtn">Copy code + title</button>' +
      '<a class="btn" href="' + esc(who) + '" target="_blank" rel="noopener">Open in WHO browser ↗</a></div>' +
      (d.d ? '<div class="desc">' + d.d.map((p) => "<p>" + linkify(p) + "</p>").join("") + "</div>" :
        (details.size || loaded.size) && loaded.has(r[CH]) ? (hasText ? "" : '<p class="nodesc">WHO gives no separate description for this entry; see its parent and the entries below.</p>') : '<p class="nodesc">Loading description…</p>') +
      paras(d.n, "n", "Note") +
      paras(d.a, "n", "Additional information") +
      list_(d.i, "i", "Inclusions") +
      list_(d.x, "x", "Exclusions") +
      list_(d.ce, "ce", "Coded elsewhere") +
      paras(d.cn, "cn", "Coding note") +
      (childRows ? '<section><h3>' + (r[KIND] === "c" ? "Subcategories" : "Contains") + " (" + kids.get(key).length + ')</h3><ul class="children">' + childRows + "</ul></section>" : "") +
      '<div class="meta"><div>ICD-11 MMS release ' + esc(IX.release) + " · Chapter " + esc(r[CH]) + "</div>" +
      "<div>URI: <code>" + esc(uri) + "</code></div></div>" +
      '<p class="foot">Text reproduced unmodified from the WHO ICD-11 MMS tabular list (© World Health Organization, CC BY-ND 3.0 IGO). Not endorsed by WHO. ' +
      "For chapter 06, the full diagnostic requirements (essential features, boundaries, course and severity specifiers) are in WHO’s separate <i>Clinical Descriptions and Diagnostic Requirements for ICD-11 Mental, Behavioural or Neurodevelopmental Disorders</i> (CDDR, 2024).</p>" +
      "</article>";
    const copy = (txt, btn) => {
      const done = () => { btn.textContent = "Copied"; setTimeout(() => (btn.textContent = btn.id === "copyBtn" ? "Copy code" : "Copy code + title"), 1200); };
      try { navigator.clipboard.writeText(txt).then(done, () => fallbackCopy(txt, done)); } catch (e) { fallbackCopy(txt, done); }
    };
    const cb = $("copyBtn"); if (cb) cb.onclick = () => copy(r[CODE], cb);
    const cf = $("copyFullBtn"); cf.onclick = () => copy((r[CODE] ? r[CODE] + " " : "") + r[TITLE], cf);
  }
  function fallbackCopy(txt, done) {
    const ta = document.createElement("textarea");
    ta.value = txt; document.body.appendChild(ta); ta.select();
    try { document.execCommand("copy"); done(); } catch (e) { /* user can select manually */ }
    ta.remove();
  }

  function go(key, fromHashChange) {
    if (!byKey.has(key)) return;
    current = key;
    if (!fromHashChange && location.hash !== "#" + toHash(key)) {
      try { history.pushState(null, "", "#" + toHash(key)); } catch (e) { location.hash = toHash(key); }
    }
    const r = rows[byKey.get(key)];
    document.title = (r[CODE] ? r[CODE] + " " : "") + r[TITLE] + " · ICD-11 Explorer";
    renderEntry(key);
    $("main").scrollTop = 0;
    if (searching()) {
      list.querySelectorAll(".row.sel").forEach((e) => e.classList.remove("sel"));
      const el = rowEls.get(key); if (el) el.classList.add("sel");
    } else reveal(key);
    loadChapter(r[CH]).then(() => { if (current === key) renderEntry(key); }).catch(() => {
      if (current === key) sheet.querySelector(".nodesc") && (sheet.querySelector(".nodesc").textContent = "Description file could not be loaded.");
    });
  }
  function fromLocation() {
    const h = decodeURIComponent(location.hash.slice(1));
    const key = h ? fromHash(h) : "";
    go(byKey.has(key) ? key : "CH06", true);
  }
  window.addEventListener("hashchange", fromLocation);
  window.addEventListener("popstate", fromLocation);

  /* ---------- drawer (phones) ---------- */
  const mq = window.matchMedia("(max-width: 820px)");
  function openDrawer() { if (mq.matches) { document.body.classList.add("drawer"); $("scrim").hidden = false; } }
  function closeDrawer() { document.body.classList.remove("drawer"); $("scrim").hidden = true; }
  $("menuBtn").addEventListener("click", () => (document.body.classList.contains("drawer") ? closeDrawer() : openDrawer()));
  $("scrim").addEventListener("click", closeDrawer);
  sheet.addEventListener("click", (e) => { if (e.target.closest("a[href^='#']")) closeDrawer(); });

  /* ---------- quick links ---------- */
  function findBlock(title) {
    for (let i = 0; i < rows.length; i++) if (rows[i][CH] === "06" && rows[i][TITLE] === title) return rows[i][K];
    return null;
  }
  const quick = [["CH06", "Ch 06", "Mental"], [findBlock("Schizophrenia or other primary psychotic disorders"), "", "Psychosis"],
    [findBlock("Mood disorders"), "", "Mood"], [findBlock("Anxiety or fear-related disorders"), "", "Anxiety"],
    [findBlock("Disorders due to substance use or addictive behaviours"), "", "Substance"],
    [findBlock("Personality disorders and related traits"), "", "Personality"], [findBlock("Neurocognitive disorders"), "", "Neurocognitive"]];
  $("chips").innerHTML = quick.filter((x) => x[0]).map(([k, b, t]) => '<button class="chip" type="button" data-k="' + esc(k) + '">' + (b ? "<b>" + b + "</b>" : "") + t + "</button>").join("");
  $("chips").addEventListener("click", (e) => {
    const c = e.target.closest(".chip"); if (!c) return;
    if (searching()) { q.value = ""; }
    expanded.add(c.dataset.k); go(c.dataset.k); renderTree();
  });

  /* ---------- boot ---------- */
  $("rel").textContent = "MMS " + IX.release;
  onlyCh6.checked = !!store("icd11.ch6");
  expanded.add("CH06");
  renderTree();
  fromLocation();
  if (store("icd11.fulltext")) { fulltext.checked = true; fulltext.dispatchEvent(new Event("change")); }
})();
