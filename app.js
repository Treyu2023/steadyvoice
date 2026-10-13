const SEEDS = JSON.parse(document.getElementById("seeds").textContent);
const TONE = {
  Urgent: "rose",
  Needs: "sky",
  Feelings: "plum",
  Talk: "amber",
  People: "sage",
  Daily: "stone",
  Health: "coral",
};
const CATS = ["Urgent", "Needs", "Feelings", "Talk", "People", "Daily", "Health"];
const WORDS = ["I", "need", "want", "please", "help", "water", "pain", "yes", "no", "wait"];
const QUICK = [
  ["Yes", "Yes."],
  ["No", "No."],
  ["Help", "I need help."],
  ["Wait", "Please wait. I need a moment."],
];
const CHOICES = [
  ["Yes", "Yes.", "sage"],
  ["No", "No.", "rose"],
  ["Not sure", "I am not sure.", "amber"],
  ["Say it again", "Please say that again, more slowly.", "sky"],
  ["I need a minute", "Please wait. I need a moment.", "plum"],
  ["I hear you", "I understand you. Speaking is hard right now.", "coral"],
];
const THEMES = [
  ["paper", "Paper"],
  ["sage", "Sage"],
  ["night", "Night"],
  ["dusk", "Dusk"],
  ["contrast", "High contrast"],
  ["ink", "Ink"],
];
const KEY = "steadyvoice.phone.v1";
const INSTALL_URL = "https://treyu2023.github.io/steadyvoice/";

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => {
    const name = { "&": "amp", "<": "lt", ">": "gt", '"': "quot", "'": "#39" }[ch];
    return "&" + name + ";";
  });
}
function starters() {
  return SEEDS.map((seed, index) => ({
    id: seed.id,
    label: seed.label,
    speak: seed.speak,
    category: seed.category,
    tone: TONE[seed.category] || "amber",
    uses: 0,
    lastUsed: 0,
    pinned: Boolean(seed.pinned),
    order: index,
    custom: false,
    hidden: false,
    hasClip: false,
  }));
}
function defaults() {
  return {
    phrases: starters(),
    history: [],
    settings: {
      theme: "paper",
      scale: 2,
      columns: 2,
      shape: "soft",
      hand: "left",
      voiceURI: "",
      voiceName: "",
      rate: 0.86,
      pitch: 1,
      volume: 1,
      haptics: true,
      confirm: false,
      quickBar: true,
      wake: true,
      wideType: false,
      lockEdits: false,
      boardSort: "used",
      preferClips: true,
    },
  };
}
function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || "null");
    if (!saved || !Array.isArray(saved.phrases)) return defaults();
    const ids = new Set(saved.phrases.map((phrase) => phrase.id));
    const missing = starters().filter((phrase) => !ids.has(phrase.id));
    return {
      phrases: saved.phrases.concat(missing),
      history: Array.isArray(saved.history) ? saved.history : [],
      settings: { ...defaults().settings, ...(saved.settings || {}) },
    };
  } catch {
    return defaults();
  }
}

let state = load();
const ui = {
  view: "board",
  more: "home",
  query: "",
  sort: "used",
  category: "All",
  draft: "",
  speaking: "",
  armed: null,
  editor: null,
  notice: "",
  confirmDelete: false,
  recording: false,
  voices: [],
};
let clipAudio = null;
let speakToken = 0;
let rec = null;
let noticeTimer = 0;

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ phrases: state.phrases, history: state.history, settings: state.settings }));
  } catch {
    /* file:// and some phone browsers block storage; the board still works */
  }
}
function buzz() {
  if (state.settings.haptics && navigator.vibrate) navigator.vibrate(12);
}
function notice(text) {
  ui.notice = text;
  window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => {
    ui.notice = "";
    render();
  }, 2200);
  render();
}
function visible() {
  return state.phrases.filter((phrase) => !phrase.hidden);
}
function sortList(list, mode) {
  return [...list].sort((a, b) => {
    if (mode === "used") return b.uses - a.uses || b.lastUsed - a.lastUsed || a.order - b.order || a.label.localeCompare(b.label);
    if (mode === "recent") return b.lastUsed - a.lastUsed || b.uses - a.uses || a.label.localeCompare(b.label);
    if (mode === "category") return a.category.localeCompare(b.category) || b.uses - a.uses || a.label.localeCompare(b.label);
    return a.label.localeCompare(b.label);
  });
}
function matches(phrase) {
  const needle = ui.query.trim().toLowerCase();
  if (!needle) return true;
  return phrase.label.toLowerCase().includes(needle) || phrase.speak.toLowerCase().includes(needle) || phrase.category.toLowerCase().includes(needle);
}
function inCat(phrase) {
  return ui.category === "All" || phrase.category === ui.category;
}
function findSpeak(text) {
  const needle = text.trim().toLowerCase();
  return visible().find((phrase) => phrase.speak.toLowerCase() === needle);
}

