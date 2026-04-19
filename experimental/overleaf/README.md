# Experimental Overleaf userscripts

The experimental Overleaf area now keeps only the merged native-sidebar installable
script plus its shared helper.

## Included userscripts

- `sidebar/Overleaf Sidebar Notes + Checklist (Experimental)`

The script depends on `sidebar/_nativeSidebarHost.js`, which is loaded through its
`@require` header.

## Installation

1. Install a userscript manager such as Tampermonkey.
2. Open the raw URL of the merged sidebar script from this repository.
3. Install it.
4. Refresh an Overleaf project page.
5. Use the two centered sidebar buttons to open the draggable notes or checklist box.

## Validation

Syntax-check the remaining experimental sidebar files individually:

```bash
node --check "/absolute/path/to/experimental/overleaf/sidebar/_nativeSidebarHost.js"
node --check "/absolute/path/to/experimental/overleaf/sidebar/Overleaf Sidebar Notes + Checklist (Experimental)"
```
