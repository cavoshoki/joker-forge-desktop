const fs = require("node:fs");
const path = require("node:path");

const root = process.cwd();
const appVersionFile = path.join(root, "app-version.json");
const packageFile = path.join(root, "package.json");
const tauriConfigFile = path.join(root, "src-tauri", "tauri.conf.json");
const cargoTomlFile = path.join(root, "src-tauri", "Cargo.toml");
const releaseChannelFile = path.join(
  root,
  "src",
  "generated",
  "release-channel.ts",
);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function syncReleaseChannelStable() {
  const stableChannelContents =
    'export const RELEASE_CHANNEL: "stable" | "nightly" = "stable";\n';
  if (!fs.existsSync(path.dirname(releaseChannelFile))) {
    fs.mkdirSync(path.dirname(releaseChannelFile), { recursive: true });
  }
  const existing = fs.existsSync(releaseChannelFile)
    ? fs.readFileSync(releaseChannelFile, "utf8")
    : "";
  if (existing !== stableChannelContents) {
    fs.writeFileSync(releaseChannelFile, stableChannelContents, "utf8");
    return true;
  }
  return false;
}

function syncPackageVersion(version) {
  const pkg = readJson(packageFile);
  if (pkg.version !== version) {
    pkg.version = version;
    writeJson(packageFile, pkg);
    return true;
  }
  return false;
}

function syncTauriVersion(version) {
  const tauri = readJson(tauriConfigFile);
  if (tauri.version !== version) {
    tauri.version = version;
    writeJson(tauriConfigFile, tauri);
    return true;
  }
  return false;
}

function syncCargoVersion(version) {
  const cargoContents = fs.readFileSync(cargoTomlFile, "utf8");
  const next = cargoContents.replace(
    /(\[package\][\s\S]*?\nversion\s*=\s*")([^"]+)(")/,
    `$1${version}$3`,
  );
  if (next !== cargoContents) {
    fs.writeFileSync(cargoTomlFile, next, "utf8");
    return true;
  }
  return false;
}

const { version } = readJson(appVersionFile);
if (!version || typeof version !== "string") {
  throw new Error("app-version.json must contain a string 'version' field");
}

const changes = [
  ["package.json", syncPackageVersion(version)],
  ["src-tauri/tauri.conf.json", syncTauriVersion(version)],
  ["src-tauri/Cargo.toml", syncCargoVersion(version)],
  ["src/generated/release-channel.ts", syncReleaseChannelStable()],
].filter(([, changed]) => changed);

if (changes.length === 0) {
  console.log(`Version already in sync (${version})`);
} else {
  console.log(`Synchronized version to ${version}:`);
  for (const [file] of changes) {
    console.log(`- ${file}`);
  }
}
