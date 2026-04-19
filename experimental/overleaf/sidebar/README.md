# Experimental Overleaf floating sidebar userscript

A single Tampermonkey userscript adds **two custom buttons** to Overleaf's built-in
left sidebar (the vertical rail with the file tree, search, integrations, review,
and chat icons). The buttons stay fixed in the rail, and each one opens its own
content inside the same **draggable floating box**.

## Included integration

| # | Script | What it adds |
|---|--------|-------------|
| 1 | **Overleaf Sidebar Notes + Checklist** | Two centered sidebar buttons: a per-project local notepad and a per-project checklist, both rendered in a floating box. |

## Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/) (or any compatible
   userscript manager) in your browser.
2. Open the raw URL of the script in this folder:
   ```
   https://raw.githubusercontent.com/EugenioLandi/userscripts/main/experimental/overleaf/sidebar/Overleaf%20Sidebar%20Notes%20+%20Checklist%20%28Experimental%29
   ```
   Tampermonkey will prompt you to install it.
3. The script's `@require` header automatically loads the shared helper
   (`_nativeSidebarHost.js`), so you do **not** need to install it separately.
4. Open any Overleaf project. Two new centered icons appear near the bottom of the
   native sidebar rail.
5. Click either button to open the shared floating box, then drag the header to
   move it anywhere on screen.

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
│  │  [notes]    ← custom   │                       │
│  │  [tasks]    ← custom   │                       │
│  └───────────────────────┘                       │
└──────────────────────────────────────────────────┘

┌───────────────────────────────────────────────┐
│  #experimental-overleaf-native-sidebar-...    │
│  floating widget attached to document.body     │
│  ┌───────────────────────────────────────────┐ │
│  │ header (drag handle)                  [×] │ │
│  ├───────────────────────────────────────────┤ │
│  │ panel body: notes or checklist            │ │
│  ├───────────────────────────────────────────┤ │
│  │ footer / status text                      │ │
│  └───────────────────────────────────────────┘ │
└───────────────────────────────────────────────┘
```

Key design decisions:

* **The buttons stay in Overleaf's native rail**, so the integration still feels
  anchored to the built-in sidebar.
* **The content lives in one shared floating widget** attached to `document.body`
  instead of replacing Overleaf's native sidebar panel. Switching buttons swaps
  the widget content.
* **The widget is draggable and position-persistent** using `localStorage`, so it
  behaves similarly to the Claude usage display while staying independent from the
  native rail content.
* **Theme detection** still reads `getComputedStyle` from Overleaf's native pane,
  then applies matching CSS custom properties to the floating widget.
* **All data is stored in `localStorage`** — nothing is sent to any server.
  Project-specific data is keyed by Overleaf project ID.

## Shared helper API

`_nativeSidebarHost.js` exposes `window.__experimentalOverleafNativeSidebarHost`
with the following methods:

| Method | Description |
|--------|-------------|
| `registerPanel(panel)` | Register a new sidebar panel. `panel` must have `id`, `title`, `icon` (SVG markup), `render(container, api)`, and optionally `order` and `subtitle`. |
| `rerenderPanel(panelId)` | Force a re-render of the given panel. |
| `openPanel(panelId)` | Activate and display the given panel in the floating widget. |
| `closePanel()` | Close the floating widget. |
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
node --check "experimental/overleaf/sidebar/Overleaf Sidebar Notes + Checklist (Experimental)"
```

## Known limitations

* The scripts depend on Overleaf's current DOM class names (`.ide-rail-*`, etc.).
  If Overleaf redesigns its sidebar markup the selectors will need updating.
* The custom buttons only appear while Overleaf's native sidebar rail exists in
  the DOM.
* All data stays in `localStorage`, so clearing browser data loses notes,
  checklist items, and the floating widget position.
