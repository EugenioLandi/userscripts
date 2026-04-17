# Experimental Overleaf native sidebar userscripts

Six Tampermonkey userscripts that add custom tabs to Overleaf's **built-in left
sidebar** (the vertical rail with the file tree, search, integrations, review,
and chat icons). Each script creates its own icon in that rail and renders its
panel in the same sidebar surface.

## Included integrations

| # | Script | What it adds |
|---|--------|-------------|
| 1 | **Overleaf Sidebar Local Notepad** | A per-project scratch pad (autosaved in `localStorage`). |
| 2 | **Overleaf Sidebar Quick Links** | A 2 × 3 grid of project destinations: editor, history, settings, ZIP download, Learn, and dashboard. |
| 3 | **Overleaf Sidebar Project Info** | Copy-friendly project metadata: name, ID, editor URL, history URL, and a Markdown link. |
| 4 | **Overleaf Sidebar Recent Projects** | A locally stored list of recently opened projects with one-click switching. |
| 5 | **Overleaf Sidebar Compile Insights** | Compile timing history tracked from network requests (current, average, and slowest times). |
| 6 | **Overleaf Sidebar Checklist** | A per-project task list for figures, references, experiments, or submission checks. |

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) (or any compatible
   userscript manager) in your browser.
2. Open the raw URL of any script in this folder — for example:
   ```
   https://raw.githubusercontent.com/EugenioLandi/userscripts/main/experimental/overleaf/sidebar/Overleaf%20Sidebar%20Local%20Notepad%20%28Experimental%29
   ```
   Tampermonkey will prompt you to install it.
3. Each script's `@require` header automatically loads the shared helper
   (`_nativeSidebarHost.js`), so you do **not** need to install it separately.
4. Open any Overleaf project. The new icons appear at the bottom of the native
   sidebar rail.

## How it works

```
┌──────────────────────────────────────────────────┐
│  nav.ide-rail                                    │
│  ┌───────────────────────┐                       │
│  │ .ide-rail-tabs-wrapper │  ← native + custom   │
│  │  [file-tree]           │    tab buttons live   │
│  │  [search]              │    here               │
│  │  [integrations]        │                       │
│  │  [review]              │                       │
│  │  [chat]                │                       │
│  │  [notepad]  ← custom   │                       │
│  │  [links]    ← custom   │                       │
│  │  ...                   │                       │
│  └───────────────────────┘                       │
└──────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────┐
│  .ide-rail-content                               │
│  ┌─────────────────────────────────────────────┐ │
│  │ .ide-rail-tab-content   (React-managed)     │ │
│  │  hidden when a custom panel is active       │ │
│  └─────────────────────────────────────────────┘ │
│  ┌─────────────────────────────────────────────┐ │
│  │ #experimental-…-panels  (our container)     │ │
│  │  shown when a custom panel is active        │ │
│  │  ┌────────────────────────────────────────┐ │ │
│  │  │ panel: Local Notepad                   │ │ │
│  │  │ panel: Quick Links                     │ │ │
│  │  │ …                                      │ │ │
│  │  └────────────────────────────────────────┘ │ │
│  └─────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────┘
```

Key design decisions:

* **Custom panels live in a separate container** placed alongside Overleaf's
  native `.ide-rail-tab-content`, not inside it. This avoids conflicts with
  React's reconciliation — React never touches our container, and we never
  modify React-managed DOM attributes (no `hidden`, no `aria-selected` changes
  on native elements).
* **Visibility is toggled via CSS**: a `data-experimental-sidebar-mode`
  attribute on `.ide-rail-content` controls which container is visible. A
  matching attribute on `.ide-rail-tabs-wrapper` visually de-emphasises the
  native active tab while a custom panel is open.
* **Theme detection**: the host reads `getComputedStyle` from the native pane
  to derive background, foreground, and border colors, then sets CSS custom
  properties on the panel container. An explicit dark-mode block in the
  stylesheet covers cases where `.overall-theme-dark` or
  `[data-theme="dark"]` is present.
* **All data is stored in `localStorage`** — nothing is sent to any server.
  Project-specific data is keyed by Overleaf project ID.

## Shared helper API

`_nativeSidebarHost.js` exposes `window.__experimentalOverleafNativeSidebarHost`
with the following methods:

| Method | Description |
|--------|-------------|
| `registerPanel(panel)` | Register a new sidebar panel. `panel` must have `id`, `title`, `icon` (SVG markup), `render(container, api)`, and optionally `order` and `subtitle`. |
| `rerenderPanel(panelId)` | Force a re-render of the given panel. |
| `openPanel(panelId)` | Activate and display the given panel. |
| `closePanel()` | Close any open custom panel. |
| `isPanelActive(panelId)` | Returns `true` when the panel is currently displayed. |
| `getProjectId()` | Extract the project ID from the URL. |
| `getProjectName()` | Read the project name from the toolbar. |
| `buildProjectUrl(suffix)` | Build a full project URL with an optional path suffix. |
| `copyText(text)` | Copy text to the clipboard (async). |
| `readJson(key, fallback)` | Read and parse a JSON value from `localStorage`. |
| `writeJson(key, value)` | Stringify and write a value to `localStorage`. |
| `formatDateTime(ts)` | Format a timestamp with `toLocaleString()`. |

The `api` object passed to `render()` contains the same helpers plus
`setFooterText(text)`, `rerender()`, and `isActive()` scoped to the current
panel.

## Validation

Every script in this folder (including the shared helper) can be
syntax-checked with Node.js:

```bash
node --check "experimental/overleaf/sidebar/_nativeSidebarHost.js"
node --check "experimental/overleaf/sidebar/Overleaf Sidebar Local Notepad (Experimental)"
# … and so on for each script
```

## Known limitations

* The scripts depend on Overleaf's current DOM class names (`.ide-rail-*`,
  `.tab-pane`, etc.). If Overleaf redesigns its sidebar markup the selectors
  will need updating.
* Compile Insights patches `window.fetch` and `XMLHttpRequest.prototype` to
  intercept compile requests. Other scripts or extensions that also patch
  these globals might conflict.
* The sidebar is only auto-opened (via the file-tree button) when a previously
  active custom panel needs to be restored. If the sidebar is collapsed and no
  custom panel was open, the scripts wait passively until the user opens it.
* All data stays in `localStorage`, so clearing browser data loses notes,
  checklist items, and compile history.
