/* Only Three: write down what's on your mind, keep one list of tasks, and pick up to three to do now.
   Everything is stored on this device (localStorage). No account, no server. */
(() => {
  "use strict";
  const CFG = window.ONLY_THREE || {};
  const KEY = "onlythree.v2";
  const NOW_MAX = 3;
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const ICON = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.2 4.2L19 7"/></svg>',
    del: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/></svg>',
  };

  // ------------------------------------------------------------ state
  const fresh = () => ({ v: 2, tasks: [], thoughts: [], log: {}, draft: "", settings: { remind: "21:00", dayStart: 4, theme: "auto" }, created: Date.now() });
  let S;
  try { S = JSON.parse(localStorage.getItem(KEY)) || fresh(); } catch { S = fresh(); }
  S = Object.assign(fresh(), S); S.settings = Object.assign(fresh().settings, S.settings);
  let storageOk = true;
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { storageOk = false; } };

  // ------------------------------------------------------------ dates (a "day" starts at 4am)
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const dayOf = (ms) => ymd(new Date(ms - S.settings.dayStart * 3600e3));
  const today = () => dayOf(Date.now());
  const parse = (k) => { const [y, m, d] = k.split("-").map(Number); return new Date(y, m - 1, d, 12); };
  const addDays = (k, n) => { const d = parse(k); d.setDate(d.getDate() + n); return ymd(d); };
  const fmt = (k, o) => parse(k).toLocaleDateString(undefined, o);
  const when = (ms) => {
    const k = dayOf(ms), t = today(), time = new Date(ms).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
    if (k === t) return `Today, ${time}`;
    if (k === addDays(t, -1)) return `Yesterday, ${time}`;
    return `${fmt(k, { month: "short", day: "numeric" })}, ${time}`;
  };

  // ------------------------------------------------------------ tasks
  // "Now" shows the open tasks pinned to now, plus today's finished ones while there's room (never more than three cards)
  const nowList = () => {
    const open = S.tasks.filter((t) => t.now && !t.done);
    const won = S.tasks.filter((t) => t.now && t.done && dayOf(t.doneAt) === today()).sort((a, b) => b.doneAt - a.doneAt);
    return [...open, ...won.slice(0, Math.max(0, NOW_MAX - open.length))].sort((a, b) => a.nowAt - b.nowAt);
  };
  const nowOpen = () => S.tasks.filter((t) => t.now && !t.done).length;
  const openTasks = () => S.tasks.filter((t) => !t.done);
  const doneTasks = () => S.tasks.filter((t) => t.done).sort((a, b) => b.doneAt - a.doneAt);
  const task = (id) => S.tasks.find((t) => t.id === id);
  const lines = (s) => s.split("\n").map((x) => x.trim()).filter(Boolean);

  function addTasks(text, toNow) {
    let n = 0, overflow = 0;
    for (const line of lines(text)) {
      const t = { id: uid(), text: line, created: Date.now(), done: false, doneAt: null, now: false, nowAt: 0 };
      if (toNow && nowOpen() < NOW_MAX) { t.now = true; t.nowAt = Date.now() + n; } else if (toNow) overflow++;
      S.tasks.unshift(t); n++;
    }
    save();
    return { n, overflow };
  }
  function setDone(t, done) {
    if (t.done === done) return;
    const k = today();
    if (done) { t.done = true; t.doneAt = Date.now(); if (t.now) S.log[k] = (S.log[k] || 0) + 1; }
    else { if (t.now && dayOf(t.doneAt) === k) S.log[k] = Math.max(0, (S.log[k] || 0) - 1); t.done = false; t.doneAt = null; }
    save();
  }
  function setNow(t, on) {
    if (on && !t.now && nowOpen() >= NOW_MAX) { toast(`Now holds ${NOW_MAX}. Finish one or move one back first.`); return false; }
    t.now = on; t.nowAt = on ? Date.now() : 0;
    if (on && t.done) setDone(t, false);
    save(); return true;
  }

  // streak = days in a row with at least one "Now" task finished
  function streak() {
    let k = today(), s = 0;
    if (!S.log[k]) k = addDays(k, -1);
    while (S.log[k] > 0) { s++; k = addDays(k, -1); }
    return s;
  }
  function bestStreak() {
    let best = 0, run = 0, prev = null;
    for (const k of Object.keys(S.log).sort()) {
      if (S.log[k] > 0) { run = prev && addDays(prev, 1) === k ? run + 1 : 1; best = Math.max(best, run); prev = k; } else { run = 0; prev = null; }
    }
    return best;
  }

  // ------------------------------------------------------------ toast (with undo) and sheet
  let toastT, undoFn = null;
  function toast(msg, undo) {
    const t = $("#toast"); undoFn = undo || null;
    t.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button data-undo>Undo</button>' : ""}`; t.hidden = false;
    clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; undoFn = null; }, undo ? 5000 : 2200);
  }
  $("#toast").addEventListener("click", (e) => { if (e.target.closest("[data-undo]") && undoFn) { undoFn(); undoFn = null; $("#toast").hidden = true; render(); } });

  function openSheet(html, mount) {
    const sh = $("#sheet"); sh.innerHTML = html; sh.hidden = false; $("#scrim").hidden = false; mount && mount(sh);
  }
  function closeSheet() { $("#sheet").hidden = true; $("#scrim").hidden = true; $("#sheet").innerHTML = ""; }
  $("#scrim").addEventListener("click", closeSheet);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#sheet").hidden) closeSheet(); });

  function removeTask(t) {
    const i = S.tasks.indexOf(t); if (i < 0) return;
    S.tasks.splice(i, 1); save(); render();
    toast("Task deleted", () => { S.tasks.splice(i, 0, t); save(); });
  }
  function removeThought(th) {
    const i = S.thoughts.indexOf(th); if (i < 0) return;
    S.thoughts.splice(i, 1); save(); render();
    toast("Thought deleted", () => { S.thoughts.splice(i, 0, th); save(); });
  }

  function taskSheet(t) {
    openSheet(`<h3>Task</h3><textarea id="ed" rows="2" aria-label="Task">${esc(t.text)}</textarea>
      <div class="actions">
        <button class="btn ghost" data-a="now">${t.now ? "Move back to Tasks" : "Do it now"}</button>
        <button class="btn ghost" data-a="done">${t.done ? "Not done" : "Mark done"}</button>
        <button class="btn ghost" data-a="del">Delete</button>
        <button class="btn" data-a="ok">Save</button>
      </div>`, (sh) => {
      const ed = $("#ed", sh);
      const commit = () => { const v = ed.value.trim(); if (v) t.text = v.replace(/\s*\n\s*/g, " "); save(); };
      ed.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); commit(); closeSheet(); render(); } });
      sh.onclick = (e) => {
        const a = e.target.closest("[data-a]")?.dataset.a; if (!a) return;
        commit();
        if (a === "now") setNow(t, !t.now);
        if (a === "done") setDone(t, !t.done);
        closeSheet();
        if (a === "del") removeTask(t); else render();
      };
    });
  }
  function thoughtSheet(th) {
    openSheet(`<h3>Thought</h3><textarea id="ed" rows="5" aria-label="Thought">${esc(th.text)}</textarea>
      <div class="actions"><button class="btn ghost" data-a="task">Turn into task</button><button class="btn ghost" data-a="del">Delete</button><button class="btn" data-a="ok">Save</button></div>`, (sh) => {
      const ed = $("#ed", sh);
      sh.onclick = (e) => {
        const a = e.target.closest("[data-a]")?.dataset.a; if (!a) return;
        const v = ed.value.trim(); if (v) th.text = v; save(); closeSheet();
        if (a === "del") removeThought(th);
        else if (a === "task") { addTasks(th.text, false); toast("Added to Tasks"); render(); }
        else render();
      };
    });
  }

  // ------------------------------------------------------------ views
  let tab = "home";
  function go(t) { tab = t; render(); window.scrollTo(0, 0); }
  $("#tabs").addEventListener("click", (e) => { const b = e.target.closest("[data-tab]"); if (b) go(b.dataset.tab); });

  function render() {
    for (const b of document.querySelectorAll("#tabs [data-tab]")) {
      if (b.dataset.tab === tab) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
    }
    const n = openTasks().length, tb = $('#tabs [data-tab="tasks"]');
    tb.querySelector(".n")?.remove(); if (n) tb.insertAdjacentHTML("beforeend", `<span class="n">${n > 99 ? "99+" : n}</span>`);
    ({ home: viewHome, tasks: viewTasks, thoughts: viewThoughts, more: viewMore })[tab]();
  }

  function viewHome() {
    const k = today(), now = nowList(), st = streak(), waiting = openTasks().filter((t) => !t.now).length;
    const done = now.filter((t) => t.done).length;
    const slots = [];
    for (let i = now.length; i < NOW_MAX; i++)
      slots.push(`<button class="slot" data-pick><span class="num">${i + 1}</span><span>${i > now.length ? "" : waiting ? "Pick from your tasks" : "Write a task above and tap Do now"}</span></button>`);
    $("#view").innerHTML = `
      <header class="top"><div><h1>${fmt(k, { weekday: "long" })}</h1><div class="sub">${fmt(k, { month: "long", day: "numeric" })}</div></div>
        ${st ? `<span class="chip"><span class="dot"></span>${st}-day streak</span>` : ""}</header>
      <div class="write">
        <textarea id="w" placeholder="What's on your mind?" aria-label="Write a thought or task">${esc(S.draft)}</textarea>
        <div class="acts"><button data-w="thought">Save thought</button><button data-w="task">Add to tasks</button><button class="pri" data-w="now">Do now</button></div>
      </div>
      <div class="h2"><h2>Now${now.length ? ` · ${done} of ${now.length} done` : ""}</h2>${waiting ? `<button class="linkish" data-go="tasks">${waiting} more in Tasks</button>` : ""}</div>
      <div class="three">
        ${now.map((t, i) => `<div class="item${t.done ? " done" : ""}" data-id="${t.id}"><div class="num">${i + 1}</div>
          <button class="text" data-open="${t.id}">${esc(t.text)}</button>
          <button class="check" data-toggle="${t.id}" aria-label="${t.done ? "Mark not done" : "Mark done"}">${ICON.check}</button></div>`).join("")}
        ${slots.join("")}
      </div>
      ${now.length && done === now.length ? `<div class="finished"><b>That's the day.</b><span>Everything else can wait.</span></div>` : ""}
      ${!storageOk ? '<p class="fine">This browser is blocking storage, so nothing will be saved. Try a normal (non-private) window.</p>' : ""}`;
    const w = $("#w"); grow(w); syncWrite();
    if (!matchMedia("(pointer: coarse)").matches) w.focus({ preventScroll: true }); // desktop: ready to type at once
  }

  function grow(t) { t.style.height = "auto"; t.style.height = Math.max(92, t.scrollHeight) + "px"; }
  function syncWrite() { const has = !!$("#w")?.value.trim(); for (const b of document.querySelectorAll("[data-w]")) b.disabled = !has; }

  function viewTasks() {
    const open = openTasks().sort((a, b) => (b.now - a.now) || (b.now ? a.nowAt - b.nowAt : b.created - a.created)), dn = doneTasks();
    const row = (t) => `<li class="row${t.done ? " done" : ""}" data-id="${t.id}">
        <button class="check" data-toggle="${t.id}" aria-label="${t.done ? "Mark not done" : "Mark done"}">${ICON.check}</button>
        <button class="t" data-open="${t.id}">${esc(t.text)}</button>
        <span class="tools">${t.done ? "" : `<button class="pill${t.now ? " on" : ""}" data-now="${t.id}" aria-pressed="${t.now}">Now</button>`}
        <button class="ic" data-del="${t.id}" aria-label="Delete">${ICON.del}</button></span></li>`;
    $("#view").innerHTML = `
      <header class="top"><div><h1>Tasks</h1><div class="sub">${open.length} to do · ${nowOpen()} of ${NOW_MAX} in Now</div></div></header>
      <form class="add" id="addTask"><input id="nt" placeholder="Add a task…" autocomplete="off" enterkeyhint="done" aria-label="New task"><button class="btn">Add</button></form>
      ${open.length ? `<ul class="rows">${open.map(row).join("")}</ul>` : `<div class="empty">Nothing to do. Add a task above.</div>`}
      ${dn.length ? `<div class="h2"><h2>Done · ${dn.length}</h2><button class="linkish" data-clear>Clear done</button></div><ul class="rows">${dn.slice(0, 50).map(row).join("")}</ul>` : ""}`;
  }

  function viewThoughts() {
    const T = S.thoughts;
    $("#view").innerHTML = `
      <header class="top"><div><h1>Thoughts</h1><div class="sub">${T.length} saved</div></div><button class="linkish" data-go="home">Write</button></header>
      ${T.length ? T.map((th) => `<div class="thought"><div class="when">${when(th.at)}</div>
        <button class="body" data-th="${th.id}">${esc(th.text)}</button>
        <div class="tools"><button class="linkish" data-th2task="${th.id}">Make a task</button><button class="linkish" style="color:var(--muted)" data-thdel="${th.id}">Delete</button></div></div>`).join("")
      : `<div class="empty">Ideas, worries, things to remember. Write them on the Now screen and tap Save thought.</div>`}`;
  }

  let installEvt = null;
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvt = e; if (tab === "more") render(); });

  function viewMore() {
    const k = today(), days = [...Array(7)].map((_, n) => addDays(k, n - 6));
    const wk = days.reduce((a, d) => a + (S.log[d] || 0), 0);
    const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const wl = CFG.waitlistUrl || `mailto:${CFG.contactEmail}?subject=${encodeURIComponent("Only Three phone app")}`;
    $("#view").innerHTML = `
      <header class="top"><div><h1>Your week</h1><div class="sub">${fmt(days[0], { month: "short", day: "numeric" })} – ${fmt(k, { month: "short", day: "numeric" })}</div></div></header>
      <div class="stats"><div class="stat"><b>${wk}</b><span>Now tasks done</span></div><div class="stat"><b>${streak()}</b><span>day streak</span></div><div class="stat"><b>${bestStreak()}</b><span>best streak</span></div></div>
      <div class="week">${days.map((d) => `<div class="d${d === k ? " today" : ""}">${fmt(d, { weekday: "narrow" })}${[0, 1, 2].map((i) => `<i class="${(S.log[d] || 0) > i ? "f" : ""}"></i>`).join("")}</div>`).join("")}</div>
      <div style="margin-top:14px"><button class="btn ghost" data-share ${wk ? "" : "disabled"} style="min-height:42px">Share my week</button></div>
      ${standalone ? "" : `<div class="h2"><h2>Put it on your home screen</h2></div><div class="set" style="border-top:1px solid var(--line)"><span>${installEvt ? "Install Only Three like an app." : ios ? "In Safari, tap <b>Share</b>, then <b>Add to Home Screen</b>." : "In your browser menu, tap <b>Install app</b> or <b>Add to Home screen</b>."}</span>${installEvt ? '<button class="btn" data-install style="min-height:40px">Install</button>' : ""}</div>`}
      <div class="h2"><h2>Settings</h2></div>
      <div class="set" style="border-top:1px solid var(--line)"><div>Daily reminder<small>Adds a repeating event to your calendar</small></div><span><input type="time" id="rt" value="${S.settings.remind}" aria-label="Reminder time"> <button class="linkish" data-ics>Add</button></span></div>
      <div class="set"><div>Theme</div><select id="th"><option value="auto">Match device</option><option value="light">Light</option><option value="dark">Dark</option></select></div>
      <div class="set"><div>Back up<small>Everything lives only on this device</small></div><button class="linkish" data-export>Download</button></div>
      <div class="set"><div>Restore<small>From a backup file</small></div><button class="linkish" data-import>Choose file</button></div>
      <div class="set"><div>Erase everything</div><button class="linkish" data-reset style="color:#b42318">Erase</button></div>
      <div class="h2"><h2>Phone app</h2></div>
      <div class="set" style="border-top:1px solid var(--line)"><div>A phone app with widgets and reminders is planned.<small>Want it? Join the waitlist.</small></div><a class="btn ghost" style="min-height:40px" href="${esc(wl)}" target="_blank" rel="noopener">Join</a></div>
      <p class="fine">Only Three is free while in early access. No account, no ads, and nothing leaves your device.
        Questions or ideas: <a href="mailto:${esc(CFG.contactEmail)}">${esc(CFG.contactEmail)}</a> · <a href="./">About</a></p>
      <input type="file" id="imp" accept="application/json,.json" hidden>`;
    $("#th").value = S.settings.theme;
  }

  // ------------------------------------------------------------ events (delegated, one listener per kind)
  const V = $("#view");
  const touch = () => matchMedia("(pointer: coarse)").matches;
  V.addEventListener("input", (e) => {
    if (e.target.id === "w") { S.draft = e.target.value; save(); grow(e.target); syncWrite(); }
  });
  // on phones, hide the tab bar while the keyboard is up so the write box has room
  V.addEventListener("focusin", (e) => { if (e.target.matches("textarea, input") && touch()) document.body.classList.add("typing"); });
  V.addEventListener("focusout", () => document.body.classList.remove("typing"));
  V.addEventListener("keydown", (e) => {
    if (e.target.id === "w" && e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); write("thought"); }
  });
  V.addEventListener("submit", (e) => {
    e.preventDefault();
    if (addTasks($("#nt").value, false).n) { render(); $("#nt").focus(); }
  });
  V.addEventListener("change", (e) => {
    if (e.target.id === "rt") { S.settings.remind = e.target.value || "21:00"; save(); }
    if (e.target.id === "th") { S.settings.theme = e.target.value; save(); applyTheme(); }
    if (e.target.id === "imp" && e.target.files[0]) importData(e.target.files[0]);
  });
  // keep the keyboard open when tapping the write buttons (mousedown would blur the textarea first)
  V.addEventListener("mousedown", (e) => { if (e.target.closest("[data-w]")) e.preventDefault(); });
  V.addEventListener("click", (e) => {
    const b = e.target.closest("button,a"); if (!b) return;
    const d = b.dataset;
    if (d.w) write(d.w);
    else if (d.toggle) {
      const t = task(d.toggle); setDone(t, !t.done); render();
      const el = V.querySelector(`[data-id="${t.id}"]`); el && el.classList.add("just");
      if (t.done && navigator.vibrate) navigator.vibrate(10);
      if (t.done && t.now && tab === "home" && nowList().every((x) => x.done)) toast(streak() > 1 ? `All done. ${streak()} days in a row.` : "All done. Nice.");
    }
    else if (d.open) taskSheet(task(d.open));
    else if (d.now) { const t = task(d.now); if (setNow(t, !t.now)) { render(); if (t.now) toast("Moved to Now"); } }
    else if (d.del) removeTask(task(d.del));
    else if ("pick" in d) go("tasks");
    else if (d.go) go(d.go);
    else if ("clear" in d) {
      const gone = doneTasks(); if (!gone.length) return;
      S.tasks = S.tasks.filter((t) => !t.done); save(); render();
      toast(`Cleared ${gone.length} done`, () => { S.tasks.push(...gone); save(); });
    }
    else if (d.th) thoughtSheet(S.thoughts.find((x) => x.id === d.th));
    else if (d.th2task) { const th = S.thoughts.find((x) => x.id === d.th2task); addTasks(th.text, false); toast("Added to Tasks"); render(); }
    else if (d.thdel) removeThought(S.thoughts.find((x) => x.id === d.thdel));
    else if ("share" in d) shareWeek();
    else if ("ics" in d) downloadIcs();
    else if ("export" in d) downloadBlob(new Blob([JSON.stringify(S, null, 1)], { type: "application/json" }), `only-three-backup-${today()}.json`);
    else if ("import" in d) $("#imp").click();
    else if ("reset" in d) { if (confirm("Erase all your tasks, thoughts and history on this device? This can't be undone.")) { S = fresh(); save(); applyTheme(); go("home"); } }
    else if ("install" in d && installEvt) { installEvt.prompt(); installEvt = null; }
  });

  function write(kind) {
    const w = $("#w"), text = w.value.trim(); if (!text) return;
    if (kind === "thought") { S.thoughts.unshift({ id: uid(), text, at: Date.now() }); toast("Saved to Thoughts"); }
    else {
      const r = addTasks(text, kind === "now");
      toast(kind === "now" ? (r.overflow ? `Now is full. ${r.overflow === r.n ? "Added" : r.overflow + " added"} to Tasks.` : "Added to Now") : (r.n > 1 ? `${r.n} tasks added` : "Added to Tasks"));
    }
    S.draft = ""; save(); render();
    if (!touch()) $("#w")?.focus();
  }

  // ------------------------------------------------------------ theme, share card, calendar, backup
  function applyTheme() {
    const t = S.settings.theme;
    if (t === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", t);
  }
  async function shareWeek() {
    try { await document.fonts.load("400 80px Fraunces"); } catch {}
    const W = 1080, H = 1350, c = document.createElement("canvas"); c.width = W; c.height = H;
    const g = c.getContext("2d"), serif = "Fraunces, Georgia, serif", sans = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
    const grad = g.createRadialGradient(W / 2, 0, 50, W / 2, 200, 1200);
    grad.addColorStop(0, "#2a2440"); grad.addColorStop(.7, "#17151f"); g.fillStyle = grad; g.fillRect(0, 0, W, H);
    const k = today(), days = [...Array(7)].map((_, n) => addDays(k, n - 6));
    g.textAlign = "center"; g.fillStyle = "#f1ece2"; g.font = `400 76px ${serif}`; g.fillText("My week, in threes", W / 2, 230);
    const x0 = 150, step = (W - 300) / 6; let tot = 0;
    days.forEach((d, n) => {
      const x = x0 + n * step, v = S.log[d] || 0; tot += v;
      g.fillStyle = "#a49cae"; g.font = `600 30px ${sans}`; g.fillText(fmt(d, { weekday: "short" }).slice(0, 3).toUpperCase(), x, 400);
      for (let r = 0; r < 3; r++) {
        const y = 490 + r * 120; g.beginPath(); g.arc(x, y, 36, 0, Math.PI * 2);
        if (v > r) { g.shadowColor = "rgba(243,200,115,.6)"; g.shadowBlur = 40; g.fillStyle = "#f3c873"; g.fill(); g.shadowBlur = 0; }
        else { g.lineWidth = 4; g.strokeStyle = "#3a3450"; g.stroke(); }
      }
    });
    g.fillStyle = "#f3c873"; g.font = `400 150px ${serif}`; g.fillText(String(tot), W / 2, 1020);
    g.fillStyle = "#f1ece2"; g.font = `500 40px ${sans}`; g.fillText(tot === 1 ? "thing that mattered, done" : "things that mattered, done", W / 2, 1090);
    const s = streak(); if (s > 1) { g.fillStyle = "#a49cae"; g.font = `500 34px ${sans}`; g.fillText(`${s}-day streak`, W / 2, 1150); }
    g.fillStyle = "#a49cae"; g.font = `600 30px ${sans}`; g.fillText("ONLY THREE", W / 2, 1270);
    const blob = await new Promise((res) => c.toBlob(res, "image/png"));
    const file = new File([blob], "my-week-only-three.png", { type: "image/png" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: "My week, in threes" }); return; } catch (e) { if (e.name === "AbortError") return; }
    }
    downloadBlob(blob, file.name); toast("Image saved");
  }
  function downloadBlob(blob, name) {
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function downloadIcs() {
    const [h, m] = S.settings.remind.split(":"), d = new Date();
    const url = location.href.split("#")[0].split("?")[0];
    const ics = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Only Three//EN", "BEGIN:VEVENT", `UID:${uid()}@onlythree`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`, `DTSTART:${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${h}${m}00`,
      "DURATION:PT5M", "RRULE:FREQ=DAILY", "SUMMARY:Pick your three for tomorrow", `DESCRIPTION:Open Only Three: ${url}`, `URL:${url}`,
      "BEGIN:VALARM", "ACTION:DISPLAY", "DESCRIPTION:Pick your three for tomorrow", "TRIGGER:PT0M", "END:VALARM", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    downloadBlob(new Blob([ics], { type: "text/calendar" }), "only-three-reminder.ics");
    toast("Open the file to add it to your calendar");
  }
  function importData(f) {
    const rd = new FileReader();
    rd.onload = () => {
      try {
        const d = JSON.parse(rd.result);
        if (!d || !Array.isArray(d.tasks) || !Array.isArray(d.thoughts)) throw 0;
        if (!confirm("Replace everything on this device with this backup?")) return;
        S = Object.assign(fresh(), d); S.settings = Object.assign(fresh().settings, d.settings || {});
        save(); applyTheme(); go("home"); toast("Backup restored");
      } catch { toast("That file isn't an Only Three backup"); }
    };
    rd.readAsText(f);
  }

  // ------------------------------------------------------------ start
  applyTheme();
  const q = new URLSearchParams(location.search);
  if (["tasks", "thoughts", "more"].includes(q.get("tab"))) tab = q.get("tab");
  render();
  if (q.has("write") && tab === "home") $("#w").focus();
  // coming back to the app on a new day: refresh, unless the person is typing
  let lastDay = today();
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && today() !== lastDay) { lastDay = today(); if (!document.activeElement?.matches("textarea,input")) render(); }
  });
  if ("serviceWorker" in navigator && location.protocol !== "file:") addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  if (CFG.goatcounter) {
    const s = document.createElement("script"); s.async = true; s.src = "//gc.zgo.at/count.js";
    s.dataset.goatcounter = `https://${CFG.goatcounter}.goatcounter.com/count`; document.body.appendChild(s);
  }
})();
