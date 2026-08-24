import { callable, toaster } from "@decky/api";

type SlotKey = "grid_p" | "grid_l" | "hero" | "logo" | "icon";

type ResolveResult = {
  error: string;
  matched_game: null | { id?: number; name?: string };
  assets: Partial<Record<SlotKey, { url: string; score?: number; id?: number }>>;
};

type DownloadResult = { data: string; extension: "png" | "jpg" | ""; error: string };
type PathResult = { path: string; error: string };
type BoolResult = { ok: boolean; error: string };

const getApiKey = callable<[], string>("get_api_key");
const resolveArtwork = callable<
  [app_id: number, title: string, is_shortcut: boolean],
  ResolveResult
>("resolve_artwork");
const downloadImage = callable<[url: string], DownloadResult>("download_image");
const downloadIconForShortcut = callable<[app_id: number, url: string], PathResult>(
  "download_icon_for_shortcut",
);
const setSteamIconFromUrl = callable<[app_id: number, url: string], BoolResult>(
  "set_steam_icon_from_url",
);

const inFlight = new Set<number>();
const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const SLOT_INFO: Record<Exclude<SlotKey, "icon">, { label: string; assetType: number }> = {
  grid_p: { label: "Capsule", assetType: 0 },
  hero: { label: "Hero", assetType: 1 },
  logo: { label: "Logo", assetType: 2 },
  grid_l: { label: "Wide Capsule", assetType: 3 },
};

async function applyImage(appId: number, assetType: number, url: string): Promise<void> {
  const downloaded = await downloadImage(url);
  if (downloaded.error) throw new Error(downloaded.error);
  if (!downloaded.data || (downloaded.extension !== "png" && downloaded.extension !== "jpg")) {
    throw new Error("Downloaded artwork was empty or unsupported.");
  }

  await SteamClient.Apps.ClearCustomArtworkForApp(appId, assetType);
  await delay(500);
  await SteamClient.Apps.SetCustomArtworkForApp(
    appId,
    downloaded.data,
    downloaded.extension,
    assetType,
  );

  if (assetType === 2) {
    try {
      const existing = window.appDetailsStore?.GetCustomLogoPosition?.(appId);
      if (!existing && window.appDetailsStore?.SaveCustomLogoPosition) {
        await window.appDetailsStore.SaveCustomLogoPosition(appId, {
          pinnedPosition: "BottomLeft",
          nWidthPct: 50,
          nHeightPct: 50,
        });
      }
    } catch (error) {
      console.warn("[SGDB Apply All] Could not set default logo position", error);
    }
  }
}

export async function applyAllForApp(appId: number): Promise<void> {
  if (inFlight.has(appId)) {
    toaster.toast({ title: "SGDB Apply All", body: "Artwork is already being applied to this game." });
    return;
  }

  inFlight.add(appId);
  try {
    const apiKey = (await getApiKey()).trim();
    if (!apiKey) {
      toaster.toast({
        title: "SGDB Apply All",
        body: "Set your free SteamGridDB API key in the plugin settings first.",
      });
      return;
    }

    const overview = window.appStore?.GetAppOverviewByAppID?.(appId);
    const title = String(overview?.display_name ?? overview?.sort_as ?? `App ${appId}`);
    const isShortcut = Boolean(overview?.BIsShortcut?.());

    toaster.toast({ title: "SGDB Apply All", body: `Finding artwork for ${title}…` });

    const resolved = await resolveArtwork(appId, title, isShortcut);
    if (resolved.error && !Object.keys(resolved.assets || {}).length) {
      throw new Error(resolved.error);
    }

    let applied = 0;
    const failed: string[] = [];

    const orderedSlots: Array<Exclude<SlotKey, "icon">> = ["grid_p", "grid_l", "hero", "logo"];
    for (const slot of orderedSlots) {
      const asset = resolved.assets?.[slot];
      const info = SLOT_INFO[slot];
      if (!asset?.url) {
        failed.push(info.label);
        continue;
      }
      try {
        await applyImage(appId, info.assetType, asset.url);
        applied += 1;
      } catch (error) {
        console.error(`[SGDB Apply All] Failed ${info.label}`, error);
        failed.push(info.label);
      }
    }

    const icon = resolved.assets?.icon;
    if (!icon?.url) {
      failed.push("Icon");
    } else {
      try {
        if (isShortcut) {
          const iconFile = await downloadIconForShortcut(appId, icon.url);
          if (iconFile.error || !iconFile.path) throw new Error(iconFile.error || "Icon path missing.");
          if (!SteamClient.Apps.SetShortcutIcon) throw new Error("This Steam client does not expose SetShortcutIcon.");
          await SteamClient.Apps.SetShortcutIcon(appId, iconFile.path);
        } else {
          const result = await setSteamIconFromUrl(appId, icon.url);
          if (!result.ok) throw new Error(result.error || "Could not update Steam icon cache.");
          try {
            await SteamClient.Apps.RequestIconDataForApp?.(appId);
          } catch (_error) {
            // Cache write is still valid; Steam may refresh it later on its own.
          }
        }
        applied += 1;
      } catch (error) {
        console.error("[SGDB Apply All] Failed Icon", error);
        failed.push("Icon");
      }
    }

    const suffix = failed.length ? ` Missing/failed: ${failed.join(", ")}.` : "";
    const shortcutNote = isShortcut && !failed.includes("Icon") ? " Shortcut icon may refresh after Steam restarts." : "";
    toaster.toast({
      title: "SGDB Apply All",
      body: `Applied ${applied}/5 artwork types.${suffix}${shortcutNote}`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    toaster.toast({ title: "SGDB Apply All", body: message });
    console.error("[SGDB Apply All] Apply-all failed", error);
  } finally {
    inFlight.delete(appId);
  }
}