function stopSpeech() {
  speakToken += 1;
  window.speechSynthesis?.cancel();
  if (clipAudio) {
    clipAudio.pause();
    clipAudio = null;
  }
  ui.speaking = "";
}
function speak(text) {
  const clean = text.trim();
  if (!clean || !window.speechSynthesis) {
    notice("This browser cannot speak. Open SteadyVoice in Chrome.");
    return;
  }
  stopSpeech();
  const mine = ++speakToken;
  const utterance = new SpeechSynthesisUtterance(clean);
  utterance.rate = state.settings.rate;
  utterance.pitch = state.settings.pitch;
  utterance.volume = state.settings.volume;
  const voices = window.speechSynthesis.getVoices();
  const voice =
    voices.find((item) => item.voiceURI === state.settings.voiceURI) ||
    voices.find((item) => item.name === state.settings.voiceName) ||
    voices.find((item) => item.lang.toLowerCase().startsWith("en")) ||
    voices[0];
  if (voice) utterance.voice = voice;
  const done = () => {
    if (mine !== speakToken) return;
    ui.speaking = "";
    render();
  };
  utterance.onend = done;
  utterance.onerror = done;
  ui.speaking = clean;
  render();
  window.setTimeout(() => {
    if (mine !== speakToken) return;
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
  }, 60);
}
function mark(text, id) {
  const clean = text.trim();
  if (!clean) return;
  const now = Date.now();
  const needle = clean.toLowerCase();
  let matched = false;
  state.phrases = state.phrases.map((phrase) => {
    const hit = phrase.id === id || (!id && !phrase.hidden && (phrase.speak.toLowerCase() === needle || phrase.label.toLowerCase() === needle));
    if (!hit || matched) return phrase;
    matched = true;
    return { ...phrase, uses: phrase.uses + 1, lastUsed: now };
  });
  state.history = [{ id: uid(), text: clean, at: now }, ...state.history.filter((item) => item.text.toLowerCase() !== needle)].slice(0, 40);
  save();
}
function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("steadyvoice", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("clips")) request.result.createObjectStore("clips");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function putClip(id, blob) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction("clips", "readwrite");
    tx.objectStore("clips").put(blob, id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
async function getClip(id) {
  const db = await openDb();
  const blob = await new Promise((resolve, reject) => {
    const tx = db.transaction("clips", "readonly");
    const request = tx.objectStore("clips").get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
  db.close();
  return blob;
}
async function dropClip(id) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction("clips", "readwrite");
    tx.objectStore("clips").delete(id);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}
async function sayPhrase(phrase) {
  buzz();
  mark(phrase.speak, phrase.id);
  stopSpeech();
  if (state.settings.preferClips && phrase.hasClip) {
    try {
      const blob = await getClip(phrase.id);
      if (blob) {
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        clipAudio = audio;
        ui.speaking = phrase.speak;
        render();
        audio.onended = () => {
          URL.revokeObjectURL(url);
          ui.speaking = "";
          render();
        };
        await audio.play();
        return;
      }
    } catch {
      /* typed voice instead */
    }
  }
  speak(phrase.speak);
}
function sayText(text) {
  const clean = text.trim();
  if (!clean) return;
  buzz();
  const phrase = findSpeak(clean);
  if (phrase) {
    void sayPhrase(phrase);
    return;
  }
  mark(clean);
  speak(clean);
}

function cats() {
  return `<div class="sv-cats">${["All", ...CATS]
    .map(
      (item) =>
        `<button type="button" class="sv-chip${ui.category === item ? " is-on" : ""}" data-act="cat" data-id="${esc(item)}">${esc(item)}</button>`,
    )
    .join("")}</div>`;
}
function pad(phrase) {
  const armed = ui.armed === phrase.id ? " is-armed" : "";
  return `<button type="button" class="sv-pad tone-${phrase.tone}${armed}" data-act="pad" data-id="${esc(phrase.id)}" aria-label="${esc(phrase.label)}. ${esc(phrase.speak)}"><span class="sv-pad-label">${esc(phrase.label)}</span></button>`;
}
function boardHtml() {
  const pinned = visible().filter((phrase) => phrase.pinned && matches(phrase) && inCat(phrase));
  const list = state.settings.boardSort === "manual" ? [...pinned].sort((a, b) => a.order - b.order) : sortList(pinned, "used");
  const manual =
    !state.settings.lockEdits && state.settings.boardSort === "manual"
      ? (phrase, index) =>
          `<div class="sv-actions"><button type="button" class="sv-ghost" data-act="move" data-id="${esc(phrase.id)}" data-dir="-1" ${index === 0 ? "disabled" : ""}>Earlier</button><button type="button" class="sv-ghost" data-act="move" data-id="${esc(phrase.id)}" data-dir="1" ${index === list.length - 1 ? "disabled" : ""}>Later</button><button type="button" class="sv-ghost" data-act="edit" data-id="${esc(phrase.id)}">Edit</button></div>`
      : () => "";
  return `<p class="sv-lead">Tap a button to say it. The ones you use most rise to the top.</p>
    <label class="sv-sr" for="q">Search the board</label>
    <input id="q" class="sv-search" placeholder="Search the board" value="${esc(ui.query)}">
    ${cats()}
    ${state.settings.confirm ? `<p class="sv-lead">Tap a button, then press Say it. This avoids mis-taps.</p>` : ""}
    ${ui.notice ? `<p class="sv-note">${esc(ui.notice)}</p>` : ""}
    ${list.length ? `<div class="sv-grid">${list.map((phrase, index) => `<div>${pad(phrase)}${manual(phrase, index)}</div>`).join("")}</div>` : `<p class="sv-note">Nothing on the board yet. Open Phrases and save the ones you need.</p>`}`;
}
function speakHtml() {
  const needle = ui.draft.trim().toLowerCase();
  const pool = visible().filter((phrase) =>
    needle ? phrase.label.toLowerCase().includes(needle) || phrase.speak.toLowerCase().includes(needle) : phrase.uses > 0 || phrase.pinned,
  );
  const suggestions = sortList(pool, "used").slice(0, 6);
  return `<label class="sv-label" for="say-box">What do you want to say?</label>
    <textarea id="say-box" class="sv-input" placeholder="Type here, then Say it">${esc(ui.draft)}</textarea>
    <button type="button" class="sv-primary" data-act="say-draft" ${ui.draft.trim() ? "" : "disabled"}>Say it</button>
    <div class="sv-actions">
      <button type="button" class="sv-ghost" data-act="undo-word" ${ui.draft.trim() ? "" : "disabled"}>Undo word</button>
      <button type="button" class="sv-ghost" data-act="clear-draft" ${ui.draft.trim() ? "" : "disabled"}>Clear</button>
      <button type="button" class="sv-ghost" data-act="pin-draft" ${ui.draft.trim() ? "" : "disabled"}>Save to board</button>
    </div>
    <p class="sv-kicker sv-gap">${needle ? "Suggestions" : "Often said"}</p>
    <div class="sv-tiles">${suggestions.map((phrase) => `<button type="button" data-act="chip" data-id="${esc(phrase.id)}">${esc(phrase.label)}</button>`).join("")}</div>
    <p class="sv-kicker">Add a word</p>
    <div class="sv-tiles">${WORDS.map((word) => `<button type="button" data-act="word" data-id="${esc(word)}">${esc(word)}</button>`).join("")}</div>
    ${
      state.history.length
        ? `<p class="sv-kicker">Said recently</p>${state.history
            .slice(0, 6)
            .map(
              (item) =>
                `<div class="sv-row"><h3>${esc(item.text)}</h3><button type="button" class="sv-say" data-act="recent" data-id="${esc(item.text)}">Say</button></div>`,
            )
            .join("")}`
        : ""
    }`;
}
function phrasesHtml() {
  const modes = [
    ["used", "Most used"],
    ["recent", "Recent"],
    ["az", "A–Z"],
    ["category", "Group"],
  ];
  const items = sortList(
    visible().filter((phrase) => matches(phrase) && inCat(phrase)),
    ui.sort,
  );
  return `<div class="sv-sheet-bar"><h2 class="sv-h sv-title-tight">Phrases</h2><button type="button" class="sv-ghost" data-act="new" ${state.settings.lockEdits ? "disabled" : ""}>New</button></div>
    <p class="sv-lead">Ordered by what you actually say. Search, then save any line to the board.</p>
    <label class="sv-sr" for="q">Search phrases</label>
    <input id="q" class="sv-search" placeholder="Search phrases" value="${esc(ui.query)}">
    <div class="sv-seg sv-gap" role="radiogroup">${modes
      .map(
        ([id, label]) =>
          `<button type="button" role="radio" aria-checked="${ui.sort === id}" data-act="sort" data-id="${id}">${label}</button>`,
      )
      .join("")}</div>
    ${cats()}
    ${ui.notice ? `<p class="sv-note">${esc(ui.notice)}</p>` : ""}
    ${items.length ? "" : `<p class="sv-note">Nothing matches. Try a shorter word, or add a new phrase.</p>`}
    ${items
      .map(
        (phrase) => `<div class="sv-row"><div><h3>${esc(phrase.label)}</h3><p>${esc(phrase.speak)}</p><div class="sv-meta"><span class="sv-lead sv-inline">${esc(phrase.category)}${phrase.uses ? ` · said ${phrase.uses}` : ""}${phrase.hasClip ? " · voice clip" : ""}</span><button type="button" class="sv-ghost" data-act="pin" data-id="${esc(phrase.id)}">${phrase.pinned ? "On board" : "Save to board"}</button><button type="button" class="sv-ghost" data-act="edit" data-id="${esc(phrase.id)}" ${state.settings.lockEdits ? "disabled" : ""}>Edit</button></div></div><button type="button" class="sv-say" data-act="say" data-id="${esc(phrase.id)}">Say</button></div>`,
      )
      .join("")}`;
}
function toggle(key, label) {
  const on = Boolean(state.settings[key]);
  return `<button type="button" class="sv-toggle" aria-pressed="${on}" data-act="toggle" data-id="${key}"><span>${label}</span><span class="sv-switch" aria-hidden="true"><i></i></span></button>`;
}
function moreHtml() {
  if (ui.more === "home") {
    const rows = [
      ["choices", "Yes or no", "Giant answers when energy is low"],
      ["pain", "Pain scale", "Say a number from 0 to 10"],
      ["look", "Look and reach", "Colors, type size, stronger side"],
      ["voice", "Voice", "Speed, pitch, and which voice speaks"],
      ["backup", "Backup", "Save phrases or move them to another phone"],
      ["install", "Install on her phone", "Add SteadyVoice to the Android home screen"],
    ];
    return `<h2 class="sv-h">More</h2><div class="sv-menu">${rows
      .map(
        ([id, title, hint]) =>
          `<button type="button" data-act="more" data-id="${id}"><strong>${title}</strong><span>${hint}</span></button>`,
      )
      .join("")}</div><p class="sv-note">Nothing you type is uploaded. Phrases, history, and voice clips stay on this phone.</p>`;
  }
  const back = `<button type="button" class="sv-back" data-act="back">Back</button>`;
  if (ui.more === "choices") {
    return `${back}<h2 class="sv-h">Yes or no</h2><p class="sv-lead">Big answers for when you are tired.</p><div class="sv-choice-grid">${CHOICES.map(
      ([label, text, tone]) =>
        `<button type="button" class="sv-choice tone-${tone}" data-act="choice" data-id="${esc(text)}">${esc(label)}</button>`,
    ).join("")}</div>`;
  }
  if (ui.more === "pain") {
    return `${back}<h2 class="sv-h">Pain scale</h2><p class="sv-lead">0 is none. 10 is the worst. Tap a number and the phone will say it.</p><div class="sv-pain">${Array.from(
      { length: 11 },
      (_, n) =>
        `<button type="button" class="${n >= 7 ? "hot" : n >= 4 ? "mid" : ""}" data-act="pain" data-id="${n}">${n}</button>`,
    ).join("")}</div>`;
  }
  if (ui.more === "look") {
    return `${back}<h2 class="sv-h">Look and reach</h2>
      <div class="sv-theme-grid">${THEMES.map(
        ([id, label]) =>
          `<button type="button" class="sv-swatch theme-${id}${state.settings.theme === id ? " is-on" : ""}" data-act="theme" data-id="${id}">${label}</button>`,
      ).join("")}</div>
      <p class="sv-kicker sv-gap">Type size</p>
      <div class="sv-seg">${[
        [1, "Comfort"],
        [2, "Large"],
        [3, "Larger"],
        [4, "Huge"],
      ]
        .map(
          ([scale, label]) =>
            `<button type="button" aria-pressed="${state.settings.scale === scale}" data-act="scale" data-id="${scale}">${label}</button>`,
        )
        .join("")}</div>
      <p class="sv-kicker sv-gap">Board columns</p>
      <div class="sv-seg">${[1, 2, 3]
        .map(
          (n) =>
            `<button type="button" aria-pressed="${state.settings.columns === n}" data-act="cols" data-id="${n}">${n}</button>`,
        )
        .join("")}</div>
      <p class="sv-kicker sv-gap">Button shape</p>
      <div class="sv-seg">${[
        ["soft", "Soft"],
        ["round", "Round"],
        ["square", "Square"],
      ]
        .map(
          ([id, label]) =>
            `<button type="button" aria-pressed="${state.settings.shape === id}" data-act="shape" data-id="${id}">${label}</button>`,
        )
        .join("")}</div>
      <p class="sv-kicker sv-gap">Stronger side</p>
      <p class="sv-lead">Puts Yes and Quiet toward the hand that is easier. Helpful if one side is weak.</p>
      <div class="sv-seg">${[
        ["left", "Left"],
        ["right", "Right"],
      ]
        .map(
          ([id, label]) =>
            `<button type="button" aria-pressed="${state.settings.hand === id}" data-act="hand" data-id="${id}">${label}</button>`,
        )
        .join("")}</div>
      ${toggle("wideType", "Wider letter spacing")}
      ${toggle("quickBar", "Yes / No bar")}
      ${toggle("confirm", "Confirm before speaking on the board")}
      ${toggle("haptics", "Vibrate on tap")}
      ${toggle("wake", "Keep the screen awake")}
      ${toggle("lockEdits", "Lock editing")}
      <button type="button" class="sv-toggle" aria-pressed="${state.settings.boardSort === "manual"}" data-act="toggle" data-id="boardSort"><span>Arrange the board myself</span><span class="sv-switch"><i></i></span></button>`;
  }
  if (ui.more === "voice") {
    const voices = [...ui.voices].sort((a, b) => Number(!a.lang.toLowerCase().startsWith("en")) - Number(!b.lang.toLowerCase().startsWith("en")) || a.name.localeCompare(b.name));
    return `${back}<h2 class="sv-h">Voice</h2><p class="sv-lead">Slower speech is easier to follow. Clear is a good start.</p>
      <div class="sv-seg">${[
        ["Slow", 0.7],
        ["Clear", 0.86],
        ["Natural", 1.02],
      ]
        .map(
          ([label, rate]) =>
            `<button type="button" aria-pressed="${Math.abs(state.settings.rate - rate) < 0.02}" data-act="rate" data-id="${rate}">${label}</button>`,
        )
        .join("")}</div>
      <div class="sv-field"><label data-for="rate">Speed ${state.settings.rate.toFixed(2)}</label><input class="sv-slider" type="range" min="0.5" max="1.25" step="0.01" value="${state.settings.rate}" data-set="rate"></div>
      <div class="sv-field"><label data-for="pitch">Pitch ${state.settings.pitch.toFixed(2)}</label><input class="sv-slider" type="range" min="0.6" max="1.4" step="0.01" value="${state.settings.pitch}" data-set="pitch"></div>
      <div class="sv-field"><label data-for="volume">Volume ${Math.round(state.settings.volume * 100)}</label><input class="sv-slider" type="range" min="0.2" max="1" step="0.05" value="${state.settings.volume}" data-set="volume"></div>
      <div class="sv-field"><label for="voice">Phone voice</label><select id="voice" class="sv-select" data-set="voice">${[`<option value="">Best English voice on this phone</option>`]
        .concat(voices.map((voice) => `<option value="${esc(voice.voiceURI)}" ${voice.voiceURI === state.settings.voiceURI ? "selected" : ""}>${esc(voice.name)} · ${esc(voice.lang)}</option>`))
        .join("")}</select></div>
      ${voices.length ? "" : `<p class="sv-note">Voices appear after Chrome loads them. If this list is empty, wait a moment and open this page again.</p>`}
      ${toggle("preferClips", "Play a saved voice clip when a button has one")}
      <button type="button" class="sv-primary" data-act="test">Hear this voice</button>`;
  }
  if (ui.more === "backup") {
    return `${back}<h2 class="sv-h">Backup</h2><p class="sv-lead">Phrases stay on this phone. A backup file lets you move them to another one.</p>
      <button type="button" class="sv-primary" data-act="export">Download backup</button>
      <button type="button" class="sv-ghost sv-block" data-act="import">Restore a backup</button>
      <button type="button" class="sv-ghost sv-block" data-act="restore">Restore starter phrases</button>
      <button type="button" class="sv-ghost sv-block" data-act="clear-history">Clear recent list</button>
      ${ui.notice ? `<p class="sv-note">${esc(ui.notice)}</p>` : ""}`;
  }
  return `${back}<h2 class="sv-h">Install on Android</h2>
    <p class="sv-lead">No Play Store. Chrome can put SteadyVoice on the home screen. It keeps working offline after that.</p>
    <ol class="sv-lead"><li>Open this link in Chrome.</li><li>Tap the three-dot menu.</li><li>Tap Install app, or Add to Home screen.</li><li>Open SteadyVoice from the home screen.</li></ol>
    <p class="sv-note">${esc(INSTALL_URL)}</p>
    <button type="button" class="sv-primary" data-act="copy">Copy install link</button>
    ${ui.notice ? `<p class="sv-note">${esc(ui.notice)}</p>` : ""}`;
}
function editorHtml() {
  const draft = ui.editor;
  if (!draft) return "";
  return `<div class="sv-sheet-back" data-act="close-editor"><div class="sv-sheet" role="dialog" aria-modal="true">
    <div class="sv-sheet-bar"><h2 class="sv-h sv-title-tight">${draft.id ? "Edit phrase" : "New phrase"}</h2><button type="button" class="sv-ghost" data-act="close-editor">Close</button></div>
    <div class="sv-field"><label for="ed-label">Button label</label><input id="ed-label" class="sv-search" maxlength="32" value="${esc(draft.label)}"></div>
    <div class="sv-field"><label for="ed-speak">Words to say</label><textarea id="ed-speak" class="sv-input">${esc(draft.speak)}</textarea></div>
    <p class="sv-kicker">Group</p>
    <div class="sv-cats">${CATS.map((item) => `<button type="button" class="sv-chip${draft.category === item ? " is-on" : ""}" data-act="ed-cat" data-id="${item}">${item}</button>`).join("")}</div>
    <button type="button" class="sv-toggle" aria-pressed="${draft.pinned}" data-act="ed-pin"><span>Show on the board</span><span class="sv-switch"><i></i></span></button>
    <div class="sv-actions"><button type="button" class="sv-ghost" data-act="preview-editor">Preview</button><button type="button" class="sv-ghost" data-act="record">${ui.recording ? "Stop recording" : "Record a voice"}</button></div>
    ${ui.recording ? `<p class="sv-note">Recording… tap Stop, or it will stop after 8 seconds.</p>` : ""}
    <button type="button" class="sv-primary" data-act="save-editor">Save</button>
    ${
      draft.id
        ? ui.confirmDelete
          ? `<button type="button" class="sv-ghost sv-danger sv-block" data-act="delete-editor">${draft.custom ? "Yes, delete it" : "Yes, hide it"}</button>`
          : `<button type="button" class="sv-ghost sv-danger sv-block" data-act="ask-delete">${draft.custom ? "Delete phrase" : "Hide phrase"}</button>`
        : ""
    }
  </div></div>`;
}
function shell(main) {
  const againDisabled = state.history[0] ? "" : "disabled";
  const quick =
    state.settings.quickBar && (ui.view === "board" || ui.view === "speak")
      ? `<div class="sv-quick">${QUICK.map(
          ([label, text]) => `<button type="button" data-act="quick" data-id="${esc(text)}">${label}</button>`,
        ).join("")}<button type="button" class="sv-quiet" data-act="quiet">Quiet</button></div>`
      : "";
  const armed = state.phrases.find((phrase) => phrase.id === ui.armed && phrase.pinned && !phrase.hidden);
  const confirm =
    ui.view === "board" && armed
      ? `<div class="sv-confirm"><button type="button" class="sv-primary" data-act="say" data-id="${esc(armed.id)}">Say “${esc(armed.label)}”</button></div>`
      : "";
  const live = ui.speaking
    ? `<div class="sv-live"><p>${esc(ui.speaking)}</p><button type="button" class="sv-quiet" data-act="quiet">Quiet</button></div>`
    : "";
  const nav = [
    ["board", "Board"],
    ["speak", "Speak"],
    ["phrases", "Phrases"],
    ["more", "More"],
  ]
    .map(
      ([id, label]) =>
        `<button type="button" class="sv-navbtn${ui.view === id ? " is-on" : ""}" data-act="nav" data-id="${id}">${label}</button>`,
    )
    .join("");
  return `<header class="sv-header"><p class="sv-brand">SteadyVoice</p><button type="button" class="sv-again" data-act="again" ${againDisabled}>Again</button></header>
    <main class="sv-main">${main}</main>${live}${confirm}${quick}<nav class="sv-nav">${nav}</nav>${editorHtml()}
    <p class="sv-sr" aria-live="polite">${esc(ui.speaking || ui.notice)}</p>`;
}
function render() {
  const root = document.getElementById("app");
  const active = document.activeElement;
  const focusId = active && active.id;
  const start = active && active.selectionStart;
  const end = active && active.selectionEnd;
  const s = state.settings;
  root.dataset.theme = s.theme;
  root.dataset.scale = String(s.scale);
  root.dataset.cols = String(s.columns);
  root.dataset.shape = s.shape;
  root.dataset.hand = s.hand;
  root.classList.toggle("is-wide", Boolean(s.wideType));
  const main = ui.view === "board" ? boardHtml() : ui.view === "speak" ? speakHtml() : ui.view === "phrases" ? phrasesHtml() : moreHtml();
  root.innerHTML = shell(main);
  const dark = s.theme === "night" || s.theme === "dusk" || s.theme === "contrast";
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus();
      if (typeof start === "number" && el.setSelectionRange) {
        try {
          el.setSelectionRange(start, end);
        } catch {
          /* range inputs */
        }
      }
    }
  }
}

