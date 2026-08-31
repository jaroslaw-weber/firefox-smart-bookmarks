import { readBookmarks, askAI, buildDiff, applyChanges, getOptions, DEFAULT_OPTIONS } from "./lib.js";

browser.runtime.onMessage.addListener(async (message, sender) => {
  try {
    switch (message.type) {
      case "READ":
        return { ok: true, tree: await readBookmarks() };
      case "RECOMMEND": {
        const { bookmarks } = await readBookmarks();
        const suggestions = await askAI(bookmarks);
        return { ok: true, categories: suggestions.categories, diff: buildDiff(bookmarks, suggestions), count: bookmarks.length };
      }
      case "APPLY": {
        const summary = await applyChanges(message.diff);
        return { ok: true, summary };
      }
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