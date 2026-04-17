# Userscript auto-update report

## Is automatic updating possible?
Yes. Once this repository is public, Tampermonkey, Violentmonkey, and similar userscript managers can check for updates automatically if each script exposes stable `@updateURL` and `@downloadURL` metadata that points to the raw file in the public repository.

## What was changed
The maintained top-level userscripts in this repository now include GitHub Raw update metadata that points to the `main` branch of `EugenioLandi/userscripts`. The preserved copies in `/original-userscripts` were intentionally left unchanged.

## How to use it
1. Make sure the repository is public.
2. Install each script from its public raw GitHub URL, not from a local file copy.
3. Keep updating the `@version` field whenever you change a script. Userscript managers only upgrade when they see a newer version.
4. Commit changes to `main` so the raw URLs stay stable.

## Raw URL pattern
Use this pattern for installs and updates:

```
https://raw.githubusercontent.com/EugenioLandi/userscripts/main/<script file name>
```

Because several filenames contain spaces, the actual URL uses URL-encoded names such as `%20` for spaces.

## Example
`GitHub Copilot Usage Display by You` installs from:

```
https://raw.githubusercontent.com/EugenioLandi/userscripts/main/GitHub%20Copilot%20Usage%20Display%20by%20You
```

## Important notes
- If a script was installed from a local file or a different URL, the manager may keep checking that old location instead of this repository. Reinstalling from the raw GitHub URL is the safest way to switch it over.
- `@updateURL` is used to check whether a new version exists.
- `@downloadURL` is used to fetch the full updated script.
- GitHub Raw is enough for a small personal userscript repository like this one; no separate release process is required.

## Maintained scripts covered by this change
- `Claude Usage Monitor`
- `Force font Domani`
- `Good o'l Reddit`
- `GitHub Copilot Usage Display by You`
- `Overleaf Compile Timer`
- `Overleaf GitHub Shortcut`
- `Overleaf ZIP Download with Date`
- `Wikipedia Mobile to Desktop redirect`
- `arXiv PDF Downloader with Custom Filenam`
- `github copilot model multiplier`
