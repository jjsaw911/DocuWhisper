// Foxy SPA - single file, no framework
(() => {
const API = "/foxy/api";
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => Array.from(root.querySelectorAll(s));
const h = (tag, attrs = {}, ...children) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (v === false || v == null) {}
    else el.setAttribute(k, v);
  }
  for (const c of children.flat()) {
    if (c == null || c === false) continue;
    if (typeof c === "string") el.appendChild(document.createTextNode(c));
    else el.appendChild(c);
  }
  return el;
};

// State
let me = null;
let characters = [];
let selectedCharId = null;
let currentTab = "generate";
let viewingCharId = null;
let lastGenerationId = null;
let galleryCursor = null;

// HTTP helpers
async function api(path, opts = {}) {
  const r = await fetch(API + path, { credentials: "same-origin", ...opts });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { _raw: text }; }
  if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
  return data;
}
async function postJSON(path, body) {
  return api(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
}

// ============ Boot ============
async function boot() {
  try {
    const info = await api("/me");
    if (info.authenticated) {
      me = info;
      showApp();
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

function showLogin() {
  $("#login").classList.remove("hidden");
  $("#app").classList.add("hidden");
}

async function showApp() {
  $("#login").classList.add("hidden");
  $("#app").classList.remove("hidden");
  $("#userBadge").textContent = me.username;
  $("#settingsUser").textContent = me.username;
  await loadCharacters();
  switchTab("generate");
}

// ============ Login ============
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const fd = new FormData(e.target);
  const status = $("#loginStatus");
  status.className = "status";
  status.textContent = "Signing in...";
  try {
    await postJSON("/login", { username: fd.get("username"), password: fd.get("password") });
    me = await api("/me");
    e.target.reset();
    status.textContent = "";
    showApp();
  } catch (err) {
    status.className = "status err";
    status.textContent = err.message;
  }
});

$("#logoutBtn").addEventListener("click", async () => {
  try { await postJSON("/logout", {}); } catch {}
  me = null;
  showLogin();
});

// ============ Tabs ============
$$(".tabbar button").forEach(btn => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});
function switchTab(name) {
  currentTab = name;
  $$(".tab").forEach(t => t.classList.add("hidden"));
  $$(".tabbar button").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
  if (name === "generate") $("#tab-generate").classList.remove("hidden");
  else if (name === "characters") { $("#tab-characters").classList.remove("hidden"); renderCharList(); }
  else if (name === "gallery") { $("#tab-gallery").classList.remove("hidden"); loadGallery(true); }
  else if (name === "settings") $("#tab-settings").classList.remove("hidden");
  window.scrollTo(0, 0);
}

// ============ Characters ============
async function loadCharacters() {
  characters = await api("/characters");
  renderCharStrip();
}

function renderCharStrip() {
  const strip = $("#charStrip");
  const empty = $("#charEmpty");
  // Keep the "+ New" button; rebuild before it
  strip.innerHTML = "";
  // "None" chip
  strip.appendChild(charChip(null, "None"));
  for (const c of characters) {
    strip.appendChild(charChip(c.id, c.name, c.thumb));
  }
  strip.appendChild(h("button", {
    class: "char-chip add",
    type: "button",
    onclick: () => createCharacterFlow(),
  }, "+ New"));
  empty.style.display = characters.length === 0 ? "block" : "none";
  applyCharSelection();
}

function charChip(id, name, thumb) {
  const btn = h("button", {
    class: "char-chip", type: "button",
    "data-id": id == null ? "" : id,
    onclick: () => { selectedCharId = id; applyCharSelection(); },
  });
  if (thumb) {
    btn.appendChild(h("img", { src: `/foxy/img/ref/${encodeURIComponent(thumb)}`, alt: "" }));
  }
  btn.appendChild(document.createTextNode(name));
  return btn;
}

function applyCharSelection() {
  $$("#charStrip .char-chip").forEach(b => {
    const id = b.dataset.id;
    const matches = (selectedCharId == null && id === "") || (String(selectedCharId) === id);
    b.classList.toggle("selected", matches);
  });
}

async function createCharacterFlow() {
  const name = prompt("Character name (e.g. 'Me', 'Sarah'):");
  if (!name || !name.trim()) return;
  const created = await postJSON("/characters", { name: name.trim() });
  await loadCharacters();
  selectedCharId = created.id;
  applyCharSelection();
  openCharacter(created.id);
}

$("#charNewBtn2").addEventListener("click", createCharacterFlow);

function renderCharList() {
  const list = $("#charList");
  list.innerHTML = "";
  if (characters.length === 0) {
    list.appendChild(h("p", { class: "muted" }, "No characters yet. Tap + New character to start."));
    return;
  }
  for (const c of characters) {
    const card = h("div", { class: "char-card", onclick: () => openCharacter(c.id) },
      c.thumb
        ? h("img", { src: `/foxy/img/ref/${encodeURIComponent(c.thumb)}`, alt: "" })
        : h("div", { class: "placeholder", style: "width:100%;aspect-ratio:1;border-radius:10px;margin-bottom:8px;background:var(--bg2);" }, "👤"),
      h("div", { class: "name" }, c.name),
      h("div", { class: "count" }, `${c.photo_count} photo${c.photo_count === 1 ? "" : "s"}`),
    );
    list.appendChild(card);
  }
}

async function openCharacter(id) {
  viewingCharId = id;
  const c = characters.find(x => x.id === id);
  $("#charTitle").textContent = c ? c.name : "";
  $$(".tab").forEach(t => t.classList.add("hidden"));
  $("#tab-character").classList.remove("hidden");
  $("#charUploadStatus").textContent = "";
  await loadPhotosFor(id);
}

$("#charBack").addEventListener("click", () => switchTab("characters"));

async function loadPhotosFor(id) {
  const photos = await api(`/characters/${id}/photos`);
  const grid = $("#photoGrid");
  grid.innerHTML = "";
  for (const p of photos) {
    const item = h("div", { class: "ph" },
      h("img", { src: `/foxy/img/ref/${encodeURIComponent(p.filename)}`, alt: "" }),
      h("div", {
        class: "x",
        onclick: async (e) => {
          e.stopPropagation();
          if (!confirm("Delete this photo?")) return;
          await api(`/photos/${p.id}`, { method: "DELETE" });
          await loadPhotosFor(id);
          await loadCharacters();
        }
      }, "×"),
    );
    grid.appendChild(item);
  }
  if (photos.length === 0) {
    grid.appendChild(h("p", { class: "muted" }, "No photos yet. Tap + Add photos."));
  }
}

$("#charUpload").addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length || viewingCharId == null) return;
  const status = $("#charUploadStatus");
  status.className = "status";
  status.textContent = `Uploading ${files.length} photo${files.length === 1 ? "" : "s"}...`;
  const fd = new FormData();
  for (const f of files) fd.append("photo", f, f.name);
  try {
    await fetch(`${API}/characters/${viewingCharId}/photos`, {
      method: "POST", body: fd, credentials: "same-origin"
    }).then(r => { if (!r.ok) return r.text().then(t => { throw new Error(t || r.status); }); });
    status.className = "status ok";
    status.textContent = "Uploaded.";
    await loadPhotosFor(viewingCharId);
    await loadCharacters();
  } catch (err) {
    status.className = "status err";
    status.textContent = err.message || String(err);
  }
  e.target.value = "";
});

