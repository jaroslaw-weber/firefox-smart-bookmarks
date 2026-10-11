# Publishing

How to cut a release and submit the extension to addons.mozilla.org (AMO).

## 0. Prerequisites

- `gh` authenticated (`gh auth status`).
- Node/npm installed. On Windows, PowerShell may block `npm.ps1` — use `npm.cmd` instead
  (or run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`).

## 1. Bump the version

Update the version in **both** files so the build and the release agree:

- `package.json` → `"version"`
- `public/manifest.json` → `"version"`

## 2. Build

```powershell
npm.cmd install
npm.cmd run build
```

This bundles into `dist/` (popup, options, workspace, background, manifest, icons).

## 3. Package the zip

> **Important:** AMO rejects archives whose entry paths use backslashes
> (`Invalid file name in archive: assets\index-....js`). Windows' built-in
> `Compress-Archive` produces backslashes. Always build the zip with forward slashes.

```powershell
$src = (Resolve-Path "dist").Path
$zip = "$env:TEMP\firefox_smart_bookmarks-<version>.zip"
if (Test-Path $zip) { Remove-Item -LiteralPath $zip }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem

$fs = [System.IO.File]::Open($zip, [System.IO.FileMode]::Create)
$archive = New-Object System.IO.Compression.ZipArchive($fs, [System.IO.Compression.ZipArchiveMode]::Create)
Get-ChildItem -Recurse -File -LiteralPath $src | ForEach-Object {
    $rel = $_.FullName.Substring($src.Length + 1).Replace('\', '/')
    $entry = $archive.CreateEntry($rel, [System.IO.Compression.CompressionLevel]::Optimal)
    $es = $entry.Open(); $in = [System.IO.File]::OpenRead($_.FullName)
    $in.CopyTo($es); $in.Close(); $es.Close()
}
$archive.Dispose(); $fs.Close()
```

Verify the entry names use `/` and that `manifest.json` is at the archive root.

## 4. Tag and GitHub release

```powershell
git tag v<version>
git push origin v<version>

gh release create v<version> "$env:TEMP\firefox_smart_bookmarks-<version>.zip" `
  --title "v<version>" --notes-file release-notes.md
```

To replace an asset on an existing release:

```powershell
gh release upload v<version> "$env:TEMP\firefox_smart_bookmarks-<version>.zip" --clobber
```

## 5. Submit to AMO

1. Go to the [Developer Hub → Submit a New Add-on](https://addons.mozilla.org/developers/addon/submit/).
2. Choose **On your own** (self-distribution) or list publicly.
3. Upload the same `firefox_smart_bookmarks-<version>.zip` built in step 3.
4. AMO runs automated validation — a backslash-path archive fails here (see step 3).
5. Complete the listing fields, then submit for signing.

## Gotchas

- **`data_collection_permissions` is required** for all new AMO submissions. It lives under
  `browser_specific_settings.gecko` in `manifest.json`. This extension transmits bookmark data
  to the configured AI provider, so it declares `bookmarksInfo`:

  ```json
  "browser_specific_settings": {
    "gecko": {
      "id": "firefox-smart-bookmarks@jaroslaw-weber.github.io",
      "data_collection_permissions": {
        "required": ["bookmarksInfo"]
      }
    }
  }
  ```

  Keeping the `gecko.id` is also recommended (AMO warns when it's missing and will require it later).
- **Backslash zip paths fail AMO validation.** Use the step 3 script, not `Compress-Archive`.
- **Add-on names cannot contain Mozilla/Firefox trademarks.** Validation fails with
  "Add-on names cannot contain the Mozilla or Firefox trademarks." Keep the `name` neutral
  (e.g. *Very Smart Bookmarks*); "Fox" passes the automated check but still implies Firefox and
  is risky under human review.
- **Keep versions in sync** across `package.json`, `public/manifest.json`, and the git tag.
- Temporary add-ons loaded via `about:debugging` are cleared on Firefox restart; only signed
  builds install permanently.
