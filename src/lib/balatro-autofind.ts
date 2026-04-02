import { dataDir, homeDir, join } from "@tauri-apps/api/path";
import { exists } from "@tauri-apps/plugin-fs";
import {
  getBalatroInstallPath,
  setBalatroAutofindResult,
  setBalatroInstallPath,
} from "@/lib/storage";
import type { GlobalAlert } from "@/components/layout/global-alerts";

const normalizeWindowsSeparators = (value: string) => {
  if (!/^[a-zA-Z]:\\+/.test(value)) return value;
  return value.replace(/\\{2,}/g, "\\");
};

const createAlertId = () =>
  `balatro-autofind-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const verifyCandidate = async (candidate: string): Promise<string | null> => {
  const normalized = normalizeWindowsSeparators(candidate);
  if (!normalized) return null;
  if (await exists(normalized)) return normalized;
  return null;
};

const resolveModsPathFromStoredPath = async (
  storedPath: string,
): Promise<string | null> => {
  const normalizedStoredPath = normalizeWindowsSeparators(storedPath);
  const lowerPath = normalizedStoredPath.toLowerCase();

  const candidates: string[] = [normalizedStoredPath];
  if (!lowerPath.endsWith("\\mods")) {
    candidates.push(await join(normalizedStoredPath, "mods"));
    candidates.push(await join(normalizedStoredPath, "Mods"));
  }

  for (const candidate of candidates) {
    const verified = await verifyCandidate(candidate);
    if (verified) return verified;
  }

  return null;
};

export const runBalatroAutofind = async (): Promise<GlobalAlert[]> => {
  const storedPath = getBalatroInstallPath();

  if (storedPath) {
    const verifiedStoredPath = await resolveModsPathFromStoredPath(storedPath);
    if (verifiedStoredPath) {
      setBalatroInstallPath(verifiedStoredPath);
      setBalatroAutofindResult("success");
      return [];
    }
  }

  try {
    const data = await dataDir();
    const basePath = data || (await homeDir());
    const balatroRootPath = normalizeWindowsSeparators(
      data
        ? await join(basePath, "Balatro")
        : await join(basePath, "AppData", "Roaming", "Balatro"),
    );

    const candidates = [
      await join(balatroRootPath, "mods"),
      await join(balatroRootPath, "Mods"),
    ];

    for (const candidate of candidates) {
      const verified = await verifyCandidate(candidate);
      if (!verified) continue;

      console.debug("[balatro-autofind] resolved path", {
        basePath,
        usedDataDir: Boolean(data),
        verified,
      });

      setBalatroInstallPath(verified);
      setBalatroAutofindResult("success");
      return [];
    }

    console.debug("[balatro-autofind] default path missing", {
      basePath,
      usedDataDir: Boolean(data),
      candidates,
    });
    setBalatroAutofindResult("failure");
    return [
      {
        id: createAlertId(),
        type: "danger",
        title: "Balatro mods path not found",
        message:
          "Could not find the Balatro mods folder on launch.\nExpected a path like C:\\Users\\<you>\\AppData\\Roaming\\Balatro\\mods.",
      },
    ];
  } catch {
    setBalatroAutofindResult("failure");
    return [
      {
        id: createAlertId(),
        type: "danger",
        title: "Balatro mods path not found",
        message:
          "Unable to determine or verify the Balatro mods folder on launch.",
      },
    ];
  }
};
