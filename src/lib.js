"use strict";

export const ORGANIZE_PRESETS = {
  minimal: {
    label: "Minimal",
    description: "A few broad top-level folders, no deep nesting.",
    instruction:
      "Keep the number of categories small (at most {maxCategories}). Prefer 3-6 broad folders over many specific ones."
  },
  topic: {
    label: "By topic",
    description: "Group bookmarks by subject area.",
    instruction:
      "Group bookmarks by subject area (e.g. Development, News, Shopping, Recipes). Name folders as short, concrete nouns."
  },
  project: {
    label: "By project",
    description: "Group by project or activity the user is likely working on.",
    instruction:
      "Group bookmarks around projects or recurring activities (a specific repo, a trip, a course). Name folders after the project or site."
  },
  balanced: {
    label: "Balanced (default)",
    description: "Mix of broad topics and useful specificity.",
    instruction:
      "Balance folder count against specificity: enough categories to be useful (at most {maxCategories}), but avoid one-item folders when possible."
  },
  flat: {
    label: "Flat (no folders)",
    description: "Do not reorganize folders; only clean up titles.",
    instruction:
      "Do NOT propose any new folders. For every bookmark, set 'category' to its current top-level folder and focus only on newTitle."
  },
  custom: {
    label: "Custom",
    description: "Define your own rules in the Extra instructions box below.",
    instruction:
      "Follow the user's extra instructions below as the primary organizing scheme. Provide up to {maxCategories} categories."
  }
};

export const DEFAULT_OPTIONS = {
  endpoint: "https://openrouter.ai/api/v1/chat/completions",
  model: "auto",
  apiKey: "",
  batchSize: 20,
  disableReasoning: false,
  rules: {
    preset: "balanced",
    rename: true,
    maxCategories: 8,
    customInstructions: ""
  }
};

const AI_TIMEOUT_MS = 120000;
const REASONING_PATTERNS = [
  ["reasoning", (d) => d.reasoning],
  ["reasoning_content", (d) => d.reasoning_content],
  ["reasoning_details", (d) => (d.reasoning_details || []).map((x) => x.text || "").join("")]
];

const ROOT_FILTER_IDS = ["root________", "menu________", "toolbar_____", "unfiled_____", "mobile______"];

export async function getOptions() {
  const stored = await browser.storage.local.get(DEFAULT_OPTIONS);
  const rules = { ...DEFAULT_OPTIONS.rules, ...(stored.rules || {}) };
  return { ...DEFAULT_OPTIONS, ...stored, rules };
}

export async function readBookmarks() {
  const tree = await browser.bookmarks.getTree();
  return buildTreeSummary(tree);
}

export function buildTreeSummary(tree) {
  const folders = [];
  const bookmarks = [];
  function walk(node, path) {
    const isFolder = node.type === "folder" || node.type === "root";
    if (isFolder) {
      let count = 0;
      if (node.children) for (const c of node.children) if (c.type === "bookmark") count++;
      folders.push({ id: node.id, title: node.title || "", path: path, bookmarkCount: count });
    }
    const childPath = isFolder && node.title ? path.concat([node.title]) : path;
    for (const c of node.children || []) walk(c, childPath);
    if (node.type === "bookmark") {
      bookmarks.push({ id: node.id, title: node.title || "", url: node.url || "", path: path });
    }
  }
  for (const root of tree) walk(root, []);
  return { folders, bookmarks };
}

export function cleanupStats(bookmarks, memory) {
  let cleaned = 0;
  for (const b of bookmarks) if (memory && memory[b.id]) cleaned++;
  return { total: bookmarks.length, cleaned, neverCleaned: bookmarks.length - cleaned };
}

export function selectBatch(bookmarks, memory, batchSize, includeCleaned = false) {
  const size = Math.max(1, Number(batchSize) || 20);
  const scored = bookmarks.map((b) => {
    const last = (memory && memory[b.id]) || 0;
    return { b, depth: b.path.length, last, never: !last || includeCleaned };
  });
  scored.sort((x, y) => {
    if (x.never !== y.never) return x.never ? -1 : 1;
    if (x.depth !== y.depth) return x.depth - y.depth;
    if (x.last !== y.last) return x.last - y.last;
    return x.b.id.localeCompare(y.b.id);
  });
  const batch = scored.slice(0, size).map((s) => s.b);
  const stats = cleanupStats(bookmarks, memory);
  stats.next = Math.min(includeCleaned ? stats.total : stats.neverCleaned, batch.length);
  stats.batchSize = size;
  return { batch, stats };
}

