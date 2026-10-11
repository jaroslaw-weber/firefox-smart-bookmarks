import {
  readBookmarks,
  askAIStream,
  buildDiff,
  applyChanges,
  getOptions,
  DEFAULT_OPTIONS,
  selectBatch,
  cleanupStats
} from "./lib.js";

async function readCleanupMemory() {
  const { cleanupMemory } = await browser.storage.local.get("cleanupMemory");
  return cleanupMemory || {};
}

async function markCleaned(ids) {
  if (!ids || !ids.length) return;
  const memory = await readCleanupMemory();
  const now = Date.now();
  for (const id of ids) memory[id] = now;
  await browser.storage.local.set({ cleanupMemory: memory });
}

browser.browserAction.onClicked.addListener(() => {
  browser.tabs.create({ url: browser.runtime.getURL("src/workspace/index.html") });
});

browser.runtime.onConnect.addListener((port) => {
  port.onMessage.addListener(async (message) => {
    if (message && message.type === "RECOMMEND_STREAM") {
      const closed = { value: false };
      port.onDisconnect.addListener(() => { closed.value = true; });
      try {
        const { folders, bookmarks } = await readBookmarks();
        const options = await getOptions();
        const memory = await readCleanupMemory();
        const { batch, stats } = selectBatch(
          bookmarks,
          memory,
          options.batchSize || 20,
          !!message.includeCleaned
        );
        if (closed.value) return;
        port.postMessage({ ok: true, kind: "batch", batchIds: batch.map((b) => b.id), stats });
        const suggestions = await askAIStream(batch, options.rules, folders, (len, reasoningLen) => {
          if (closed.value) return;
          port.postMessage({ ok: true, kind: "progress", chars: len, reasoning: reasoningLen || 0 });
        });
        if (closed.value) return;
        port.postMessage({
          ok: true,
          kind: "result",
          categories: suggestions.categories,
          diff: buildDiff(batch, suggestions, folders),
          batchIds: batch.map((b) => b.id),
          stats
        });
      } catch (err) {
        if (!closed.value) {
          port.postMessage({ ok: false, error: err && err.message ? err.message : String(err) });
        }
      }
    }
  });
});

browser.runtime.onMessage.addListener(async (message, sender) => {
  try {
    switch (message.type) {
      case "READ": {
        const { folders, bookmarks } = await readBookmarks();
        const memory = await readCleanupMemory();
        const options = await getOptions();
        const stats = cleanupStats(bookmarks, memory);
        stats.next = Math.min(stats.neverCleaned, options.batchSize || 20);
        stats.batchSize = options.batchSize || 20;
        return { ok: true, tree: { folders, bookmarks, cleanup: stats } };
      }
      case "APPLY": {
        const summary = await applyChanges(message.diff);
        await markCleaned(message.cleanedIds);
        return { ok: true, summary };
      }
      case "RESET_CLEANUP":
        await browser.storage.local.remove("cleanupMemory");
        return { ok: true };
      case "GET_OPTIONS":
        return { ok: true, options: await getOptions() };
      case "GET_DEFAULTS":
        return { ok: true, defaults: DEFAULT_OPTIONS };
      case "SET_OPTIONS":
        await browser.storage.local.set(message.options);
        return { ok: true };
      default:
        return { ok: false, error: `Unknown message type: ${message.type}` };
    }
  } catch (err) {
    return { ok: false, error: err && err.message ? err.message : String(err) };
  }
});