import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { confirm } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { invoke } from "@tauri-apps/api/core";
import { valid, gt } from "semver";
import { RELEASE_CHANNEL } from "@/generated/release-channel";

type ReleaseChannel = "stable" | "nightly";
type Platform = "windows" | "linux" | "unsupported";

interface GitHubReleaseAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  name: string;
  tag_name: string;
  html_url: string;
  prerelease: boolean;
  draft: boolean;
  assets: GitHubReleaseAsset[];
}

const REPO_OWNER = "Jaydchw";
const REPO_NAME = "joker-forge-desktop";
const API_BASE = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;

const isNightlyVersion = (version: string) => version.includes("-nightly.");
const isNightlyTag = (value: string) => /^nightly-/i.test(value);
const isNightlyNamedRelease = (release: GitHubRelease) =>
  isNightlyTag(release.tag_name) || /nightly/i.test(release.name);

const UPDATE_CHECK_DEV_OVERRIDE =
  import.meta.env.VITE_ENABLE_UPDATE_CHECK_IN_DEV === "true";
const UPDATE_TEST_CHANNEL =
  import.meta.env.VITE_UPDATE_TEST_CHANNEL === "nightly" ||
  import.meta.env.VITE_UPDATE_TEST_CHANNEL === "stable"
    ? (import.meta.env.VITE_UPDATE_TEST_CHANNEL as ReleaseChannel)
    : null;
const UPDATE_TEST_CURRENT_VERSION =
  import.meta.env.VITE_UPDATE_TEST_CURRENT_VERSION?.trim() || null;

let hasCheckedForUpdateOnLaunch = false;

const getCurrentPlatform = (): Platform => {
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("windows")) return "windows";
  if (ua.includes("linux")) return "linux";
  return "unsupported";
};

const normalizeVersion = (value: string): string | null => {
  const withoutNightlyPrefix = value.replace(/^nightly-/, "");
  const withoutVPrefix = withoutNightlyPrefix.replace(/^v/, "");
  return valid(withoutVPrefix);
};

const parseReleaseVersion = (release: GitHubRelease): string | null => {
  const tagVersion = normalizeVersion(release.tag_name);
  if (tagVersion) return tagVersion;
  return normalizeVersion(release.name);
};

const selectInstallerAsset = (
  release: GitHubRelease,
  platform: Platform,
): GitHubReleaseAsset | null => {
  if (platform === "windows") {
    return release.assets.find((asset) => /\.exe$/i.test(asset.name)) ?? null;
  }

  if (platform === "linux") {
    return (
      release.assets.find((asset) => /\.AppImage$/i.test(asset.name)) ??
      release.assets.find((asset) => /\.deb$/i.test(asset.name)) ??
      null
    );
  }

  return null;
};

const getReleasesPage = async (): Promise<GitHubRelease[] | null> => {
  const response = await fetch(`${API_BASE}/releases?per_page=50`, {
    headers: { Accept: "application/vnd.github+json" },
  });

  if (!response.ok) {
    console.warn("[release-updater] GitHub releases request failed", {
      status: response.status,
    });
    return null;
  }

  return (await response.json()) as GitHubRelease[];
};

const getLatestStableRelease = async (): Promise<GitHubRelease | null> => {
  const releases = await getReleasesPage();
  if (!releases) return null;

  return (
    releases.find(
      (release) => !release.draft && !isNightlyNamedRelease(release),
    ) ?? null
  );
};

const getLatestNightlyRelease = async (): Promise<GitHubRelease | null> => {
  const releases = await getReleasesPage();
  if (!releases) return null;

  return (
    releases.find(
      (release) =>
        !release.draft && release.prerelease && isNightlyTag(release.tag_name),
    ) ?? null
  );
};

const getLatestReleaseForChannel = async (
  channel: ReleaseChannel,
): Promise<GitHubRelease | null> => {
  return channel === "nightly"
    ? getLatestNightlyRelease()
    : getLatestStableRelease();
};

const downloadAndLaunchInstaller = async (asset: GitHubReleaseAsset) => {
  const localPath = await invoke<string>("download_release_asset", {
    url: asset.browser_download_url,
    fileName: asset.name,
  });
  await openPath(localPath);
  try {
    await getCurrentWindow().close();
  } catch {
    // If closing fails, installer is still launched so this is non-fatal.
  }
};

export const checkForReleaseUpdateOnLaunch = async () => {
  if (hasCheckedForUpdateOnLaunch) {
    return;
  }
  hasCheckedForUpdateOnLaunch = true;

  if (import.meta.env.DEV && !UPDATE_CHECK_DEV_OVERRIDE) {
    return;
  }

  try {
    const resolvedCurrentVersion =
      UPDATE_TEST_CURRENT_VERSION ?? (await getVersion());

    const channel: ReleaseChannel =
      UPDATE_TEST_CHANNEL ??
      (RELEASE_CHANNEL === "nightly" || isNightlyVersion(resolvedCurrentVersion)
        ? "nightly"
        : "stable");

    const latestRelease = await getLatestReleaseForChannel(channel);
    if (!latestRelease) {
      console.info("[release-updater] No candidate release found", {
        channel,
      });
      return;
    }

    const currentNormalized = normalizeVersion(resolvedCurrentVersion);
    const latestNormalized = parseReleaseVersion(latestRelease);
    if (!currentNormalized || !latestNormalized) {
      console.warn("[release-updater] Could not normalize versions", {
        currentVersion: resolvedCurrentVersion,
        latestTag: latestRelease.tag_name,
        latestName: latestRelease.name,
      });
      return;
    }

    if (!gt(latestNormalized, currentNormalized)) {
      console.info("[release-updater] Already up to date", {
        channel,
        currentNormalized,
        latestNormalized,
      });
      return;
    }

    const platform = getCurrentPlatform();
    const installerAsset = selectInstallerAsset(latestRelease, platform);

    if (!installerAsset) {
      window.alert(
        `Update found (${latestNormalized}), but no installer was found for your platform.`,
      );
      return;
    }

    const approved = await confirm(
      [
        `A new ${channel} version is available.`,
        `Current: ${resolvedCurrentVersion}`,
        `Latest: ${latestNormalized}`,
        "",
        "Install update now?",
      ].join("\n"),
      {
        title: "Update Available",
        okLabel: "Auto Update",
        cancelLabel: "Later",
      },
    );

    if (!approved) {
      console.info("[release-updater] User declined update prompt", {
        channel,
        currentVersion: resolvedCurrentVersion,
        latestVersion: latestNormalized,
      });
      return;
    }

    try {
      await downloadAndLaunchInstaller(installerAsset);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      window.alert(`Failed to install update: ${message}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[release-updater] Update check failed", message);
  }
};