$("#charDeleteBtn").addEventListener("click", async () => {
  if (viewingCharId == null) return;
  const c = characters.find(x => x.id === viewingCharId);
  if (!confirm(`Delete character "${c?.name}" and all its photos?`)) return;
  await api(`/characters/${viewingCharId}`, { method: "DELETE" });
  if (selectedCharId === viewingCharId) selectedCharId = null;
  await loadCharacters();
  switchTab("characters");
});

// ============ Prompt chips ============
$$(".chip[data-add]").forEach(chip => {
  chip.addEventListener("click", () => {
    const cur = $("#prompt").value.trim();
    const add = chip.dataset.add;
    $("#prompt").value = cur ? `${cur}, ${add}` : add;
  });
});

// ============ Generate ============
function setGenStatus(msg, cls) {
  const s = $("#genStatus");
  s.className = "status" + (cls ? ` ${cls}` : "");
  s.textContent = msg;
}
function setGenProg(pct) {
  const p = $("#genProg");
  if (pct == null) { p.classList.remove("show"); return; }
  p.classList.add("show");
  p.firstElementChild.style.width = `${pct}%`;
}

$("#genBtn").addEventListener("click", async () => {
  const btn = $("#genBtn");
  const promptText = $("#prompt").value.trim();
  if (!promptText) { setGenStatus("Type a prompt", "err"); return; }

  const body = {
    prompt: promptText,
    negative_prompt: $("#neg").value,
    aspect: $("#aspect").value,
    steps: parseInt($("#steps").value) || 28,
    cfg: parseFloat($("#cfg").value) || 4.5,
    face_weight: parseFloat($("#faceW").value) || 1.0,
    character_id: selectedCharId,
  };
  const seedRaw = $("#seed").value.trim();
  if (seedRaw) body.seed = parseInt(seedRaw);

  btn.disabled = true;
  setGenProg(15);
  setGenStatus("Generating...");

  // Progress feel - fake-tick toward 85% over ~60s
  let progT = 15;
  const ticker = setInterval(() => {
    progT = Math.min(progT + 1, 85);
    setGenProg(progT);
  }, 800);

  try {
    const res = await postJSON("/generate", body);
    clearInterval(ticker);
    setGenProg(100);
    setGenStatus("Done.", "ok");
    setTimeout(() => setGenProg(null), 1200);
    lastGenerationId = res.id;
    renderResult(res);
  } catch (err) {
    clearInterval(ticker);
    setGenProg(null);
    setGenStatus(err.message, "err");
  } finally {
    btn.disabled = false;
  }
});

