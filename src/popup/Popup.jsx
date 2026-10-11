import React, { useEffect, useState } from "react";

const send = (message) => browser.runtime.sendMessage(message);

export default function Popup() {
  const [tree, setTree] = useState(null);
  const [hasKey, setHasKey] = useState(false);
  const [status, setStatus] = useState(null); // {text, error}
  const [diff, setDiff] = useState(null);
  const [categories, setCategories] = useState(null);
  const [batchIds, setBatchIds] = useState(null);
  const [cleanup, setCleanup] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState({});
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(null);
  const [includeCleaned, setIncludeCleaned] = useState(false);
  const [elapsed, setElapsed] = useState(null);
  const [chars, setChars] = useState(null);
  const [reasoning, setReasoning] = useState(null);

  useEffect(() => {
    if (!loading) return;
    const start = Date.now();
    setElapsed(0);
    const iv = setInterval(() => setElapsed(Math.round((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(iv);
  }, [loading]);

  useEffect(() => {
    (async () => {
      const opts = await send({ type: "GET_OPTIONS" });
      setHasKey(!!opts.options.apiKey);
      const read = await send({ type: "READ" });
      if (!read.ok) setStatus({ text: read.error, error: true });
      else { setTree(read.tree); setCleanup(read.tree.cleanup); }
    })();
  }, []);

  const refreshCleanup = async () => {
    const read = await send({ type: "READ" });
    if (read.ok) { setTree(read.tree); setCleanup(read.tree.cleanup); }
  };

  const analyze = async () => {
    setLoading(true);
    setDiff(null);
    setApplied(null);
    setStatus(null);
    setChars(0);
    let port = null;
    try {
      port = browser.runtime.connect({ name: "recommend" });
      const result = await new Promise((resolve, reject) => {
        port.onMessage.addListener((res) => {
          if (res.kind === "progress") { setChars(res.chars); setReasoning(res.reasoning); }
          else if (res.kind === "result" && res.ok) resolve(res);
          else if (res.kind === "result") reject(new Error(res.error));
          else if (!res.ok) reject(new Error(res.error || "Failed to analyze."));
        });
        port.onDisconnect.addListener(() => {
          if (!port.error && loading) {
            setStatus({ text: "Connection closed before analysis finished — the tab may have reconnected. Click Analyze again.", error: true });
          }
        });
        port.postMessage({ type: "RECOMMEND_STREAM", includeCleaned });
      });
      port.disconnect();
      setCategories(result.categories);
      setDiff(result.diff);
      setBatchIds(result.batchIds);
      setCleanup(result.stats);
      const sel = {};
      result.diff.moves.forEach((m) => (sel["m:" + m.id] = true));
      result.diff.renames.forEach((r) => (sel["r:" + r.id] = true));
      setSelected(sel);
    } catch (err) {
      setStatus({ text: err.message || String(err), error: true });
    } finally {
      setLoading(false);
    }
  };

  const apply = async (all) => {
    setApplying(true);
    setApplied(null);
    const keep = (arr, prefix) => (all ? arr : arr.filter((x) => selected[prefix + x.id]));
    const d = {
      createFolders: diff.createFolders || [],
      moves: keep(diff.moves || [], "m:"),
      renames: keep(diff.renames || [], "r:")
    };
    const res = await send({ type: "APPLY", diff: d, cleanedIds: batchIds });
    setApplying(false);
    if (!res.ok) { setStatus({ text: res.error, error: true }); return; }
    setApplied(res.summary);
    setBatchIds(null);
    refreshCleanup();
  };

  const groups = {};
  (diff ? diff.moves : []).forEach((m) => ((groups[m.toFolder] = groups[m.toFolder] || []), groups[m.toFolder].push(m)));

  const openInTab = (e) => {
    e.preventDefault();
    browser.tabs.create({ url: browser.runtime.getURL("src/workspace/index.html") });
  };

  return (
    <div className="w-full max-w-xl mx-auto p-4 font-sans text-slate-800">
      <header className="flex items-center justify-between mb-3">
        <h1 className="text-base font-bold">Smart Bookmarks</h1>
        <div className="flex items-center gap-1">
          <a
            href="#"
            onClick={openInTab}
            className="text-slate-400 hover:text-slate-600 text-lg leading-none"
            title="Open in a tab (won't close when you click away)"
          >&#8693;</a>
          <a
            href="#"
            onClick={(e) => { e.preventDefault(); browser.runtime.openOptionsPage(); }}
            className="text-slate-400 hover:text-slate-600 text-lg leading-none"
            title="Options"
          >&#9881;</a>
        </div>
      </header>

      {!hasKey && (
        <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">
          Set your API key in
          <a href="#" onClick={(e) => { e.preventDefault(); browser.runtime.openOptionsPage(); }}
             className="underline ml-1">options</a> before analyzing.
        </div>
      )}

      {tree && (
        <div className="mb-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <p className="text-slate-600">{tree.folders.length} folders, {tree.bookmarks.length} bookmarks</p>
          {cleanup && (
            <p className="text-xs text-slate-400 mt-1">
              {cleanup.cleaned} cleaned · {cleanup.neverCleaned} untouched
            </p>
          )}
          <label className="mt-2 flex items-center gap-2 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={includeCleaned}
              onChange={(e) => setIncludeCleaned(e.target.checked)}
            />
            Include already-cleaned bookmarks
          </label>
          <button
            onClick={analyze}
            disabled={loading || !hasKey}
            className="mt-2 w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? `Analyzing… ${elapsed ?? 0}s` : cleanup && cleanup.next ? `Analyze next ${cleanup.next}…` : "Analyze with AI"}
          </button>
          {loading && (
            <div className="mt-2">
              <div className="flex justify-between text-xs text-slate-400">
                <span>
                  {(reasoning != null && reasoning > 0 && chars == 0) ? "Model is thinking…" : "Waiting for the AI provider…"}
                </span>
                <span>
                  {chars != null && chars > 0 ? `${chars} chars` : reasoning != null && reasoning > 0 ? `${reasoning} reasoning` : `${elapsed ?? 0}s`}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-slate-100">
                <div
                  className="h-full bg-blue-500 transition-all"
                  style={{
                    width: chars != null && chars > 0 ? `${Math.min(100, 20 + (chars % 80))}%` : `${Math.min(100, (elapsed ?? 0) * 2)}%`,
                  }}
                />
              </div>
              {elapsed >= 120 && (
                <p className="mt-1 text-xs text-red-600">Timed out in background (120s). Close and reopen to retry.</p>
              )}
            </div>
          )}
          {cleanup && !includeCleaned && cleanup.neverCleaned > 0 && cleanup.cleaned > 0 && cleanup.next < cleanup.neverCleaned && (
            <p className="mt-2 text-xs text-amber-600">
              Leftover batch: this run only covers the next {cleanup.next}. Run again after applying to clean the rest.
            </p>
          )}
        </div>
      )}

      {status && (
        <div className={`mb-3 rounded-lg border p-3 text-sm ${status.error ? "border-red-200 bg-red-50 text-red-700" : "border-slate-200 bg-white text-slate-700"}`}>
          {status.text}
        </div>
      )}

      {diff && (
        <div className="rounded-lg border border-slate-200 bg-white p-3">
          <h2 className="text-sm font-semibold mb-2">Suggested changes</h2>

          {diff.createFolders.length > 0 && (
            <>
              <p className="text-xs font-semibold text-slate-400 mt-2 mb-1">New folders</p>
              <ul>
                {diff.createFolders.map((f) => (
                  <li key={f.name} className="flex items-center gap-2 py-1 text-sm">
                    <span className="rounded-full bg-violet-100 text-violet-700 px-2 text-xs">folder</span>
                    <span>{f.name}</span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {Object.keys(groups).length > 0 && (
            <>
              <p className="text-xs font-semibold text-slate-400 mt-2 mb-1">Moves</p>
              {Object.keys(groups).sort().map((folder) => (
                <div key={folder} className="mb-2">
                  <p className="text-sm font-medium text-slate-500">&#8594; {folder}</p>
                  <ul>
                    {groups[folder].map((m) => (
                      <li key={m.id} className="flex items-center gap-2 py-1 text-sm">
                        <input
                          type="checkbox"
                          checked={!!selected["m:" + m.id]}
                          onChange={(e) => setSelected({ ...selected, ["m:" + m.id]: e.target.checked })}
                        />
                        <span className="flex-1 min-w-0 break-words">{m.title}</span>
                        <span className="text-xs text-slate-400 shrink-0">{m.fromFolder || "root"}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </>
          )}

          {diff.renames.length > 0 && (
            <>
              <p className="text-xs font-semibold text-slate-400 mt-2 mb-1">Renames</p>
              <ul>
{diff.renames.map((r) => (
                  <li key={r.id} className="flex items-start gap-2 py-1 text-sm">
                    <input
                      className="mt-0.5"
                      type="checkbox"
                      checked={!!selected["r:" + r.id]}
                      onChange={(e) => setSelected({ ...selected, ["r:" + r.id]: e.target.checked })}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block text-slate-500 line-through decoration-slate-300 break-words">{r.from}</span>
                      <span className="block">
                        <b className="break-words">{r.to}</b>
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {applied && (
            <p className="mt-3 text-sm text-emerald-600">
              Created {applied.foldersCreated} folder(s), moved {applied.moved}, renamed {applied.renamed}, skipped {applied.skippedMoves}.
            </p>
          )}

          <div className="mt-3 flex gap-2">
            <button
              onClick={() => apply(false)}
              disabled={applying}
              className="flex-1 rounded-md bg-blue-600 text-white px-3 py-2 text-sm disabled:opacity-50"
            >Apply selected</button>
            <button
              onClick={() => apply(true)}
              disabled={applying}
              className="flex-1 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm disabled:opacity-50"
            >Apply all</button>
          </div>
        </div>
      )}
    </div>
  );
}