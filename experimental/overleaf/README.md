# Experimental Overleaf userscripts

The experimental Overleaf area now keeps only the native-sidebar experiments that
are still meant to be tried directly from this repository.

## Included userscripts

- `sidebar/Overleaf Sidebar Local Notepad (Experimental)`
- `sidebar/Overleaf Sidebar Checklist (Experimental)`

Both depend on `sidebar/_nativeSidebarHost.js`, which is loaded through each
script's `@require` header.

## Installation

1. Install a userscript manager such as Tampermonkey.
2. Open the raw URL of either sidebar script from this repository.
3. Install the script you want.
4. Refresh an Overleaf project page.

## Validation

Syntax-check the remaining experimental sidebar files individually:

```bash
node --check "/absolute/path/to/experimental/overleaf/sidebar/_nativeSidebarHost.js"
node --check "/absolute/path/to/experimental/overleaf/sidebar/Overleaf Sidebar Local Notepad (Experimental)"
node --check "/absolute/path/to/experimental/overleaf/sidebar/Overleaf Sidebar Checklist (Experimental)"
```
