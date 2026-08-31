import React, { useEffect, useState } from "react";

const send = (message) => browser.runtime.sendMessage(message);

export default function Popup() {
  const [tree, setTree] = useState(null);
  const [hasKey, setHasKey] = useState(false);
  const [status, setStatus] = useState(null); // {text, error}
  const [diff, setDiff] = useState(null);
  const [categories, setCategories] = useState(null);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState({});
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(null);

  useEffect(() => {
    (async () => {
      const opts = await send({ type: "GET_OPTIONS" });
      setHasKey(!!opts.options.apiKey);
      const read = await send({ type: "READ" });
      if (!read.ok) setStatus({ text: read.error, error: true });
      else setTree(read.tree);
    })();
  }, []);

  const analyze = async () => {
    setLoading(true);
    setDiff(null);
    setApplied(null);
    setStatus(null);
    try {
      const res = await send({ type: "RECOMMEND" });
      if (!res.ok) { setStatus({ text: res.error, error: true }); return; }
      setCategories(res.categories);
      setDiff(res.diff);
      const sel = {};
      res.diff.moves.forEach((m) => (sel["m:" + m.id] = true));
      res.diff.renames.forEach((r) => (sel["r:" + r.id] = true));
      setSelected(sel);
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
    const res = await send({ type: "APPLY", diff: d });
    setApplying(false);
    if (!res.ok) { setStatus({ text: res.error, error: true }); return; }
    setApplied(res.summary);
  };

  const groups = {};
  (diff ? diff.moves : []).forEach((m) => ((groups[m.toFolder] = groups[m.toFolder] || []), groups[m.toFolder].push(m)));

  return (
    <div className="w-80 p-4 font-sans text-slate-800">
      <header className="flex items-center justify-between mb-3">
        <h1 className="text-base font-bold">Smart Bookmarks</h1>
        <a
          href="#"
          onClick={(e) => { e.preventDefault(); browser.runtime.openOptionsPage(); }}
          className="text-slate-400 hover:text-slate-600 text-lg leading-none"
          title="Options"
        >&#9881;</a>
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
          <button
            onClick={analyze}
            disabled={loading || !hasKey}
            className="mt-2 w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Analyzing…" : "Analyze with AI"}
          </button>
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
                        <span className="flex-1 truncate">{m.title}</span>
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
                  <li key={r.id} className="flex items-center gap-2 py-1 text-sm">
                    <input
                      type="checkbox"
                      checked={!!selected["r:" + r.id]}
                      onChange={(e) => setSelected({ ...selected, ["r:" + r.id]: e.target.checked })}
                    />
                    <span className="flex-1 truncate">→ <b>{r.to}</b></span>
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