function openEditor(phrase) {
  if (state.settings.lockEdits) {
    notice("Editing is locked. Turn it off under More.");
    return;
  }
  ui.confirmDelete = false;
  ui.editor = phrase
    ? { id: phrase.id, label: phrase.label, speak: phrase.speak, category: phrase.category, pinned: phrase.pinned, custom: phrase.custom }
    : { label: "", speak: "", category: "Talk", pinned: true, custom: true };
  render();
}
function ensureSaved() {
  const draft = ui.editor;
  if (!draft) return null;
  const label = draft.label.trim() || draft.speak.trim().slice(0, 28);
  const spoken = draft.speak.trim() || label;
  if (!label) return null;
  let id = draft.id;
  if (id) {
    state.phrases = state.phrases.map((phrase) =>
      phrase.id === id
        ? { ...phrase, label, speak: spoken, category: draft.category, tone: TONE[draft.category], pinned: draft.pinned, hidden: false }
        : phrase,
    );
  } else {
    id = uid();
    state.phrases.unshift({
      id,
      label,
      speak: spoken,
      category: draft.category,
      tone: TONE[draft.category],
      uses: 0,
      lastUsed: 0,
      pinned: draft.pinned,
      order: Date.now(),
      custom: true,
      hidden: false,
      hasClip: false,
    });
  }
  ui.editor = { ...draft, id, label, speak: spoken, custom: draft.custom ?? !draft.id };
  save();
  return id;
}
function saveEditor() {
  if (!ensureSaved()) {
    notice("Add a few words first.");
    return;
  }
  const pinned = ui.editor?.pinned;
  ui.editor = null;
  notice(pinned ? "Saved on the board." : "Phrase saved.");
}
async function record() {
  if (ui.recording && rec) {
    rec.stop();
    ui.recording = false;
    render();
    return;
  }
  const id = ensureSaved();
  if (!id) {
    notice("Add the words first, then record.");
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const media = new MediaRecorder(stream);
    rec = media;
    const chunks = [];
    media.ondataavailable = (event) => {
      if (event.data.size) chunks.push(event.data);
    };
    media.onstop = () => {
      stream.getTracks().forEach((track) => track.stop());
      const blob = new Blob(chunks, { type: media.mimeType || "audio/webm" });
      ui.recording = false;
      if (!blob.size) return;
      void putClip(id, blob).then(() => {
        state.phrases = state.phrases.map((item) => (item.id === id ? { ...item, hasClip: true } : item));
        save();
        notice("Voice clip saved for this button.");
      });
    };
    media.start();
    ui.recording = true;
    render();
    window.setTimeout(() => {
      if (media.state === "recording") media.stop();
    }, 8000);
  } catch {
    notice("Microphone is blocked. The typed sentence can still be spoken.");
  }
}