export function buildPrompt(bookmarks, rules, folders = []) {
  const r = { ...DEFAULT_OPTIONS.rules, ...(rules || {}) };
  const preset = ORGANIZE_PRESETS[r.preset] || ORGANIZE_PRESETS.balanced;
  const maxCats = Number(r.maxCategories) || 8;

  const knownFolders = [...new Set(folders.map((f) => f.path.join(" > ")).filter(Boolean))];

  const promptRules = [
    "- 'category' must be one of 'categories'.",
    "- Include an assignment for EVERY bookmark index."
  ];

  if (r.preset === "flat") {
    promptRules.push(preset.instruction.replace("{maxCategories}", maxCats));
    if (r.customInstructions && r.customInstructions.trim()) {
      promptRules.push(`- Also honor these extra user suggestions: ${r.customInstructions.trim()}`);
    }
  } else {
    promptRules.push("- Categories must be mutually exclusive.");
    promptRules.push("- Reuse existing folder names when they make sense.");
    if (r.preset === "custom") {
      promptRules.push(`- ${preset.instruction.replace("{maxCategories}", maxCats)}`);
      if (r.customInstructions && r.customInstructions.trim()) {
        promptRules.push(`- Follow these user rules as the PRIMARY scheme: ${r.customInstructions.trim()}`);
      }
    } else {
      promptRules.push(`- ${preset.instruction.replace("{maxCategories}", maxCats)}`);
      if (r.customInstructions && r.customInstructions.trim()) {
        promptRules.push(`- Also honor these extra user suggestions: ${r.customInstructions.trim()}`);
      }
    }
  }

  if (r.rename) {
    promptRules.push(
      "- Suggest 'newTitle' for every bookmark's title when it can be improved: fix ALL-CAPS or lowercase junk, " +
        "strip trailing ' - Google Search' or '(bookmark)' noise, remove raw URLs in the title, title-case proper nouns, " +
        "and keep the title recognizable and short. Keep the original when it is already clean."
    );
  } else {
    promptRules.push("- Do not change titles: keep 'newTitle' empty (or omit it) for every bookmark.");
    promptRules.push("- 'newTitle' should NEVER be included in the output.");
  }

  const lines = bookmarks.map((b, i) => `${i}: [${b.path.join(">")}] ${b.title} ${b.url}`);
  return [
    "You are a bookmark organizer. Given a flat list of bookmarks (id: [folder] title url), propose a clean category structure.",
    "Respond with STRICT JSON only. No markdown, no prose.",
    "Schema:",
    '{',
    '  "categories": ["CategoryName", ...],',
    '  "assignments": [ { "index": 0, "category": "CategoryName", "newTitle": "" } ]',
    '}',
    "Rules:",
    ...promptRules,
    ...(knownFolders.length
      ? ["", "Existing folders you already have (reuse these when a category matches — do not create a duplicate):", ...knownFolders]
      : []),
    "",
    "Bookmarks:",
    ...lines
  ].join("\n");
}

export function parseSuggestions(text) {
  const cleaned = text.replace(/```json/gi, "").replace(/```/g, "").trim();
  const json = JSON.parse(cleaned);
  if (!Array.isArray(json.categories) || !Array.isArray(json.assignments)) {
    throw new Error("Unexpected response shape: expected {categories, assignments}.");
  }
  return json;
}

