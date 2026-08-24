# SGDB Apply All — Decky companion plugin

**Version:** 0.1.0 candidate

A separate Decky Loader companion for SteamOS Gaming Mode. It does **not** patch or replace the official SteamGridDB plugin.

## Goal

From a game's normal context menu, choose:

> **Apply SteamGridDB Artwork Set**

The plugin then tries to apply, in one operation:

1. Capsule (portrait grid)
2. Wide Capsule (landscape grid)
3. Hero
4. Logo
5. Icon

If one type is unavailable or fails, the other types continue.

## How V0.1 chooses artwork

- Highest SteamGridDB `score` among compatible results returned by the API
- Static images only
- PNG/JPEG only
- NSFW excluded
- Humor excluded
- Epilepsy-tagged results excluded
- Standard SteamGridDB dimensions/styles are preferred for each slot

For normal Steam Store games, the plugin first asks SteamGridDB by Steam AppID. For non-Steam shortcuts it searches by the shortcut's display name and prefers an exact/verified match.

## API key

This plugin deliberately **does not reuse the special API credential bundled with the official SteamGridDB Decky plugin**.

Create your own free API key from your SteamGridDB account preferences, then open:

**Decky → SGDB Apply All → SteamGridDB API**

Paste the key and choose **Save & check key**.

The key is stored only in this plugin's Decky settings directory.

## Build

Decky's current template expects Node.js and pnpm v9.

```bash
pnpm install
pnpm run build
python -m py_compile main.py
pnpm run package
```

The final installable Decky zip is created under `out/`.

A GitHub Actions workflow is included at `.github/workflows/build.yml`; pushing this source to a GitHub repository and running the workflow will build and upload the Decky zip as a workflow artifact.

## Installing the built zip

Use Decky Loader's developer/plugin install flow for a local/URL zip according to your Decky version. The built archive contains a top-level `SGDB Apply All/` folder and the required `dist/index.js`, `package.json`, `plugin.json`, `main.py` and license files.

## Notes / V0.1 limitations

- This is a first hardware-test candidate. It has not been run on a physical SteamOS Gaming Mode system from the build environment used to produce this source package.
- Steam's internal React/UI hooks can change after Steam client updates; the companion may then require a small compatibility update. That is independent of official SteamGridDB plugin updates.
- A non-Steam shortcut's icon may not visually refresh until Steam restarts, although the other artwork normally updates independently.
- Automatic title matching can occasionally choose the wrong SteamGridDB game for non-Steam shortcuts. Use the official SteamGridDB plugin for manual correction. A future version can add a match-preview/override screen.
- V0.1 deliberately favors predictable static artwork over animated artwork or broad style customization.

## Why this does not interfere with SteamGridDB updates

`SGDB Apply All` has its own plugin name, backend, settings and frontend bundle. It never edits the installed files of the official `SteamGridDB` Decky plugin. Updating or reinstalling SteamGridDB should therefore not overwrite this companion.