document.body.addEventListener("click", (event) => {
  const target = event.target.closest("[data-act]");
  if (!target) return;
  const act = target.dataset.act;
  const id = target.dataset.id || "";
  if (act === "close-editor" && event.target !== target) return;
  if (act === "nav") {
    ui.view = id;
    if (id === "more") ui.more = "home";
    ui.query = "";
    render();
    return;
  }
  if (act === "quiet") {
    stopSpeech();
    render();
    return;
  }
  if (act === "again" && state.history[0]) {
    sayText(state.history[0].text);
    return;
  }
  if (act === "quick" || act === "choice" || act === "recent") {
    sayText(id);
    return;
  }
  if (act === "pain") {
    const n = Number(id);
    sayText(n === 0 ? "I have no pain right now." : `My pain is a ${n} out of 10.`);
    return;
  }
  if (act === "pad") {
    const phrase = state.phrases.find((item) => item.id === id);
    if (!phrase) return;
    if (state.settings.confirm) {
      buzz();
      ui.armed = ui.armed === id ? null : id;
      render();
      return;
    }
    void sayPhrase(phrase);
    return;
  }
  if (act === "say") {
    const phrase = state.phrases.find((item) => item.id === id);
    if (phrase) void sayPhrase(phrase);
    return;
  }
  if (act === "pin") {
    const phrase = state.phrases.find((item) => item.id === id);
    if (!phrase) return;
    if (phrase.pinned && state.settings.lockEdits) {
      notice("Unlock editing to remove a board button.");
      return;
    }
    phrase.pinned = !phrase.pinned;
    if (phrase.pinned) phrase.order = Date.now();
    save();
    notice(phrase.pinned ? "Saved on the board." : "Removed from the board.");
    return;
  }
  if (act === "edit") {
    const phrase = state.phrases.find((item) => item.id === id);
    if (phrase) openEditor(phrase);
    return;
  }
  if (act === "new") {
    openEditor();
    return;
  }
  if (act === "move") {
    const pinned = visible()
      .filter((phrase) => phrase.pinned)
      .sort((a, b) => a.order - b.order);
    const index = pinned.findIndex((phrase) => phrase.id === id);
    const swap = index + Number(target.dataset.dir);
    if (index < 0 || swap < 0 || swap >= pinned.length) return;
    const order = pinned[index].order;
    pinned[index].order = pinned[swap].order;
    pinned[swap].order = order;
    save();
    render();
    return;
  }
  if (act === "say-draft") {
    sayText(ui.draft);
    return;
  }
  if (act === "undo-word") {
    ui.draft = ui.draft.trim().split(/\s+/).slice(0, -1).join(" ");
    render();
    return;
  }
  if (act === "clear-draft") {
    ui.draft = "";
    render();
    return;
  }
  if (act === "pin-draft") {
    const clean = ui.draft.trim();
    const existing = visible().find((phrase) => phrase.speak.toLowerCase() === clean.toLowerCase() || phrase.label.toLowerCase() === clean.toLowerCase());
    if (existing) {
      existing.pinned = true;
      save();
      notice("Saved on the board.");
      return;
    }
    ui.editor = { label: clean.length > 22 ? `${clean.slice(0, 20)}…` : clean, speak: clean, category: "Talk", pinned: true, custom: true };
    render();
    return;
  }
  if (act === "chip") {
    const phrase = state.phrases.find((item) => item.id === id);
    if (!phrase) return;
    if (!ui.draft.trim()) void sayPhrase(phrase);
    else {
      ui.draft = phrase.speak;
      render();
    }
    return;
  }
  if (act === "word") {
    ui.draft = `${ui.draft}${ui.draft && !ui.draft.endsWith(" ") ? " " : ""}${id}`;
    render();
    return;
  }
  if (act === "sort") {
    ui.sort = id;
    render();
    return;
  }
  if (act === "cat") {
    ui.category = id;
    render();
    return;
  }
  if (act === "more") {
    ui.more = id;
    render();
    return;
  }
  if (act === "back") {
    ui.more = "home";
    render();
    return;
  }
  if (act === "theme") state.settings.theme = id;
  if (act === "scale") state.settings.scale = Number(id);
  if (act === "cols") state.settings.columns = Number(id);
  if (act === "shape") state.settings.shape = id;
  if (act === "hand") state.settings.hand = id;
  if (act === "rate") state.settings.rate = Number(id);
  if (act === "toggle") {
    if (id === "boardSort") state.settings.boardSort = state.settings.boardSort === "manual" ? "used" : "manual";
    else state.settings[id] = !state.settings[id];
  }
  if (["theme", "scale", "cols", "shape", "hand", "rate", "toggle"].includes(act)) {
    save();
    if (!state.settings.wake && wakeLock) {
      void wakeLock.release();
      wakeLock = null;
    } else askWake();
    render();
    return;
  }
  if (act === "test") {
    sayText("Hello. This is my voice. I need a moment to answer.");
    return;
  }
  if (act === "export") {
    const blob = new Blob([JSON.stringify({ app: "SteadyVoice", version: 1, ...state })], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "steadyvoice-backup.json";
    link.click();
    URL.revokeObjectURL(url);
    return;
  }
  if (act === "import") {
    document.getElementById("file").click();
    return;
  }
  if (act === "restore") {
    const byId = new Map(state.phrases.map((phrase) => [phrase.id, phrase]));
    const restored = starters().map((seed) => {
      const current = byId.get(seed.id);
      return current ? { ...current, hidden: false } : seed;
    });
    const customs = state.phrases.filter((phrase) => phrase.custom);
    state.phrases = customs.concat(restored);
    save();
    notice("Starter phrases are back.");
    return;
  }
  if (act === "clear-history") {
    state.history = [];
    save();
    notice("Recent list cleared.");
    return;
  }
  if (act === "copy") {
    navigator.clipboard?.writeText(INSTALL_URL).then(
      () => notice("Link copied."),
      () => notice(INSTALL_URL),
    );
    return;
  }
  if (act === "close-editor") {
    if (rec && rec.state === "recording") rec.stop();
    ui.editor = null;
    ui.recording = false;
    render();
    return;
  }
  if (act === "ed-cat" && ui.editor) {
    ui.editor.category = id;
    render();
    return;
  }
  if (act === "ed-pin" && ui.editor) {
    ui.editor.pinned = !ui.editor.pinned;
    render();
    return;
  }
  if (act === "preview-editor" && ui.editor) {
    sayText(ui.editor.speak || ui.editor.label);
    return;
  }
  if (act === "save-editor") {
    saveEditor();
    return;
  }
  if (act === "ask-delete") {
    ui.confirmDelete = true;
    render();
    return;
  }
  if (act === "delete-editor" && ui.editor?.id) {
    const current = state.phrases.find((phrase) => phrase.id === ui.editor.id);
    if (current?.custom) state.phrases = state.phrases.filter((phrase) => phrase.id !== current.id);
    else if (current) {
      current.hidden = true;
      current.pinned = false;
    }
    if (current?.hasClip) void dropClip(current.id);
    save();
    ui.editor = null;
    notice(current?.custom ? "Phrase deleted." : "Phrase hidden. Restore it under More.");
    return;
  }
  if (act === "record") void record();
});

document.body.addEventListener("input", (event) => {
  const el = event.target;
  if (el.id === "q") {
    ui.query = el.value;
    render();
    return;
  }
  if (el.id === "say-box") {
    ui.draft = el.value;
    render();
    return;
  }
  if (el.id === "ed-label" && ui.editor) ui.editor.label = el.value;
  if (el.id === "ed-speak" && ui.editor) ui.editor.speak = el.value;
  if (el.dataset.set === "rate" || el.dataset.set === "pitch" || el.dataset.set === "volume") {
    state.settings[el.dataset.set] = Number(el.value);
    save();
    const label = el.parentElement?.querySelector("label");
    if (label && el.dataset.set === "rate") label.textContent = `Speed ${state.settings.rate.toFixed(2)}`;
    if (label && el.dataset.set === "pitch") label.textContent = `Pitch ${state.settings.pitch.toFixed(2)}`;
    if (label && el.dataset.set === "volume") label.textContent = `Volume ${Math.round(state.settings.volume * 100)}`;
  }
  if (el.dataset.set === "voice") {
    state.settings.voiceURI = el.value;
    state.settings.voiceName = el.selectedOptions[0]?.textContent?.split(" · ")[0] || "";
    save();
  }
});

document.body.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && event.target.id === "say-box" && !event.shiftKey) {
    event.preventDefault();
    sayText(ui.draft);
  }
});

