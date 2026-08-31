import React, { useEffect, useState } from "react";
import { ORGANIZE_PRESETS } from "../lib.js";

const send = (message) => browser.runtime.sendMessage(message);

const PRESETS = Object.entries(ORGANIZE_PRESETS);

export default function Options() {
  const [endpoint, setEndpoint] = useState("");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [rules, setRules] = useState(null);
  const [saved, setSaved] = useState("");
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    (async () => {
      const res = await send({ type: "GET_OPTIONS" });
      if (!res.ok) return;
      setEndpoint(res.options.endpoint);
      setModel(res.options.model);
      setApiKey(res.options.apiKey);
      setRules(res.options.rules);
    })();
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    const res = await send({
      type: "SET_OPTIONS",
      options: {
        endpoint: endpoint.trim(),
        model: model.trim(),
        apiKey: apiKey.trim(),
        rules
      }
    });
    if (res.ok) {
      setSaved("Saved.");
      setSaveError("");
      setTimeout(() => setSaved(""), 2000);
    } else {
      setSaveError(res.error || "Failed to save.");
      setSaved("");
    }
  };

  const setRule = (key, value) => setRules((r) => ({ ...r, [key]: value }));

  return (
    <div className="flex flex-col items-center px-10 py-10 font-sans text-slate-800">
      <h1 className="mb-5 text-xl font-bold">Smart Bookmarks — Options</h1>
      <form onSubmit={submit} className="flex w-full max-w-lg flex-col gap-5 rounded-xl border border-slate-200 bg-white p-6">
        <div className="flex flex-col gap-4">
          <p className="text-sm font-semibold">AI provider</p>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            API endpoint (OpenAI-compatible)
            <input
              type="url"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              placeholder="https://openrouter.ai/api/v1/chat/completions"
              className="rounded-md border border-slate-300 px-3 py-2 font-normal"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Model
            <input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="auto"
              className="rounded-md border border-slate-300 px-3 py-2 font-normal"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            API key
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-…"
              className="rounded-md border border-slate-300 px-3 py-2 font-normal"
            />
          </label>
        </div>

        <hr className="border-slate-100" />

        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold">Organization rules</p>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Preset
            {rules && (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {PRESETS.map(([key, p]) => (
                  <label
                    key={key}
                    className={`flex cursor-pointer items-start gap-2 rounded-md border p-3 text-sm font-normal ${
                      rules.preset === key ? "border-blue-500 bg-blue-50" : "border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <input
                      type="radio"
                      name="preset"
                      checked={rules.preset === key}
                      onChange={() => setRule("preset", key)}
                      className="mt-0.5"
                    />
                    <span>
                      <span className="font-semibold">{p.label}</span>
                      <span className="block text-xs text-slate-500">{p.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            )}
          </label>

          {rules?.preset === "custom" && (
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Custom rules (primary)
              <textarea
                value={rules?.customInstructions || ""}
                onChange={(e) => setRule("customInstructions", e.target.value)}
                rows={4}
                placeholder="e.g. Group by: (1) Work (2) Personal (3) References. Never create more than 5 folders. Name folders in all-lowercase."
                className="rounded-md border border-blue-300 border-2 bg-blue-50/50 px-3 py-2 font-normal"
              />
              <span className="text-xs font-normal text-slate-400">
                These rules replace the preset and are the primary instruction sent to the AI.
              </span>
            </label>
          )}

          <label className="flex items-center justify-between gap-3 text-sm font-semibold">
            <span>
              Suggest renamed titles
              <span className="block text-xs font-normal text-slate-500">Fix junk titles, strip noise, tidy caps</span>
            </span>
            <input
              type="checkbox"
              checked={!!rules?.rename}
              onChange={(e) => setRule("rename", e.target.checked)}
              className="h-4 w-4"
            />
          </label>

          {rules && rules.preset !== "flat" && (
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Max categories
              <input
                type="number"
                min="1"
                max="30"
                value={rules.maxCategories}
                onChange={(e) => setRule("maxCategories", Number(e.target.value))}
                className="rounded-md border border-slate-300 px-3 py-2 font-normal"
              />
            </label>
          )}

          {rules?.preset !== "custom" && (
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Extra suggestions (optional)
              <textarea
                value={rules?.customInstructions || ""}
                onChange={(e) => setRule("customInstructions", e.target.value)}
                rows={3}
                placeholder="e.g. Keep folders named in all-lowercase. Never merge anything under 'Misc'."
                className="rounded-md border border-slate-300 px-3 py-2 font-normal"
              />
              <span className="text-xs font-normal text-slate-400">
                These fine-tune the preset, alongside your bookmark titles/URLs.
              </span>
            </label>
          )}
        </div>

        <div className="mt-1 flex items-center gap-3">
          <button type="submit" className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white">
            Save
          </button>
          {saved && <span className="text-sm text-emerald-600">{saved}</span>}
          {saveError && <span className="text-sm text-red-600">{saveError}</span>}
        </div>
      </form>
    </div>
  );
}