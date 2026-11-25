/* ==========================================================================
   Updatini — OTA update console
   Vanilla JS, no build step. Talks to the Worker API with a Bearer token.
   ========================================================================== */

(() => {
  "use strict";

  const PART_SIZE = 10 * 1024 * 1024;
  const TOKEN_KEY = "updatini.token";
  const DEFAULT_COMPATIBLE = "raspberrypi3-64";
  const BASE_TITLE = "Updatini · OTA update console";
  const REDUCED = Boolean(
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /* ---------- icon snippets (static markup only) ---------- */
  const IC = {
    check: '<svg class="ic" aria-hidden="true"><use href="#i-check"/></svg>',
    x: '<svg class="ic" aria-hidden="true"><use href="#i-x"/></svg>',
    alert: '<svg class="ic" aria-hidden="true"><use href="#i-alert"/></svg>',
    info: '<svg class="ic" aria-hidden="true"><use href="#i-info"/></svg>',
    copy: '<svg class="ic" aria-hidden="true"><use href="#i-copy"/></svg>',
    package: '<svg class="ic" aria-hidden="true"><use href="#i-package"/></svg>',
    search: '<svg class="ic" aria-hidden="true"><use href="#i-search"/></svg>',
    lock: '<svg class="ic" aria-hidden="true"><use href="#i-lock"/></svg>',
  };

  const el = {
    token: $("#tok"),
    conn: $("#conn"),
    connBtn: $("#connBtn"),
    connLabel: $("#connLabel"),
    reveal: $("#reveal"),

    drop: $("#drop"),
    file: $("#file"),
    fileName: $("#fileName"),
    fileSize: $("#fileSize"),
    removeFile: $("#removeFile"),
    autoTag: $("#autoTag"),
    ver: $("#ver"),
    comp: $("#comp"),
    board: $("#board"),
    boardReveal: $("#boardReveal"),
    seg: $("#seg"),
    verErr: $("#verErr"),
    compErr: $("#compErr"),
    boardErr: $("#boardErr"),

    go: $("#go"),
    goText: $("#goText"),
    reset: $("#reset"),
    progress: $("#progress"),
    stagePill: $("#stagePill"),
    pct: $("#pct"),
    fill: $("#fill"),
    progressDetail: $("#progressDetail"),
    progressEta: $("#progressEta"),

    pipe: $("#pipe"),
    pipeFill: $("#pipeFill"),
    pipeStatus: $("#pipeStatus"),

    history: $("#history"),
    tableWrap: $("#tableWrap"),
    rows: $("#rows"),
    histState: $("#histState"),
    stateArt: $("#stateArt"),
    stateTitle: $("#stateTitle"),
    stateText: $("#stateText"),
    stateBtn: $("#stateBtn"),
    count: $("#count"),
    q: $("#q"),
    refresh: $("#refresh"),

    statReleases: $("#statReleases"),
    statSize: $("#statSize"),
    sizeUnit: $("#sizeUnit"),
    statBoards: $("#statBoards"),
    statLatest: $("#statLatest"),

    toasts: $("#toasts"),
  };

  const targetRadios = $$('input[name="target"]');
  const pipeSteps = $$(".pipe .step");

  const state = {
    token: readToken(),
    connected: false,
    loading: false,
    uploading: false,
    bundles: [],
    file: null,
    runId: 0,
    stat: { releases: null, size: null, boards: null, latest: null },
  };

  const PIPE = { done: 0, active: -1, error: false };

  /* ======================================================================
     Small utilities
     ====================================================================== */

  function readToken() {
    try {
      return sessionStorage.getItem(TOKEN_KEY) || "";
    } catch {
      return "";
    }
  }

  function saveToken(value) {
    try {
      if (value) sessionStorage.setItem(TOKEN_KEY, value);
      else sessionStorage.removeItem(TOKEN_KEY);
    } catch {
      /* private mode — token simply won't persist */
    }
  }

  function formatBytes(bytes) {
    const n = Number(bytes) || 0;
    if (n < 1024) return `${Math.round(n)} B`;
    const units = ["KB", "MB", "GB", "TB"];
    let value = n;
    let index = -1;
    do {
      value /= 1024;
      index += 1;
    } while (value >= 1024 && index < units.length - 1);
    return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[index]}`;
  }

  function formatDuration(seconds) {
    if (!Number.isFinite(seconds) || seconds < 1) return "<1s";
    if (seconds < 60) return `${Math.ceil(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const rest = Math.ceil(seconds % 60);
    return `${minutes}m ${rest}s`;
  }

  function shorten(text, limit = 180) {
    const value = String(text || "").replace(/\s+/g, " ").trim();
    return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
  }

  function relTime(timestamp) {
    const then = Number(timestamp);
    if (!then) return "—";
    const diff = Math.max(0, Date.now() - then);
    const seconds = Math.round(diff / 1000);
    if (seconds < 45) return "just now";
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(then).toLocaleDateString(undefined, {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  }

  function absTime(timestamp) {
    const then = Number(timestamp);
    if (!then) return "—";
    return new Date(then).toLocaleString(undefined, {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function pulse(node) {
    node.classList.remove("is-pulsing");
    void node.offsetWidth;
    node.classList.add("is-pulsing");
    setTimeout(() => node.classList.remove("is-pulsing"), 900);
  }

  /* ======================================================================
     API
     ====================================================================== */

  function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set("authorization", `Bearer ${state.token}`);
    return fetch(path, { ...options, headers });
  }

  async function apiError(response, fallback) {
    let detail = "";
    try {
      const type = response.headers.get("content-type") || "";
      if (type.includes("application/json")) {
        const body = await response.json();
        if (body && body.error) detail = String(body.error);
      } else {
        detail = (await response.text()).slice(0, 160);
      }
    } catch {
      /* body already consumed or empty */
    }
    const error = new Error(detail || `${fallback} (HTTP ${response.status})`);
    error.status = response.status;
    return error;
  }

  /* ======================================================================
     Toasts
     ====================================================================== */

  const TOAST_ICON = {
    success: IC.check,
    error: IC.alert,
    info: IC.info,
  };

  function toast(message, type = "info", timeout = 4800) {
    const node = document.createElement("div");
    node.className = `toast toast-${type}`;
    node.style.setProperty("--t", `${timeout}ms`);
    node.innerHTML = `<span class="toast-ic">${TOAST_ICON[type] || TOAST_ICON.info}</span>`;

    const text = document.createElement("p");
    text.className = "toast-msg";
    text.textContent = message;

    const close = document.createElement("button");
    close.type = "button";
    close.className = "toast-x";
    close.setAttribute("aria-label", "Dismiss notification");
    close.innerHTML = IC.x;

    node.append(text, close);
    el.toasts.append(node);
    while (el.toasts.children.length > 4) el.toasts.firstElementChild.remove();

    requestAnimationFrame(() => node.classList.add("in"));

    let dismissed = false;
    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;
      clearTimeout(timer);
      node.classList.remove("in");
      node.classList.add("out");
      setTimeout(() => node.remove(), 360);
    };
    const timer = setTimeout(dismiss, timeout);
    close.addEventListener("click", dismiss);
  }

  /* ======================================================================
     Connection state
     ====================================================================== */

  const CONN_LABEL = {
    idle: "Connect",
    connecting: "Connecting",
    connected: "Connected",
    error: "Reconnect",
  };

  function setConn(status, label) {
    el.conn.dataset.state = status;
    el.connLabel.textContent = label || CONN_LABEL[status] || "Connect";
    el.connBtn.disabled = status === "connecting";
  }

  async function connect() {
    const candidate = el.token.value.trim();
    el.token.classList.remove("invalid");

    if (!candidate) {
      el.token.focus();
      el.token.classList.add("invalid");
      setTimeout(() => el.token.classList.remove("invalid"), 600);
      toast("Enter your admin token to connect.", "error", 3600);
      return;
    }

    const changed = candidate !== state.token;
    state.token = candidate;
    setConn("connecting");

    const ok = await refreshBundles({ quiet: false, initial: !state.connected });
    if (ok) {
      toast(changed ? "Token updated. Releases loaded." : "Connected. Releases loaded.", "success", 2800);
    }
  }

  async function refreshBundles({ quiet = false, initial = false, newKey = null } = {}) {
    if (!state.token) {
      setConn("idle");
      showState("locked");
      return false;
    }

    if (initial) {
      skeleton();
    }
    setLoading(true);

    try {
      const response = await api("/api/bundles");
      if (response.status === 401) {
        saveToken("");
        state.connected = false;
        setConn("error", "Token rejected");
        if (state.bundles.length) {
          toast("Admin token rejected — the list below may be stale.", "error", 6000);
        } else {
          showState("rejected");
        }
        if (!quiet) toast("That admin token was rejected.", "error", 5200);
        return false;
      }
      if (!response.ok) throw await apiError(response, "Could not load releases");

      const list = await response.json();
      if (!Array.isArray(list)) throw new Error("Unexpected response from the update API.");

      state.connected = true;
      saveToken(state.token);
      setConn("connected");
      applyBundles(list, { newKey });
      return true;
    } catch (error) {
      state.connected = false;
      setConn("error", "Offline");
      if (state.bundles.length) {
        toast("Couldn't refresh releases. Showing the last load.", "error", 5000);
      } else {
        showState("error");
        if (!quiet) {
          toast(shorten(error.message || "The update API did not respond.", 160), "error", 6000);
        }
      }
      return false;
    } finally {
      setLoading(false);
    }
  }

  function setLoading(on) {
    state.loading = on;
    el.refresh.classList.toggle("is-spinning", on);
    el.refresh.disabled = on;
    el.history.setAttribute("aria-busy", on ? "true" : "false");
  }

  /* ======================================================================
     Stats
     ====================================================================== */

  function paintStats(list) {
    const total = list.length;
    const bytes = list.reduce((sum, bundle) => sum + (Number(bundle.size) || 0), 0);
    const boards = new Set(
      list
        .filter((bundle) => String(bundle.target || "").startsWith("board:"))
        .map((bundle) => bundle.target)
    ).size;
    const latest = total ? String(list[0].version || "—") : "—";

    animateStat("releases", el.statReleases, total, 0);
    animateStat("boards", el.statBoards, boards, 0);

    if (bytes > 0) {
      const useGB = bytes >= 1024 * 1024 * 1024;
      const unit = useGB ? "GB" : "MB";
      if (el.sizeUnit.dataset.unit !== unit) {
        el.sizeUnit.dataset.unit = unit;
        el.sizeUnit.textContent = unit;
        state.stat.size = null;
      }
      el.sizeUnit.hidden = false;
      animateStat("size", el.statSize, useGB ? bytes / 1073741824 : bytes / 1048576, useGB ? 2 : 1);
    } else {
      if (el.statSize._raf) cancelAnimationFrame(el.statSize._raf);
      el.statSize._raf = null;
      state.stat.size = 0;
      el.statSize.textContent = "0";
      el.sizeUnit.hidden = true;
    }

    el.statLatest.textContent = latest;
    el.statLatest.classList.toggle("is-empty", latest === "—");
    if (state.stat.latest !== null && state.stat.latest !== latest && latest !== "—") {
      pulse(el.statLatest);
    }
    state.stat.latest = latest;
  }

  function animateStat(key, node, target, decimals) {
    const from = state.stat[key] == null ? 0 : state.stat[key];
    state.stat[key] = target;

    if (node._raf) cancelAnimationFrame(node._raf);
    node._raf = null;

    if (REDUCED || from === target) {
      node.textContent = target.toFixed(decimals);
      return;
    }

    const start = performance.now();
    const duration = 800;
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      node.textContent = (from + (target - from) * eased).toFixed(decimals);
      if (progress < 1) {
        node._raf = requestAnimationFrame(tick);
      } else {
        node._raf = null;
        node.textContent = target.toFixed(decimals);
      }
    };
    node._raf = requestAnimationFrame(tick);
  }

  /* ======================================================================
     Manifest preview
     ====================================================================== */

  const manifestFields = {};
  $$("[data-mf]").forEach((node) => {
    manifestFields[node.dataset.mf] = node;
  });

  function setManifest(name, value, tone) {
    const node = manifestFields[name];
    if (!node) return;
    if (node.textContent !== value) {
      node.textContent = value;
      node.classList.toggle("is-empty", value === "—");
      node.classList.remove("flash");
      void node.offsetWidth;
      node.classList.add("flash");
    }
    if (tone) node.dataset.tone = tone;
    else delete node.dataset.tone;
  }

  function paintManifest() {
    const file = state.file;
    const one = selectedTarget() === "one";
    const board = el.board.value.trim();
    setManifest("bundle", file ? file.name : "—");
    setManifest("version", el.ver.value.trim() || "—");
    setManifest("compatible", el.comp.value.trim() || "—");
    setManifest(
      "target",
      one ? (board ? `board · ${board}` : "single board") : "whole fleet",
      one ? "board" : "all"
    );
    setManifest("size", file ? formatBytes(file.size) : "—");
  }

  /* ======================================================================
     Target selector + board reveal
     ====================================================================== */

  function selectedTarget() {
    const checked = targetRadios.find((radio) => radio.checked);
    return checked ? checked.value : "all";
  }

  function syncTarget() {
    const one = selectedTarget() === "one";
    el.seg.style.setProperty("--i", one ? "1" : "0");
    el.boardReveal.classList.toggle("open", one);
    el.boardReveal.setAttribute("aria-hidden", one ? "false" : "true");
    el.boardReveal.inert = !one;
    paintManifest();
  }

  /* ======================================================================
     Field errors
     ====================================================================== */

  function errorNodeFor(input) {
    const id = input.getAttribute("aria-describedby");
    return id ? document.getElementById(id) : null;
  }

  function setFieldError(input, message) {
    input.classList.remove("invalid");
    void input.offsetWidth;
    input.classList.add("invalid");
    input.setAttribute("aria-invalid", "true");
    const node = errorNodeFor(input);
    if (node) {
      node.textContent = message;
      node.hidden = false;
    }
  }

  function clearFieldError(input) {
    input.classList.remove("invalid");
    input.removeAttribute("aria-invalid");
    const node = errorNodeFor(input);
    if (node) {
      node.hidden = true;
      node.textContent = "";
    }
  }

  function clearFieldErrors() {
    [el.ver, el.comp, el.board].forEach(clearFieldError);
  }

  /* ======================================================================
     File selection
     ====================================================================== */

  function rejectFile(message) {
    toast(message, "error", 5000);
    el.drop.classList.remove("is-invalid");
    void el.drop.offsetWidth;
    el.drop.classList.add("is-invalid");
    setTimeout(() => el.drop.classList.remove("is-invalid"), 700);
  }

  function acceptFile(file) {
    if (!file) return;
    if (!/\.raucb$/i.test(file.name)) {
      rejectFile("Choose a signed .raucb RAUC bundle.");
      return;
    }
    if (!file.size) {
      rejectFile("That file is empty.");
      return;
    }

    state.file = file;
    el.fileName.textContent = file.name;
    el.fileSize.textContent = formatBytes(file.size);
    el.drop.classList.add("has-file");
    el.drop.classList.remove("is-invalid");

    hideProgress();
    pipeReset();
    clearFieldError(el.ver);

    el.autoTag.hidden = true;
    if (!el.ver.value.trim()) {
      const match = file.name.match(/(\d+\.\d+(?:\.\d+)?(?:[-+][0-9A-Za-z.]+)?)/);
      if (match) {
        el.ver.value = match[1];
        el.autoTag.hidden = false;
      }
    }
    paintManifest();
  }

  function resetFileUI() {
    state.file = null;
    el.file.value = "";
    el.drop.classList.remove("has-file", "is-invalid");
    el.fileName.textContent = "—";
    el.fileSize.textContent = "—";
    el.ver.value = "";
    el.autoTag.hidden = true;
  }

  function clearAll() {
    if (state.uploading) return;
    resetFileUI();
    el.comp.value = DEFAULT_COMPATIBLE;
    el.board.value = "";
    targetRadios[0].checked = true;
    syncTarget();
    clearFieldErrors();
    hideProgress();
    pipeReset();
    paintManifest();
    el.ver.focus();
  }

  /* ======================================================================
     Pipeline
     ====================================================================== */

  function renderPipe() {
    pipeSteps.forEach((step, index) => {
      const done = index < PIPE.done;
      const active = !PIPE.error && index === PIPE.active;
      const error = PIPE.error && index === PIPE.active;

      step.classList.toggle("done", done);
      step.classList.toggle("active", active);
      step.classList.toggle("error", error);

      const label = step.querySelector(".step-state");
      if (label) {
        label.textContent = error ? "failed" : done ? "done" : active ? "running" : "queued";
      }
    });

    const lastDone = Math.max(0, Math.min(PIPE.done, pipeSteps.length) - 1);
    el.pipeFill.style.height = `${(lastDone / (pipeSteps.length - 1)) * 100}%`;

    const status = PIPE.error
      ? "failed"
      : PIPE.done >= pipeSteps.length
        ? "complete"
        : PIPE.active >= 0
          ? "running"
          : "idle";

    el.pipeStatus.textContent = status;
    el.pipeStatus.classList.toggle("is-running", status === "running");
    el.pipeStatus.classList.toggle("is-done", status === "complete");
    el.pipeStatus.classList.toggle("is-error", status === "failed");
    el.pipe.dataset.state = status;
  }

  function pipeReset() {
    PIPE.done = 0;
    PIPE.active = -1;
    PIPE.error = false;
    renderPipe();
  }

  function pipeStart() {
    PIPE.done = 0;
    PIPE.active = 0;
    PIPE.error = false;
    renderPipe();
  }

  function pipeAdvance(done) {
    PIPE.done = done;
    PIPE.active = done < pipeSteps.length ? done : -1;
    PIPE.error = false;
    renderPipe();
  }

  function pipeComplete() {
    PIPE.done = pipeSteps.length;
    PIPE.active = -1;
    PIPE.error = false;
    renderPipe();
  }

  function pipeFail() {
    PIPE.error = true;
    if (PIPE.active < 0) PIPE.active = Math.min(PIPE.done, pipeSteps.length - 1);
    renderPipe();
  }

  /* ======================================================================
     Progress
     ====================================================================== */

  function showProgress() {
    el.progress.hidden = false;
    el.progress.classList.remove("is-done", "is-error");
    el.progress.classList.add("is-running");
    el.stagePill.textContent = "Preparing upload";
    el.pct.textContent = "0%";
    el.fill.style.width = "0%";
    el.progressDetail.textContent = "Opening a multipart session…";
    el.progressEta.textContent = "";
  }

  function hideProgress() {
    document.title = BASE_TITLE;
    el.progress.hidden = true;
    el.progress.classList.remove("is-running", "is-done", "is-error");
    el.fill.style.width = "0%";
    el.pct.textContent = "0%";
  }

  function setStage(text) {
    el.stagePill.textContent = text;
  }

  function setBar(percent) {
    const value = Math.max(0, Math.min(100, percent));
    el.fill.style.width = `${value.toFixed(2)}%`;
    el.pct.textContent = `${Math.round(value)}%`;
    if (el.track) el.track.setAttribute("aria-valuenow", String(Math.round(value)));
    if (!REDUCED) document.title = `${Math.round(value)}% · Updatini`;
  }

  function updateStream(sent, total, startedAt, part, parts) {
    const percent = total ? (sent / total) * 100 : 0;
    setBar(percent);

    const elapsed = Math.max(0.2, (performance.now() - startedAt) / 1000);
    const rate = sent / elapsed;
    el.progressDetail.textContent =
      `${formatBytes(sent)} / ${formatBytes(total)} · ${part}/${parts} · ${formatBytes(rate)}/s`;
    el.progressEta.textContent =
      sent < total ? `~${formatDuration((total - sent) / Math.max(rate, 1))} left` : "finishing";
  }

  function progressDone(file, version) {
    el.progress.classList.remove("is-running", "is-error");
    el.progress.classList.add("is-done");
    el.stagePill.textContent = "Published";
    el.pct.textContent = "100%";
    el.fill.style.width = "100%";
    el.progressDetail.textContent = `${version} · ${formatBytes(file.size)}`;
    el.progressEta.textContent = "indexed";
    document.title = BASE_TITLE;
  }

  function progressFail(message) {
    el.progress.classList.remove("is-running", "is-done");
    el.progress.classList.add("is-error");
    el.stagePill.textContent = "Upload failed";
    el.progressDetail.textContent = shorten(message, 170);
    el.progressEta.textContent = "retry available";
    document.title = BASE_TITLE;
  }

  function setBusy(busy) {
    el.go.disabled = busy;
    el.reset.disabled = busy;
    el.go.classList.toggle("is-busy", busy);
    el.go.setAttribute("aria-busy", busy ? "true" : "false");
    el.goText.textContent = busy ? "Publishing…" : "Publish update";
    el.drop.classList.toggle("is-uploading", busy);
    el.drop.setAttribute("aria-disabled", busy ? "true" : "false");
    el.removeFile.disabled = busy;
  }

  /* ======================================================================
     Publishing
     ====================================================================== */

  function validateForm() {
    clearFieldErrors();
    let valid = true;

    if (!el.ver.value.trim()) {
      setFieldError(el.ver, "Version is required — for example 1.2.0.");
      valid = false;
    }
    if (!el.comp.value.trim()) {
      setFieldError(el.comp, "Compatible string is required, e.g. raspberrypi3-64.");
      valid = false;
    }
    if (selectedTarget() === "one" && !/^[\w.-]{1,64}$/.test(el.board.value.trim())) {
      setFieldError(el.board, "Use 1–64 letters, digits, dots, dashes or underscores.");
      valid = false;
    }
    if (!state.file) {
      rejectFile("Choose a signed .raucb bundle first.");
      valid = false;
    }
    if (!valid) {
      const firstInvalid = $(".input.invalid");
      if (firstInvalid) firstInvalid.focus();
      else el.drop.focus();
    }
    return valid;
  }

  async function uploadPart(session, index, blob, total) {
    let lastError = null;
    const query =
      `key=${encodeURIComponent(session.key)}` +
      `&id=${encodeURIComponent(session.uploadId)}` +
      `&n=${index + 1}`;

    for (let attempt = 1; attempt <= 3; attempt += 1) {
      let response = null;
      try {
        response = await api(`/api/upload/part?${query}`, { method: "PUT", body: blob });
      } catch (error) {
        lastError = error;
      }

      if (response && response.ok) return response;

      if (response) {
        if (response.status === 401) throw await apiError(response, "Chunk upload was rejected");
        if (response.status >= 400 && response.status < 500) {
          throw await apiError(response, `Chunk ${index + 1} failed`);
        }
        lastError = await apiError(response, `Chunk ${index + 1} failed`);
      }

      if (attempt < 3) {
        setStage(`Retrying chunk ${index + 1} of ${total}`);
        await sleep(320 * attempt);
        setStage(`Chunk ${index + 1} of ${total}`);
      }
    }

    throw lastError || new Error(`Chunk ${index + 1} failed.`);
  }

  async function publish() {
    if (state.uploading) return;

    if (!state.token) {
      toast("Add your admin token in the header to publish.", "error", 4200);
      el.token.focus();
      el.token.classList.add("invalid");
      setTimeout(() => el.token.classList.remove("invalid"), 600);
      return;
    }
    if (!validateForm()) return;

    const file = state.file;
    const version = el.ver.value.trim();
    const compatible = el.comp.value.trim();
    const one = selectedTarget() === "one";
    const board = el.board.value.trim();
    const target = one ? `board:${board}` : "all";

    const run = state.runId + 1;
    state.runId = run;
    state.uploading = true;
    setBusy(true);
    showProgress();
    pipeStart();

    const startedAt = performance.now();
    let sent = 0;

    try {
      setStage("Opening upload session");
      const startResponse = await api("/api/upload/start", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: file.name }),
      });
      if (!startResponse.ok) {
        throw await apiError(startResponse, "Could not start the upload");
      }
      const session = await startResponse.json();
      if (!session || !session.key || !session.uploadId) {
        throw new Error("The API returned an incomplete upload session.");
      }

      pipeAdvance(1);
      setStage("Uploading chunks");

      const totalParts = Math.max(1, Math.ceil(file.size / PART_SIZE));
      const parts = [];

      for (let index = 0; index < totalParts; index += 1) {
        const start = index * PART_SIZE;
        const end = Math.min(file.size, start + PART_SIZE);
        const blob = file.slice(start, end);

        setStage(`Chunk ${index + 1} of ${totalParts}`);
        const partResponse = await uploadPart(session, index, blob, totalParts);
        parts.push(await partResponse.json());

        sent = end;
        updateStream(sent, file.size, startedAt, index + 1, totalParts);
      }

      pipeAdvance(2);
      setStage("Committing bundle");
      setBar(100);
      el.progressDetail.textContent = "Sealing the multipart object…";
      el.progressEta.textContent = "";

      const finishResponse = await api("/api/upload/finish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          key: session.key,
          uploadId: session.uploadId,
          parts,
          version,
          compatible,
          target,
          size: file.size,
        }),
      });
      if (!finishResponse.ok) {
        throw await apiError(finishResponse, "Could not commit the bundle");
      }

      pipeAdvance(3);
      setTimeout(() => {
        if (state.runId === run) pipeComplete();
      }, 420);

      progressDone(file, version);
      toast(
        `Published ${version} to ${one ? `board ${board}` : "the whole fleet"}.`,
        "success",
        4800
      );

      // Reset the selection for the next release, keep the receipt visible.
      resetFileUI();
      clearFieldErrors();
      paintManifest();

      // Non-blocking refresh: highlight the row that just landed.
      refreshBundles({ quiet: true, newKey: session.key });
    } catch (error) {
      pipeFail();
      progressFail(error && error.message ? error.message : "Upload failed.");

      if (error && error.status === 401) {
        state.connected = false;
        saveToken("");
        setConn("error", "Token rejected");
        toast("Admin token rejected. Connect again with a valid token.", "error", 6500);
      } else {
        toast(shorten(error && error.message ? error.message : "Upload failed.", 180), "error", 7000);
      }
    } finally {
      if (state.runId === run) {
        state.uploading = false;
        setBusy(false);
      }
    }
  }

  /* ======================================================================
     Release history
     ====================================================================== */

  function skeleton() {
    el.histState.hidden = true;
    el.tableWrap.hidden = false;
    const fragment = document.createDocumentFragment();
    const widths = [72, 112, 88, 52, 104, 20];

    for (let row = 0; row < 4; row += 1) {
      const tr = document.createElement("tr");
      tr.className = "sk-row";
      widths.forEach((width) => {
        const td = document.createElement("td");
        const bar = document.createElement("span");
        bar.className = "sk";
        bar.style.width = `${width}px`;
        td.append(bar);
        tr.append(td);
      });
      fragment.append(tr);
    }

    el.rows.replaceChildren(fragment);
    el.count.textContent = "…";
    el.count.classList.remove("is-filtered");
  }

  function buildRow(bundle, index, newKey) {
    const tr = document.createElement("tr");
    tr.dataset.search = [
      bundle.version,
      bundle.compatible,
      bundle.target,
      String(bundle.target || "").startsWith("board:") ? bundle.target.slice(6) : "whole fleet",
      bundle.key,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    tr.dataset.ts = String(bundle.created_at || "");
    tr.style.setProperty("--i", String(Math.min(index, 10)));
    if (newKey && bundle.key === newKey) tr.classList.add("is-new");

    // Version
    const versionCell = document.createElement("td");
    versionCell.dataset.label = "Version";
    const version = document.createElement("div");
    version.className = "ver";
    const badge = document.createElement("span");
    badge.className = "ver-ic";
    badge.innerHTML = IC.package;
    const versionText = document.createElement("span");
    versionText.className = "ver-num mono";
    versionText.textContent = bundle.version || "—";
    version.append(badge, versionText);
    if (index === 0) {
      const latest = document.createElement("span");
      latest.className = "pill pill-latest";
      latest.textContent = "latest";
      version.append(latest);
    }
    versionCell.append(version);

    // Compatible
    const compatibleCell = document.createElement("td");
    compatibleCell.dataset.label = "Compatible";
    compatibleCell.className = "mono cell-compat";
    compatibleCell.textContent = bundle.compatible || "—";

    // Target
    const targetCell = document.createElement("td");
    targetCell.dataset.label = "Target";
    const target = String(bundle.target || "");
    const isBoard = target.startsWith("board:");
    const chip = document.createElement("span");
    chip.className = `tchip ${isBoard ? "board" : "all"}`;
    const chipLabel = document.createElement("span");
    chipLabel.className = "tchip-label";
    chipLabel.textContent = isBoard ? `board · ${target.slice(6)}` : "whole fleet";
    chip.append(chipLabel);
    targetCell.append(chip);

    // Size
    const sizeCell = document.createElement("td");
    sizeCell.dataset.label = "Size";
    sizeCell.className = "mono num cell-size";
    sizeCell.textContent = bundle.size ? formatBytes(bundle.size) : "—";

    // Published
    const publishedCell = document.createElement("td");
    publishedCell.dataset.label = "Published";
    publishedCell.className = "cell-when";
    const when = document.createElement("span");
    when.className = "when";
    const rel = document.createElement("span");
    rel.className = "rel";
    rel.textContent = relTime(bundle.created_at);
    const abs = document.createElement("span");
    abs.className = "abs";
    abs.textContent = absTime(bundle.created_at);
    when.title = absTime(bundle.created_at);
    when.append(rel, abs);
    publishedCell.append(when);

    // Actions
    const actionsCell = document.createElement("td");
    actionsCell.dataset.label = "";
    actionsCell.className = "cell-act";
    const actions = document.createElement("div");
    actions.className = "row-actions";
    if (bundle.key) {
      const copy = document.createElement("button");
      copy.type = "button";
      copy.className = "icon-btn copy-btn";
      copy.dataset.copy = bundle.key;
      copy.title = "Copy R2 key";
      copy.setAttribute("aria-label", `Copy R2 key for version ${bundle.version || "unknown"}`);
      copy.innerHTML = IC.copy;
      actions.append(copy);
    }
    actionsCell.append(actions);

    tr.append(versionCell, compatibleCell, targetCell, sizeCell, publishedCell, actionsCell);
    return tr;
  }

  function renderRows(list, newKey) {
    const fragment = document.createDocumentFragment();
    list.forEach((bundle, index) => fragment.append(buildRow(bundle, index, newKey)));
    el.rows.replaceChildren(fragment);
  }

  function applyBundles(list, { newKey = null } = {}) {
    state.bundles = list;
    paintStats(list);

    if (!list.length) {
      el.rows.replaceChildren();
      showState("empty");
      el.count.textContent = "0";
      el.count.classList.remove("is-filtered");
      return;
    }

    renderRows(list, newKey);
    showState(null);
    filterRows();
  }

  function filterRows() {
    const query = el.q.value.trim().toLowerCase();
    const rows = $$("#rows tr[data-search]");
    if (!rows.length) return;

    let visible = 0;
    rows.forEach((tr) => {
      const match = !query || (tr.dataset.search || "").includes(query);
      tr.hidden = !match;
      if (match) visible += 1;
    });

    el.count.textContent = query ? `${visible} / ${rows.length}` : String(rows.length);
    el.count.classList.toggle("is-filtered", Boolean(query));

    if (query && visible === 0) {
      showState("nomatch", { query: el.q.value.trim() });
    } else if (el.histState.dataset.kind === "nomatch") {
      showState(null);
    }
  }

  /* ======================================================================
     History states
     ====================================================================== */

  const STATES = {
    locked: {
      title: "Connect to load releases",
      text: "Paste your admin token in the header to list published bundles and start shipping updates.",
      action: "token",
      label: "Use admin token",
      art: IC.lock,
      tone: "warn",
    },
    rejected: {
      title: "Admin token rejected",
      text: "The API refused that token. Double-check the value in your worker secrets, then connect again.",
      action: "token",
      label: "Fix token",
      art: IC.lock,
      tone: "err",
    },
    error: {
      title: "Couldn't load releases",
      text: "The update API didn't answer. If you're testing locally, make sure the worker is running, then try again.",
      action: "retry",
      label: "Try again",
      art: IC.alert,
      tone: "err",
    },
    empty: {
      title: "No releases yet",
      text: "Publish your first .raucb bundle above — it will show up here with its target, size and timestamp.",
      action: "file",
      label: "Choose a bundle",
      art: IC.package,
      tone: "cyan",
    },
    nomatch: {
      title: "No matching releases",
      text: (options) => `Nothing matches “${options.query}”. Try a version, board ID or compatible string.`,
      action: "clear",
      label: "Clear filter",
      art: IC.search,
      tone: "cyan",
    },
  };

  function showState(kind, options = {}) {
    if (!kind) {
      el.histState.hidden = true;
      delete el.histState.dataset.kind;
      el.tableWrap.hidden = state.bundles.length === 0;
      return;
    }

    const config = STATES[kind] || STATES.error;
    el.tableWrap.hidden = true;
    el.histState.hidden = false;
    el.histState.dataset.kind = kind;
    el.stateArt.innerHTML = config.art;
    el.stateArt.dataset.tone = config.tone;
    el.stateTitle.textContent = config.title;
    el.stateText.textContent =
      typeof config.text === "function" ? config.text(options) : config.text;
    el.stateBtn.textContent = config.label;
    el.stateBtn.dataset.action = config.action;
    el.stateBtn.hidden = false;
  }

  /* ======================================================================
     Clipboard
     ====================================================================== */

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(text);
        return;
      } catch {
        /* clipboard permission denied — fall back to the legacy path */
      }
    }
    return new Promise((resolve, reject) => {
      const area = document.createElement("textarea");
      area.value = text;
      area.setAttribute("readonly", "");
      area.style.cssText = "position:fixed;top:-1000px;left:0;opacity:0;";
      document.body.append(area);
      area.select();
      try {
        const ok = document.execCommand("copy");
        ok ? resolve() : reject(new Error("Copy command failed"));
      } catch (error) {
        reject(error);
      } finally {
        area.remove();
      }
    });
  }

  /* ======================================================================
     Events
     ====================================================================== */

  function wire() {
    el.conn.addEventListener("submit", (event) => {
      event.preventDefault();
      connect();
    });

    el.reveal.addEventListener("click", () => {
      const show = el.token.type === "password";
      el.token.type = show ? "text" : "password";
      el.reveal.setAttribute("aria-pressed", String(show));
      el.reveal.setAttribute("aria-label", show ? "Hide admin token" : "Show admin token");
      const use = el.reveal.querySelector("use");
      if (use) use.setAttribute("href", show ? "#i-eye-off" : "#i-eye");
    });

    el.token.addEventListener("input", () => {
      el.token.classList.remove("invalid");
      if (state.connected) {
        const same = el.token.value.trim() === state.token;
        setConn(same ? "connected" : "idle", same ? "Connected" : "Reconnect");
      }
    });

    // File picker
    el.drop.addEventListener("click", (event) => {
      if (state.uploading) return;
      if (event.target.closest("#removeFile")) return;
      el.file.click();
    });

    el.drop.addEventListener("keydown", (event) => {
      if (state.uploading) return;
      if (event.key === "Enter" || event.key === " " || event.key === "Spacebar") {
        event.preventDefault();
        el.file.click();
      }
    });

    el.file.addEventListener("change", () => {
      const file = el.file.files && el.file.files[0];
      if (file) acceptFile(file);
    });

    el.removeFile.addEventListener("click", () => {
      if (state.uploading) return;
      resetFileUI();
      hideProgress();
      pipeReset();
      paintManifest();
      el.drop.focus();
    });

    // Drag & drop
    let dragDepth = 0;
    ["dragenter", "dragover"].forEach((type) => {
      el.drop.addEventListener(type, (event) => {
        event.preventDefault();
        if (state.uploading) return;
        if (type === "dragenter") dragDepth += 1;
        el.drop.classList.add("dragging");
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      });
    });
    el.drop.addEventListener("dragleave", (event) => {
      event.preventDefault();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) el.drop.classList.remove("dragging");
    });
    el.drop.addEventListener("drop", (event) => {
      event.preventDefault();
      dragDepth = 0;
      el.drop.classList.remove("dragging");
      if (state.uploading) return;
      const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) acceptFile(file);
    });
    window.addEventListener("dragover", (event) => event.preventDefault());
    window.addEventListener("drop", (event) => event.preventDefault());

    // Fields
    [el.ver, el.comp, el.board].forEach((input) => {
      input.addEventListener("input", () => {
        clearFieldError(input);
        if (input === el.ver) el.autoTag.hidden = true;
        paintManifest();
      });
    });

    targetRadios.forEach((radio) => radio.addEventListener("change", syncTarget));

    el.go.addEventListener("click", publish);
    el.reset.addEventListener("click", clearAll);

    el.refresh.addEventListener("click", () => {
      if (!state.token) {
        toast("Connect with your admin token first.", "info", 3400);
        el.token.focus();
        return;
      }
      refreshBundles({ quiet: false });
    });

    el.q.addEventListener("input", filterRows);
    el.q.addEventListener("search", filterRows);
    el.q.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        el.q.value = "";
        filterRows();
        el.q.blur();
      }
    });

    el.stateBtn.addEventListener("click", () => {
      const action = el.stateBtn.dataset.action;
      if (action === "token") {
        el.token.focus();
        el.token.select();
        window.scrollTo({ top: 0, behavior: REDUCED ? "auto" : "smooth" });
      } else if (action === "retry") {
        refreshBundles({ quiet: false });
      } else if (action === "file") {
        el.drop.scrollIntoView({ block: "center", behavior: REDUCED ? "auto" : "smooth" });
        el.drop.click();
      } else if (action === "clear") {
        el.q.value = "";
        filterRows();
        el.q.focus();
      }
    });

    el.rows.addEventListener("click", async (event) => {
      const button = event.target.closest("[data-copy]");
      if (!button) return;
      const key = button.dataset.copy;
      if (!key) return;
      try {
        await copyText(key);
        const original = button.innerHTML;
        button.innerHTML = IC.check;
        button.classList.add("copied");
        setTimeout(() => {
          button.innerHTML = original;
          button.classList.remove("copied");
        }, 1400);
        toast("Bundle key copied.", "success", 2400);
      } catch {
        toast(`Couldn't copy automatically. Key: ${key}`, "error", 8000);
      }
    });

    // Keyboard shortcuts
    document.addEventListener("keydown", (event) => {
      const tag = (event.target.tagName || "").toLowerCase();
      const typing =
        tag === "input" || tag === "textarea" || tag === "select" || event.target.isContentEditable;

      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        el.q.focus();
        el.q.select();
        return;
      }
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        publish();
      }
    });

    window.addEventListener("beforeunload", (event) => {
      if (!state.uploading) return;
      event.preventDefault();
      event.returnValue = "";
    });

    // Keep relative timestamps fresh.
    setInterval(() => {
      $$("#rows tr[data-ts]").forEach((tr) => {
        const rel = tr.querySelector(".rel");
        if (rel) rel.textContent = relTime(Number(tr.dataset.ts));
      });
    }, 60000);
  }

  /* ======================================================================
     Boot
     ====================================================================== */

  function boot() {
    el.token.value = state.token;
    syncTarget();
    paintManifest();
    renderPipe();
    wire();

    if (state.token) {
      setConn("connecting");
      refreshBundles({ quiet: true, initial: true });
    } else {
      setConn("idle");
      showState("locked");
    }
  }

  boot();
})();