let wakeLock = null;
function askWake() {
  if (!state.settings.wake || !navigator.wakeLock || document.visibilityState !== "visible") return;
  navigator.wakeLock.request("screen").then((sentinel) => {
    wakeLock = sentinel;
  }).catch(() => undefined);
}
document.addEventListener("visibilitychange", askWake);

function pullVoices() {
  ui.voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  if (ui.view === "more" && ui.more === "voice") render();
}
if (window.speechSynthesis) {
  pullVoices();
  window.speechSynthesis.addEventListener("voiceschanged", pullVoices);
  window.setInterval(() => {
    if (window.speechSynthesis.speaking) window.speechSynthesis.resume();
  }, 7000);
}

const file = document.createElement("input");
file.id = "file";
file.type = "file";
file.accept = "application/json";
file.className = "sv-sr";
file.addEventListener("change", async () => {
  const picked = file.files && file.files[0];
  file.value = "";
  if (!picked) return;
  try {
    const data = JSON.parse(await picked.text());
    if (!Array.isArray(data.phrases)) {
      notice("That file has no phrases.");
      return;
    }
    state = {
      phrases: data.phrases,
      history: Array.isArray(data.history) ? data.history : [],
      settings: { ...defaults().settings, ...(data.settings || {}) },
    };
    save();
    notice("Backup restored on this phone.");
  } catch {
    notice("Could not read that backup.");
  }
});
document.body.appendChild(file);

const pageProtocol = location.protocol;
if ((pageProtocol === "https:" || pageProtocol === "http:") && "serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => undefined);
}

render();
askWake();