export async function askAIStream(bookmarks, rules, folders, onProgress) {
  const options = await getOptions();
  if (!options.apiKey) {
    throw new Error("No API key configured. Open the extension options and add your OpenRouter key.");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const body = {
      model: options.model,
      messages: [{ role: "user", content: buildPrompt(bookmarks, rules || options.rules, folders) }],
      stream: true
    };
    if (options.disableReasoning) {
      body.reasoning = { effort: "none", exclude: true };
    }
    const response = await fetch(options.endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${options.apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`AI request failed (${response.status}): ${detail.slice(0, 300)}`);
    }
    return await readStream(response.body, onProgress || (() => {}));
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error(`Timed out after ${AI_TIMEOUT_MS / 1000}s waiting for the AI response. The model may be loaded/slow or reasoning. Try a smaller model in Options.`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function readStream(body, onProgress) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let reasoningLen = 0;
  const report = () => onProgress(content.length, reasoningLen);
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // Split on double newline; tolerate \r\n, \n, \r
    const parts = buffer.split(/\r?\n\r?\n/);
    buffer = parts.pop();
    for (const part of parts) {
      const lines = part.split(/\r?\n/);
      let data = "";
      for (const line of lines) {
        if (line.startsWith("data:")) data += line.slice(5);
        else if (line.length === 0) continue;
      }
      if (data.trim() === "[DONE]") {
        try { reader.cancel(); } catch (e) { /* already closed */ }
        if (!content) throw new Error("AI returned an empty response.");
        return parseSuggestions(content);
      }
      if (!data.trim()) continue;
      try {
        const json = JSON.parse(data);
        const delta =
          (json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content) ||
          (json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content);
        if (delta) content += delta;
        const choice = json.choices && json.choices[0];
        const d = (choice && (choice.delta || choice.message)) || {};
        const reasonText = d.reasoning || d.reasoning_content || "";
        if (typeof reasonText === "string" && reasonText.length) reasoningLen += reasonText.length;
        report();
      } catch (e) {
        // ignore malformed chunk
      }
    }
  }
  if (!content) throw new Error("AI returned an empty response.");
  return parseSuggestions(content);
}

export function buildDiff(bookmarks, suggestions, folders = []) {
  const categories = suggestions.categories || [];
  const folderNames = folders.map((f) => f.title).filter(Boolean).map((s) => s.trim());
  const byLower = new Map();
  for (const n of folderNames) byLower.set(n.toLowerCase(), n);

  const remap = {};
  for (const c of categories) {
    const key = (c || "").trim().toLowerCase();
    remap[c] = byLower.get(key) || c;
  }

  const createFolders = [];
  const createdKeys = new Set();
  for (const c of categories) {
    const name = remap[c];
    if (!name || byLower.has(name.toLowerCase())) continue;
    const key = name.toLowerCase();
    if (createdKeys.has(key)) continue;
    createdKeys.add(key);
    createFolders.push({ name });
  }

  const moves = [];
  const renames = [];
  for (const a of suggestions.assignments || []) {
    const bm = bookmarks[a.index];
    if (!bm) continue;
    const currentRoot = bm.path[0] || "";
    const target = (remap[a.category] || "").trim();
    if (target && target !== currentRoot) {
      moves.push({ id: bm.id, title: bm.title, fromFolder: currentRoot || undefined, toFolder: target });
    }
    if (a.newTitle && a.newTitle !== bm.title) {
      renames.push({ id: bm.id, from: bm.title, to: a.newTitle });
    }
  }
  return { createFolders, moves, renames };
}

async function ensureFolder(name) {
  const existing = await browser.bookmarks.search({ title: name });
  for (const b of existing) {
    if (b.type === "folder" && !ROOT_FILTER_IDS.includes(b.id)) return b.id;
  }
  const created = await browser.bookmarks.create({ title: name, type: "folder" });
  return created.id;
}

export async function applyChanges(diff) {
  const summary = { foldersCreated: 0, moved: 0, renamed: 0, skippedMoves: 0 };
  const folderIds = {};
  for (const f of diff.createFolders || []) {
    try {
      const id = await ensureFolder(f.name);
      if (id) { folderIds[f.name] = id; summary.foldersCreated++; }
    } catch (e) { /* folder already created concurrently */ }
  }
  for (const m of diff.moves || []) {
    try {
      const target = folderIds[m.toFolder] || (await ensureFolder(m.toFolder));
      folderIds[m.toFolder] = target;
      const existing = await browser.bookmarks.get(m.id);
      if (existing.parentId === target) { summary.skippedMoves++; continue; }
      await browser.bookmarks.move(m.id, { parentId: target });
      summary.moved++;
    } catch (e) { /* node gone or invalid */ }
  }
  for (const r of diff.renames || []) {
    try { await browser.bookmarks.update(r.id, { title: r.to }); summary.renamed++; }
    catch (e) { /* node gone */ }
  }
  return summary;
}