/*
 * Context-menu hook adapted from SteamGridDB/decky-steamgriddb.
 * Original project: https://github.com/SteamGridDB/decky-steamgriddb
 * License: GPL-3.0. See THIRD_PARTY_NOTICES.md.
 */
import {
  afterPatch,
  Export,
  fakeRenderComponent,
  findInReactTree,
  findInTree,
  findModuleByExport,
  MenuItem,
  Patch,
} from "@decky/ui";
import { FC } from "react";

function insertApplyItem(
  children: any[],
  appId: number,
  onApply: (appId: number) => void,
) {
  const existingIndex = children.findIndex((x: any) => x?.key === "sgdb-apply-all");
  if (existingIndex !== -1) children.splice(existingIndex, 1);

  let propertiesIndex = children.findIndex((item) =>
    findInReactTree(
      item,
      (x) => x?.onSelected && x.onSelected.toString().includes("AppProperties"),
    ),
  );
  if (propertiesIndex < 0) propertiesIndex = children.length;

  children.splice(
    propertiesIndex,
    0,
    <MenuItem key="sgdb-apply-all" onSelected={() => onApply(appId)}>
      Apply SteamGridDB Artwork Set
    </MenuItem>,
  );
}

// Distinguish the game context menu from screenshot and other menus that reuse the component.
function isOpeningAppContextMenu(items: any[]): boolean {
  if (!items?.length) return false;
  return Boolean(
    findInReactTree(
      items,
      (x) => x?.props?.onSelected && x.props.onSelected.toString().includes("launchSource"),
    ),
  );
}

function removeDuplicate(items: any[]) {
  const index = items.findIndex((x: any) => x?.key === "sgdb-apply-all");
  if (index !== -1) items.splice(index, 1);
}

function patchMenuItems(
  menuItems: any[],
  initialAppId: number,
  onApply: (appId: number) => void,
) {
  let appId = initialAppId;

  // Steam can retain a cached app id on the outer context-menu component.
  const parentOverview = menuItems.find(
    (x: any) =>
      x?._owner?.pendingProps?.overview?.appid &&
      x._owner.pendingProps.overview.appid !== initialAppId,
  );
  if (parentOverview) appId = parentOverview._owner.pendingProps.overview.appid;

  // Current Steam clients can expose the app only inside the rendered tree.
  if (appId === initialAppId) {
    const foundApp = findInTree(menuItems, (x) => x?.app?.appid, {
      walkable: ["props", "children"],
    }) as any;
    if (foundApp) appId = foundApp.app.appid;
  }

  insertApplyItem(menuItems, Number(appId), onApply);
}

export function contextMenuPatch(
  LibraryContextMenu: any,
  onApply: (appId: number) => void,
): Patch {
  const patches: {
    outer?: Patch;
    inner?: Patch;
    unpatch: () => void;
  } = { unpatch: () => undefined };

  patches.outer = afterPatch(
    LibraryContextMenu.prototype,
    "render",
    (_args: Record<string, unknown>[], component: any) => {
      let appId = 1018880; // fallback is immediately replaced on normal game menus
      if (component?._owner?.pendingProps?.overview?.appid) {
        appId = component._owner.pendingProps.overview.appid;
      } else {
        const foundApp = findInTree(component?.props?.children, (x) => x?.app?.appid, {
          walkable: ["props", "children"],
        }) as any;
        if (foundApp) appId = foundApp.app.appid;
      }

      if (!patches.inner) {
        patches.inner = afterPatch(component, "type", (_innerArgs: any, ret: any) => {
          afterPatch(ret.type.prototype, "render", (_renderArgs: any, ret2: any) => {
            const menuItems = ret2?.props?.children?.[0];
            if (!isOpeningAppContextMenu(menuItems)) return ret2;
            try {
              removeDuplicate(menuItems);
              patchMenuItems(menuItems, appId, onApply);
            } catch (error) {
              console.error("[SGDB Apply All] Could not patch initial context menu", error);
            }
            return ret2;
          });

          afterPatch(
            ret.type.prototype,
            "shouldComponentUpdate",
            ([nextProps]: any, shouldUpdate: any) => {
              try {
                removeDuplicate(nextProps.children);
              } catch (_error) {
                return shouldUpdate;
              }
              if (shouldUpdate === true) {
                patchMenuItems(nextProps.children, appId, onApply);
              }
              return shouldUpdate;
            },
          );
          return ret;
        });
      } else if (Array.isArray(component?.props?.children)) {
        insertApplyItem(component.props.children, appId, onApply);
      }

      return component;
    },
  );

  patches.unpatch = () => {
    patches.outer?.unpatch();
    patches.inner?.unpatch();
  };

  return patches as Patch;
}

export const LibraryContextMenu = fakeRenderComponent(
  Object.values(
    findModuleByExport((e: Export) =>
      Boolean(e?.toString && e.toString().includes("().LibraryContextMenu")),
    ),
  ).find((sibling: any) => sibling?.toString?.().includes("navigator:")) as FC,
).type;
