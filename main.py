import asyncio
import base64
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any

import decky

API_BASE = "https://www.steamgriddb.com/api/v2"
USER_AGENT = "SGDB-Apply-All/0.1.0 Decky"

SLOT_QUERIES = {
    "grid_p": ("grids", {
        "dimensions": "600x900,342x482,660x930",
        "styles": "alternate,white_logo,no_logo,blurred,material",
    }),
    "grid_l": ("grids", {
        "dimensions": "460x215,920x430",
        "styles": "alternate,white_logo,no_logo,blurred,material",
    }),
    "hero": ("heroes", {
        "dimensions": "1920x620,3840x1240,1600x650",
        "styles": "alternate,blurred,material",
    }),
    "logo": ("logos", {
        "styles": "official,white,black,custom",
    }),
    "icon": ("icons", {
        "styles": "official,custom",
    }),
}


class Plugin:
    def _settings_path(self) -> Path:
        return Path(decky.DECKY_PLUGIN_SETTINGS_DIR) / "settings.json"

    def _runtime_dir(self) -> Path:
        return Path(decky.DECKY_PLUGIN_RUNTIME_DIR)

    def _load_settings(self) -> dict[str, Any]:
        path = self._settings_path()
        try:
            with path.open("r", encoding="utf-8") as handle:
                data = json.load(handle)
            return data if isinstance(data, dict) else {}
        except FileNotFoundError:
            return {}
        except Exception as exc:
            decky.logger.warning("Could not read settings: %s", exc)
            return {}

    def _save_settings(self, settings: dict[str, Any]) -> None:
        path = self._settings_path()
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        with tmp.open("w", encoding="utf-8") as handle:
            json.dump(settings, handle, ensure_ascii=False, indent=2)
        os.replace(tmp, path)

    async def get_api_key(self) -> str:
        return str(self._load_settings().get("api_key", ""))

    async def set_api_key(self, api_key: str) -> bool:
        api_key = (api_key or "").strip()
        settings = self._load_settings()
        settings["api_key"] = api_key
        self._save_settings(settings)
        decky.logger.info("SteamGridDB API key saved (%s)", "set" if api_key else "cleared")
        return True

    def _request_json_sync(self, url: str, api_key: str) -> dict[str, Any]:
        request = urllib.request.Request(
            url,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Accept": "application/json",
                "User-Agent": USER_AGENT,
            },
            method="GET",
        )
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                payload = response.read().decode("utf-8", errors="replace")
                data = json.loads(payload)
        except urllib.error.HTTPError as exc:
            try:
                body = exc.read().decode("utf-8", errors="replace")
                parsed = json.loads(body)
                message = parsed.get("errors") or parsed.get("error") or body
            except Exception:
                message = str(exc)
            raise RuntimeError(f"SteamGridDB HTTP {exc.code}: {message}") from exc
        except urllib.error.URLError as exc:
            raise RuntimeError(f"Could not reach SteamGridDB: {exc.reason}") from exc
        except json.JSONDecodeError as exc:
            raise RuntimeError("SteamGridDB returned invalid JSON") from exc

        if not isinstance(data, dict):
            raise RuntimeError("Unexpected SteamGridDB response")
        if data.get("success") is False:
            raise RuntimeError(str(data.get("errors") or "SteamGridDB request failed"))
        return data

    async def validate_api_key(self, api_key: str = "") -> dict[str, Any]:
        key = (api_key or "").strip() or await self.get_api_key()
        if not key:
            return {"ok": False, "error": "API key is empty."}
        try:
            url = f"{API_BASE}/search/autocomplete/{urllib.parse.quote('Half-Life', safe='')}"
            await asyncio.to_thread(self._request_json_sync, url, key)
            return {"ok": True, "error": ""}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    def _search_game_sync(self, title: str, api_key: str) -> dict[str, Any] | None:
        url = f"{API_BASE}/search/autocomplete/{urllib.parse.quote(title, safe='')}"
        response = self._request_json_sync(url, api_key)
        results = response.get("data")
        if not isinstance(results, list) or not results:
            return None

        wanted = re.sub(r"\s+", " ", title.strip()).casefold()

        def rank(item: dict[str, Any]) -> tuple[int, int]:
            name = re.sub(r"\s+", " ", str(item.get("name", "")).strip()).casefold()
            exact = 1 if name == wanted else 0
            verified = 1 if item.get("verified") is True else 0
            return exact, verified

        valid = [x for x in results if isinstance(x, dict) and x.get("id") is not None]
        if not valid:
            return None
        return max(valid, key=rank)

    def _best_asset(self, response: dict[str, Any]) -> dict[str, Any] | None:
        data = response.get("data")
        if not isinstance(data, list):
            return None
        candidates = [x for x in data if isinstance(x, dict) and x.get("url")]
        if not candidates:
            return None

        def score(item: dict[str, Any]) -> float:
            try:
                return float(item.get("score") or 0)
            except (TypeError, ValueError):
                return 0.0

        return max(candidates, key=score)

    def _fetch_slot_sync(self, endpoint: str, target_kind: str, target_id: int, params: dict[str, str], api_key: str) -> dict[str, Any] | None:
        query = {
            "page": "0",
            "types": "static",
            "nsfw": "false",
            "humor": "false",
            "epilepsy": "false",
            "mimes": "image/png,image/jpeg",
            **params,
        }
        url = (
            f"{API_BASE}/{endpoint}/{target_kind}/{target_id}?"
            + urllib.parse.urlencode(query, safe=",")
        )
        return self._best_asset(self._request_json_sync(url, api_key))

    def _resolve_artwork_sync(self, app_id: int, title: str, is_shortcut: bool, api_key: str) -> dict[str, Any]:
        matched_game: dict[str, Any] | None = None

        if is_shortcut:
            matched_game = self._search_game_sync(title, api_key)
            if not matched_game:
                return {
                    "error": f'No SteamGridDB match found for "{title}".',
                    "matched_game": None,
                    "assets": {},
                }
            target_kind = "game"
            target_id = int(matched_game["id"])
        else:
            target_kind = "steam"
            target_id = int(app_id)

        assets: dict[str, Any] = {}
        errors: list[str] = []
        for slot, (endpoint, params) in SLOT_QUERIES.items():
            try:
                chosen = self._fetch_slot_sync(endpoint, target_kind, target_id, params, api_key)
                if chosen:
                    assets[slot] = {
                        "url": str(chosen.get("url")),
                        "score": chosen.get("score"),
                        "id": chosen.get("id"),
                    }
            except Exception as exc:
                errors.append(f"{slot}: {exc}")
                decky.logger.warning("SteamGridDB slot lookup failed for %s: %s", slot, exc)

        # Some non-store entries can expose a numeric app id but still have no /steam art.
        # If a normal Steam lookup returned nothing, cautiously fall back to title search.
        if not is_shortcut and not assets and title:
            matched_game = self._search_game_sync(title, api_key)
            if matched_game:
                target_kind = "game"
                target_id = int(matched_game["id"])
                for slot, (endpoint, params) in SLOT_QUERIES.items():
                    try:
                        chosen = self._fetch_slot_sync(endpoint, target_kind, target_id, params, api_key)
                        if chosen:
                            assets[slot] = {
                                "url": str(chosen.get("url")),
                                "score": chosen.get("score"),
                                "id": chosen.get("id"),
                            }
                    except Exception as exc:
                        errors.append(f"fallback {slot}: {exc}")

        return {
            "error": "" if assets else (errors[0] if errors else "No compatible static artwork was found."),
            "matched_game": matched_game,
            "assets": assets,
        }

    async def resolve_artwork(self, app_id: int, title: str, is_shortcut: bool) -> dict[str, Any]:
        api_key = (await self.get_api_key()).strip()
        if not api_key:
            return {"error": "SteamGridDB API key is not set.", "matched_game": None, "assets": {}}
        try:
            return await asyncio.to_thread(
                self._resolve_artwork_sync,
                int(app_id),
                str(title or ""),
                bool(is_shortcut),
                api_key,
            )
        except Exception as exc:
            decky.logger.exception("Artwork resolution failed")
            return {"error": str(exc), "matched_game": None, "assets": {}}

    def _download_bytes_sync(self, url: str) -> tuple[bytes, str]:
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT}, method="GET")
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                data = response.read(15 * 1024 * 1024 + 1)
        except urllib.error.URLError as exc:
            raise RuntimeError(f"Artwork download failed: {exc.reason}") from exc

        if len(data) > 15 * 1024 * 1024:
            raise RuntimeError("Artwork file is unexpectedly large (>15 MB).")
        if data.startswith(b"\x89PNG\r\n\x1a\n"):
            return data, "png"
        if data.startswith(b"\xff\xd8\xff"):
            return data, "jpg"
        raise RuntimeError("Unsupported artwork format; expected PNG or JPEG.")

    async def download_image(self, url: str) -> dict[str, Any]:
        try:
            data, extension = await asyncio.to_thread(self._download_bytes_sync, str(url))
            return {
                "data": base64.b64encode(data).decode("ascii"),
                "extension": extension,
                "error": "",
            }
        except Exception as exc:
            return {"data": "", "extension": "", "error": str(exc)}

    async def download_icon_for_shortcut(self, app_id: int, url: str) -> dict[str, Any]:
        try:
            data, extension = await asyncio.to_thread(self._download_bytes_sync, str(url))
            icon_dir = self._runtime_dir() / "icons"
            icon_dir.mkdir(parents=True, exist_ok=True)
            path = icon_dir / f"{int(app_id)}.{extension}"
            path.write_bytes(data)
            return {"path": str(path), "error": ""}
        except Exception as exc:
            return {"path": "", "error": str(exc)}

    async def set_steam_icon_from_url(self, app_id: int, url: str) -> dict[str, Any]:
        try:
            data, _extension = await asyncio.to_thread(self._download_bytes_sync, str(url))
            library_cache = Path(decky.DECKY_USER_HOME) / ".local" / "share" / "Steam" / "appcache" / "librarycache"
            library_cache.mkdir(parents=True, exist_ok=True)
            # Steam's cache key is conventionally <appid>_icon.jpg. Steam decodes by content.
            target = library_cache / f"{int(app_id)}_icon.jpg"
            target.write_bytes(data)
            return {"ok": True, "error": ""}
        except Exception as exc:
            return {"ok": False, "error": str(exc)}

    async def _main(self):
        Path(decky.DECKY_PLUGIN_SETTINGS_DIR).mkdir(parents=True, exist_ok=True)
        Path(decky.DECKY_PLUGIN_RUNTIME_DIR).mkdir(parents=True, exist_ok=True)
        decky.logger.info("SGDB Apply All 0.1.0 loaded")

    async def _unload(self):
        decky.logger.info("SGDB Apply All unloaded")
