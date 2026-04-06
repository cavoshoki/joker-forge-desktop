import { getVersion } from "@tauri-apps/api/app";
import { downloadDir, join } from "@tauri-apps/api/path";
import { openPath } from "@tauri-apps/plugin-opener";
import { writeFile } from "@tauri-apps/plugin-fs";
import { valid, gt } from "semver";

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

const getLatestStableRelease = async (): Promise<GitHubRelease | null> => {
  const response = await fetch(`${API_BASE}/releases/latest`, {
    headers: { Accept: "application/vnd.github+json" },
  });

  if (!response.ok) {
    return null;
  }

  const release = (await response.json()) as GitHubRelease;
  if (release.draft) return null;
  return release;
};

const getLatestNightlyRelease = async (): Promise<GitHubRelease | null> => {
  const response = await fetch(`${API_BASE}/releases?per_page=50`, {
    headers: { Accept: "application/vnd.github+json" },
  });

  if (!response.ok) {
    return null;
  }

  const releases = (await response.json()) as GitHubRelease[];
  return (
    releases.find(
      (release) =>
        !release.draft &&
        release.prerelease &&
        release.tag_name.startsWith("nightly-"),
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
  const response = await fetch(asset.browser_download_url, {
    headers: { Accept: "application/octet-stream" },
  });

  if (!response.ok) {
    throw new Error(`Download failed with status ${response.status}`);
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  const downloadsPath = await downloadDir();
  const localPath = await join(downloadsPath, asset.name);
  await writeFile(localPath, bytes);
  await openPath(localPath);
};

export const checkForReleaseUpdateOnLaunch = async () => {
  if (import.meta.env.DEV) return;

  let currentVersion = "";
  try {
    currentVersion = await getVersion();
  } catch {
    return;
  }

  const channel: ReleaseChannel = isNightlyVersion(currentVersion)
    ? "nightly"
    : "stable";

  const latestRelease = await getLatestReleaseForChannel(channel);
  if (!latestRelease) return;

  const currentNormalized = normalizeVersion(currentVersion);
  const latestNormalized = parseReleaseVersion(latestRelease);
  if (!currentNormalized || !latestNormalized) return;

  if (!gt(latestNormalized, currentNormalized)) {
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

  const approved = window.confirm(
    [
      `A new ${channel} version is available.`,
      `Current: ${currentVersion}`,
      `Latest: ${latestNormalized}`,
      "",
      "Install update now?",
    ].join("\n"),
  );

  if (!approved) {
    return;
  }

  try {
    await downloadAndLaunchInstaller(installerAsset);
    window.alert(
      "Installer downloaded and launched. Complete the installer to finish updating.",
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    window.alert(`Failed to install update: ${message}`);
  }
};
