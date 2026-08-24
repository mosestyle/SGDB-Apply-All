import { ButtonItem, PanelSection, PanelSectionRow, staticClasses } from "@decky/ui";
import { callable, definePlugin, toaster } from "@decky/api";
import { useEffect, useRef, useState } from "react";
import { FaImages } from "react-icons/fa";

import { applyAllForApp } from "./applyAll";
import { contextMenuPatch, LibraryContextMenu } from "./contextMenuPatch";

const getApiKey = callable<[], string>("get_api_key");
const setApiKey = callable<[api_key: string], boolean>("set_api_key");
const validateApiKey = callable<[api_key?: string], { ok: boolean; error: string }>(
  "validate_api_key",
);

function Content() {
  const keyRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState("Loading saved key…");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void getApiKey().then((key) => {
      if (!active) return;
      if (keyRef.current) keyRef.current.value = key;
      setStatus(key ? "API key saved." : "No API key saved yet.");
    });
    return () => {
      active = false;
    };
  }, []);

  const saveAndCheck = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const key = (keyRef.current?.value ?? "").trim();
      await setApiKey(key);
      if (!key) {
        setStatus("API key cleared.");
        return;
      }
      setStatus("Checking key…");
      const result = await validateApiKey(key);
      if (result.ok) {
        setStatus("✓ API key works.");
        toaster.toast({ title: "SGDB Apply All", body: "SteamGridDB API key verified." });
      } else {
        setStatus(`Saved, but check failed: ${result.error}`);
      }
    } catch (error) {
      setStatus(`Could not save/check: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <PanelSection title="SteamGridDB API">
      <PanelSectionRow>
        <div style={{ fontSize: "14px", lineHeight: 1.35, opacity: 0.9 }}>
          This companion does not modify the official SteamGridDB plugin. Add your own free API key once,
          then use <b>Apply SteamGridDB Artwork Set</b> from a game&apos;s context menu.
        </div>
      </PanelSectionRow>
      <PanelSectionRow>
        <input
          ref={keyRef}
          type="password"
          aria-label="SteamGridDB API key"
          placeholder="Paste SteamGridDB API key"
          autoComplete="off"
          spellCheck={false}
          style={{
            width: "100%",
            boxSizing: "border-box",
            fontSize: "16px",
            padding: "12px",
            borderRadius: "4px",
          }}
        />
      </PanelSectionRow>
      <PanelSectionRow>
        <ButtonItem layout="below" disabled={busy} onClick={saveAndCheck}>
          {busy ? "Saving…" : "Save & check key"}
        </ButtonItem>
      </PanelSectionRow>
      <PanelSectionRow>
        <div style={{ fontSize: "13px", opacity: 0.8 }}>{status}</div>
      </PanelSectionRow>
      <PanelSectionRow>
        <div style={{ fontSize: "12px", lineHeight: 1.35, opacity: 0.68 }}>
          V0.1 picks the highest-scored compatible static artwork for Capsule, Wide Capsule, Hero, Logo and
          Icon. NSFW/humor/animated results are excluded. You can still use the normal SteamGridDB plugin to
          manually replace any individual choice afterward.
        </div>
      </PanelSectionRow>
    </PanelSection>
  );
}

export default definePlugin(() => {
  console.log("[SGDB Apply All] Initializing");
  const patch = contextMenuPatch(LibraryContextMenu, (appId) => {
    void applyAllForApp(appId);
  });

  return {
    name: "SGDB Apply All",
    titleView: <div className={staticClasses.Title}>SGDB Apply All</div>,
    content: <Content />,
    icon: <FaImages />,
    onDismount() {
      console.log("[SGDB Apply All] Unloading");
      patch.unpatch();
    },
  };
});