function renderResult(res) {
  const container = $("#genResult");
  container.innerHTML = "";
  const card = h("div", { class: "result-card" },
    h("img", { src: `/foxy/img/out/${encodeURIComponent(res.filename)}`, alt: "" }),
    h("div", { class: "result-actions" },
      h("button", { class: "secondary", onclick: () => downloadImage(res.filename) }, "Save"),
      h("button", { class: "secondary", onclick: () => { $("#seed").value = ""; $("#genBtn").click(); } }, "Variation"),
    ),
  );
  container.appendChild(card);
}

function downloadImage(filename) {
  const a = document.createElement("a");
  a.href = `/foxy/img/out/${encodeURIComponent(filename)}`;
  a.download = filename;
  a.click();
}

// ============ Gallery ============
async function loadGallery(reset) {
  if (reset) {
    galleryCursor = null;
    $("#galleryGrid").innerHTML = "";
  }
  const url = galleryCursor ? `/gallery?limit=30&before=${galleryCursor}` : `/gallery?limit=30`;
  const items = await api(url);
  const grid = $("#galleryGrid");
  if (items.length === 0 && !galleryCursor) {
    grid.appendChild(h("p", { class: "muted" }, "Nothing yet. Generate something on the Generate tab."));
    $("#galleryMore").style.display = "none";
    return;
  }
  for (const g of items) {
    grid.appendChild(h("div", {
      class: "gi", onclick: () => openImageModal(g),
    }, h("img", { src: `/foxy/img/out/${encodeURIComponent(g.filename)}`, alt: "" })));
  }
  if (items.length === 30) {
    galleryCursor = items[items.length - 1].id;
    $("#galleryMore").style.display = "block";
  } else {
    $("#galleryMore").style.display = "none";
  }
}
$("#galleryMore").addEventListener("click", () => loadGallery(false));

function openImageModal(g) {
  const body = $("#modalBody");
  body.innerHTML = "";
  body.appendChild(h("img", { src: `/foxy/img/out/${encodeURIComponent(g.filename)}`, alt: "" }));
  body.appendChild(h("p", { class: "muted", style: "margin:10px 0;font-size:13px;" }, g.prompt));
  if (g.character_name) {
    body.appendChild(h("p", { class: "muted", style: "margin:4px 0;font-size:12px;" }, `Face: ${g.character_name}`));
  }
  body.appendChild(h("div", { class: "actions" },
    h("button", { class: "secondary", onclick: () => downloadImage(g.filename) }, "Save"),
    h("button", { class: "danger", onclick: async () => {
      if (!confirm("Delete this image?")) return;
      await api(`/generations/${g.id}`, { method: "DELETE" });
      closeModal();
      loadGallery(true);
    } }, "Delete"),
    h("button", { class: "secondary", onclick: closeModal }, "Close"),
  ));
  $("#modal").classList.remove("hidden");
}

function closeModal() {
  $("#modal").classList.add("hidden");
  $("#modalBody").innerHTML = "";
}
$("#modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") closeModal();
});

// ============ Settings ============
$("#changePwBtn").addEventListener("click", async () => {
  const old = $("#oldPw").value;
  const neu = $("#newPw").value;
  const s = $("#pwStatus");
  if (neu.length < 6) { s.className = "status err"; s.textContent = "New password must be at least 6 chars"; return; }
  try {
    await postJSON("/change_password", { old_password: old, new_password: neu });
    s.className = "status ok"; s.textContent = "Password updated.";
    $("#oldPw").value = ""; $("#newPw").value = "";
  } catch (err) {
    s.className = "status err"; s.textContent = err.message;
  }
});

// Top-bar "new character" alias
$("#charNewBtn").addEventListener("click", createCharacterFlow);

boot();
})();
