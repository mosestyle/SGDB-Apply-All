interface Window {
  appStore?: {
    GetAppOverviewByAppID?: (appId: number) => any;
  };
  appDetailsStore?: {
    GetCustomLogoPosition?: (appId: number) => any;
    SaveCustomLogoPosition?: (appId: number, position: any) => void | Promise<void>;
  };
}

declare const SteamClient: {
  Apps: {
    ClearCustomArtworkForApp: (appId: number, assetType: number) => Promise<void> | void;
    SetCustomArtworkForApp: (
      appId: number,
      base64: string,
      extension: "png" | "jpg",
      assetType: number,
    ) => Promise<void> | void;
    SetShortcutIcon?: (appId: number, path: string) => Promise<void> | void;
    RequestIconDataForApp?: (appId: number) => Promise<void> | void;
  };
};
