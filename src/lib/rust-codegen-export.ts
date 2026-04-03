import { invoke } from "@tauri-apps/api/core";
import { downloadDir, join } from "@tauri-apps/api/path";
import { exists, mkdir, writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type { JokerData, ModMetadata } from "@/lib/types";

// ---------------------------------------------------------------------------
// Public option / result types
// ---------------------------------------------------------------------------

interface CompileSingleJokerOptions {
  includeLocTxt?: boolean;
}

interface ExportModRustOptions {
  useLocalizationFile?: boolean;
  localizationLocale?: string;
  destinationMode?: "downloads" | "balatro-mods";
  balatroModsPath?: string;
}

export interface ExportModRustResult {
  exportRootPath: string;
  modFolderPath: string;
  fileCount: number;
}

// ---------------------------------------------------------------------------
// Atlas building (browser Canvas — stays in TypeScript)
// ---------------------------------------------------------------------------

interface AtlasPos {
  x: number;
  y: number;
}

interface AtlasBuildResult {
  atlasDataUrl: string;
  positionsById: Record<string, AtlasPos>;
  soulPositionsById: Record<string, AtlasPos>;
}

const loadImage = (src: string): Promise<HTMLImageElement | null> => {
  return new Promise((resolve) => {
    if (!src || src.trim().length === 0) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
};

const buildJokerAtlas = async (
  jokers: JokerData[],
  scale: number,
): Promise<AtlasBuildResult> => {
  const itemsPerRow = 10;
  const sorted = [...jokers].sort((a, b) => a.orderValue - b.orderValue);
  const totalPositions = sorted.reduce(
    (count, joker) => count + (joker.overlayImage ? 2 : 1),
    0,
  );
  const rows = Math.max(1, Math.ceil(totalPositions / itemsPerRow));

  const canvas = document.createElement("canvas");
  canvas.width = itemsPerRow * 71 * scale;
  canvas.height = rows * 95 * scale;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to build joker atlas: missing canvas context.");
  }
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const positionsById: Record<string, AtlasPos> = {};
  const soulPositionsById: Record<string, AtlasPos> = {};

  let currentPosition = 0;
  for (const joker of sorted) {
    const col = currentPosition % itemsPerRow;
    const row = Math.floor(currentPosition / itemsPerRow);
    positionsById[joker.id] = { x: col, y: row };

    const x = col * 71 * scale;
    const y = row * 95 * scale;
    const baseImage = await loadImage(joker.image || "");
    if (baseImage) {
      ctx.drawImage(baseImage, 0, 0, baseImage.width, baseImage.height, x, y, 71 * scale, 95 * scale);
    }
    currentPosition += 1;

    if (joker.overlayImage && joker.overlayImage.trim().length > 0) {
      const soulCol = currentPosition % itemsPerRow;
      const soulRow = Math.floor(currentPosition / itemsPerRow);
      soulPositionsById[joker.id] = { x: soulCol, y: soulRow };

      const soulX = soulCol * 71 * scale;
      const soulY = soulRow * 95 * scale;
      const overlayImage = await loadImage(joker.overlayImage);
      if (overlayImage) {
        ctx.drawImage(overlayImage, 0, 0, overlayImage.width, overlayImage.height, soulX, soulY, 71 * scale, 95 * scale);
      }
      currentPosition += 1;
    }
  }

  return { atlasDataUrl: canvas.toDataURL("image/png"), positionsById, soulPositionsById };
};

const dataURLToUint8Array = (dataUrl: string): Uint8Array => {
  const [, data] = dataUrl.split(",");
  const decoded = atob(data || "");
  const bytes = new Uint8Array(decoded.length);
  for (let i = 0; i < decoded.length; i += 1) {
    bytes[i] = decoded.charCodeAt(i);
  }
  return bytes;
};

// ---------------------------------------------------------------------------
// Lua / JSON text builders (pure TypeScript strings — no Rust needed)
// ---------------------------------------------------------------------------

const escapeLuaString = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

const normalizeJokerLocKey = (prefix: string, objectKey: string): string => {
  const rawKey = objectKey.startsWith("j_") ? objectKey.slice(2) : objectKey;
  return `j_${prefix}_${rawKey}`;
};

const splitDescription = (description: string): string[] => {
  const normalized = description
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/\[s\]/g, "\n");
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length > 0 ? lines : ["No description"];
};

const buildLuaStringArray = (lines: string[]): string => {
  if (lines.length === 0) return "{}";
  const items = lines
    .map((line, index) => `        [${index + 1}] = '${escapeLuaString(line)}'`)
    .join(",\n");
  return `{\n${items}\n      }`;
};

const buildLocalizationLua = (modPrefix: string, jokers: JokerData[]): string => {
  const sorted = [...jokers].sort((a, b) => a.orderValue - b.orderValue);
  const entries = sorted
    .map((joker) => {
      const key = normalizeJokerLocKey(modPrefix, joker.objectKey);
      const text = splitDescription(joker.description || "");
      const unlockText = splitDescription(joker.unlockDescription || "");
      const unlockBlock =
        unlockText.length > 0
          ? `,\n      unlock = ${buildLuaStringArray(unlockText)}`
          : "";
      return `    ${key} = {\n      name = '${escapeLuaString(joker.name || "")}',\n      text = ${buildLuaStringArray(text)}${unlockBlock}\n    }`;
    })
    .join(",\n");

  return `return {\n  descriptions = {\n    Joker = {\n${entries}\n    }\n  }\n}\n`;
};

const buildMainLua = (jokers: JokerData[]): string => {
  const sorted = [...jokers].sort((a, b) => a.orderValue - b.orderValue);
  const requires = sorted
    .map((j) => `assert(SMODS.load_file("jokers/${j.objectKey}.lua"))()`)
    .join("\n");

  const atlasDecl =
    sorted.length > 0
      ? `SMODS.Atlas({\n    key = "CustomJokers",\n    path = "CustomJokers.png",\n    px = 71,\n    py = 95,\n    atlas_table = "ASSET_ATLAS"\n})\n\n`
      : "";

  return `${atlasDecl}local NFS = require("nativefs")\nto_big = to_big or function(a) return a end\nlenient_bignum = lenient_bignum or function(a) return a end\n\n${requires}\n`;
};

const buildModJson = (metadata: ModMetadata): string => {
  const payload = {
    id: metadata.id,
    name: metadata.name,
    display_name: metadata.display_name,
    author: metadata.author,
    description: metadata.description,
    prefix: metadata.prefix,
    main_file: metadata.main_file,
    version: metadata.version,
    priority: metadata.priority,
    badge_colour: metadata.badge_colour,
    badge_text_colour: metadata.badge_text_colour,
    dependencies: metadata.dependencies,
    conflicts: metadata.conflicts,
    provides: metadata.provides,
  };
  return JSON.stringify(payload, null, 2);
};

const downloadBlob = (filename: string, content: Blob) => {
  const url = URL.createObjectURL(content);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

const ensureUniqueModFolderPath = async (
  exportRootPath: string,
  modId: string,
): Promise<string> => {
  const basePath = await join(exportRootPath, modId);
  if (!(await exists(basePath))) return basePath;
  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .replace("Z", "");
  return join(exportRootPath, `${modId}_${timestamp}`);
};

const resolveExportRootPath = async (options: ExportModRustOptions): Promise<string> => {
  const destinationMode = options.destinationMode ?? "downloads";
  if (destinationMode === "balatro-mods") {
    const balatroModsPath = (options.balatroModsPath || "").trim();
    if (!balatroModsPath) {
      throw new Error("Balatro mods folder is not configured. Set it in Settings -> Paths.");
    }
    if (!(await exists(balatroModsPath))) {
      throw new Error(`Balatro mods folder does not exist: ${balatroModsPath}`);
    }
    return balatroModsPath;
  }
  const downloadsPath = await downloadDir();
  if (!downloadsPath || !(await exists(downloadsPath))) {
    throw new Error("Unable to resolve Downloads folder for export.");
  }
  return downloadsPath;
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Compile a single joker to Lua.
 *
 * Sends the raw `JokerData` to Rust via `compile_joker_from_data`.
 * No TypeScript-side mapping required.
 */
export const compileSingleJokerLua = async (
  joker: JokerData,
  modPrefix: string,
  options: CompileSingleJokerOptions = {},
): Promise<string> => {
  return invoke<string>("compile_joker_from_data", {
    jokerData: joker,
    pos: { x: 0, y: 0 },
    soulPos: null,
    modPrefix,
    includeLocTxt: options.includeLocTxt ?? true,
  });
};

/**
 * Compile a single joker and trigger a browser download.
 */
export const exportSingleJokerRust = async (
  joker: JokerData,
  modPrefix: string,
): Promise<void> => {
  const code = await compileSingleJokerLua(joker, modPrefix);
  downloadBlob(`${joker.objectKey}.lua`, new Blob([code], { type: "text/plain" }));
};

/**
 * Export a complete mod to disk.
 *
 * Atlas image building stays in TypeScript (Canvas API).
 * All Lua compilation + file writing is delegated to a single Rust call
 * (`batch_export_jokers`), eliminating the N-joker IPC loop that existed
 * previously.
 */
export const exportModRust = async (
  metadata: ModMetadata,
  jokers: JokerData[],
  options: ExportModRustOptions = {},
): Promise<ExportModRustResult> => {
  const exportRootPath = await resolveExportRootPath(options);
  const modFolderPath = await ensureUniqueModFolderPath(exportRootPath, metadata.id);
  const useLocalizationFile = options.useLocalizationFile ?? false;
  const locale = options.localizationLocale ?? "en-us";
  let fileCount = 0;

  await mkdir(modFolderPath, { recursive: true });

  const jokersFolderPath = await join(modFolderPath, "jokers");
  await mkdir(jokersFolderPath, { recursive: true });

  // Write text metadata files (pure string building — no Rust roundtrip needed)
  await writeTextFile(await join(modFolderPath, metadata.main_file), buildMainLua(jokers));
  fileCount += 1;
  await writeTextFile(await join(modFolderPath, `${metadata.id}.json`), buildModJson(metadata));
  fileCount += 1;

  const sorted = [...jokers].sort((a, b) => a.orderValue - b.orderValue);

  if (sorted.length > 0) {
    // Atlas images: Canvas rendering must stay in TypeScript
    const assetsFolderPath = await join(modFolderPath, "assets");
    const assets1xPath = await join(assetsFolderPath, "1x");
    const assets2xPath = await join(assetsFolderPath, "2x");
    await mkdir(assets1xPath, { recursive: true });
    await mkdir(assets2xPath, { recursive: true });

    const atlas1x = await buildJokerAtlas(sorted, 1);
    const atlas2x = await buildJokerAtlas(sorted, 2);

    await writeFile(
      await join(assets1xPath, "CustomJokers.png"),
      dataURLToUint8Array(atlas1x.atlasDataUrl),
    );
    fileCount += 1;
    await writeFile(
      await join(assets2xPath, "CustomJokers.png"),
      dataURLToUint8Array(atlas2x.atlasDataUrl),
    );
    fileCount += 1;

    // Compile all jokers + write their Lua files in a single Rust call.
    // Rust maps JokerData → JokerDef internally; no TypeScript mapping needed.
    const written = await invoke<number>("batch_export_jokers", {
      jokerFolderPath: jokersFolderPath,
      modPrefix: metadata.prefix,
      jokers: sorted.map((joker) => ({
        jokerData: joker,
        pos: atlas1x.positionsById[joker.id] ?? { x: 0, y: 0 },
        soulPos: atlas1x.soulPositionsById[joker.id] ?? null,
        fileName: `${joker.objectKey}.lua`,
      })),
      includeLocTxt: !useLocalizationFile,
    });
    fileCount += written;
  }

  if (useLocalizationFile) {
    const localizationPath = await join(modFolderPath, "localization");
    await mkdir(localizationPath, { recursive: true });
    await writeTextFile(
      await join(localizationPath, `${locale}.lua`),
      buildLocalizationLua(metadata.prefix, sorted),
    );
    fileCount += 1;
  }

  return { exportRootPath, modFolderPath, fileCount };
};
