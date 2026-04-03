import { invoke } from "@tauri-apps/api/core";
import { downloadDir, join } from "@tauri-apps/api/path";
import { exists, mkdir, writeFile, writeTextFile } from "@tauri-apps/plugin-fs";
import type { JokerData, ModMetadata, UserVariable } from "@/lib/types";
import type { Rule } from "@/components/rule-builder/types";

interface RustAtlasPos {
  x: number;
  y: number;
}

interface RustTypedValue {
  value: unknown;
  valueType: string;
}

type RustParamValue = string | number | boolean | RustTypedValue;

interface RustConditionDef {
  condition_type: string;
  negate: boolean;
  params: Record<string, RustParamValue>;
}

interface RustConditionGroupDef {
  logic_operator: "and" | "or";
  conditions: RustConditionDef[];
}

interface RustEffectDef {
  effect_type: string;
  params: Record<string, RustParamValue>;
}

interface RustRandomGroupDef {
  id: string;
  chance_numerator: RustParamValue;
  chance_denominator: RustParamValue;
  effects: RustEffectDef[];
}

interface RustLoopGroupDef {
  id: string;
  count: RustParamValue;
  effects: RustEffectDef[];
}

interface RustRuleDef {
  id: string;
  trigger: string;
  condition_groups: RustConditionGroupDef[];
  effects: RustEffectDef[];
  random_groups: RustRandomGroupDef[];
  loop_groups: RustLoopGroupDef[];
}

interface RustUserVariableDef {
  name: string;
  var_type: "number" | "suit" | "rank" | "poker_hand" | "key" | "text";
  initial_value: RustParamValue;
}

interface RustJokerDef {
  key: string;
  name: string;
  description: string[];
  cost: number;
  rarity: string;
  blueprint_compat: boolean;
  eternal_compat: boolean;
  perishable_compat: boolean;
  unlocked: boolean;
  discovered: boolean;
  atlas: string;
  pos: RustAtlasPos;
  soul_pos?: RustAtlasPos;
  display_size?: { w: number; h: number };
  user_variables: RustUserVariableDef[];
  rules: RustRuleDef[];
}

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

interface JokerCompileOverrides {
  pos?: RustAtlasPos;
  soulPos?: RustAtlasPos;
}

interface AtlasBuildResult {
  atlasDataUrl: string;
  positionsById: Record<string, RustAtlasPos>;
  soulPositionsById: Record<string, RustAtlasPos>;
}

const splitDescription = (description: string): string[] => {
  const normalized = description.replace(/<br\s*\/?>/gi, "\n");
  const lines = normalized
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  return lines.length > 0 ? lines : ["No description"];
};

const escapeLuaString = (value: string): string =>
  value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");

const normalizeJokerLocKey = (prefix: string, objectKey: string): string => {
  const rawKey = objectKey.startsWith("j_") ? objectKey.slice(2) : objectKey;
  return `j_${prefix}_${rawKey}`;
};

const buildLuaStringArray = (lines: string[]): string => {
  if (lines.length === 0) {
    return "{}";
  }
  const items = lines
    .map((line, index) => `        [${index + 1}] = '${escapeLuaString(line)}'`)
    .join(",\n");
  return `{
${items}
      }`;
};

const buildLocalizationLua = (
  modPrefix: string,
  jokers: JokerData[],
): string => {
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

      return `    ${key} = {
      name = '${escapeLuaString(joker.name || "")}',
      text = ${buildLuaStringArray(text)}${unlockBlock}
    }`;
    })
    .join(",\n");

  return `return {
  descriptions = {
    Joker = {
${entries}
    }
  }
}
`;
};

const normalizeRarity = (rarity: JokerData["rarity"]): string => {
  if (typeof rarity === "string") return rarity.toLowerCase();
  if (rarity === 1) return "common";
  if (rarity === 2) return "uncommon";
  if (rarity === 3) return "rare";
  if (rarity === 4) return "legendary";
  return "common";
};

const getDisplaySizeOverride = (
  joker: JokerData,
): { w: number; h: number } | undefined => {
  const w = typeof joker.scale_w === "number" ? joker.scale_w / 100 : 1;
  const h = typeof joker.scale_h === "number" ? joker.scale_h / 100 : 1;
  const epsilon = 0.0001;
  if (Math.abs(w - 1) < epsilon && Math.abs(h - 1) < epsilon) {
    return undefined;
  }
  return { w, h };
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

const ensureUniqueModFolderPath = async (
  exportRootPath: string,
  modId: string,
): Promise<string> => {
  const basePath = await join(exportRootPath, modId);
  if (!(await exists(basePath))) {
    return basePath;
  }

  const timestamp = new Date()
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace("T", "_")
    .replace("Z", "");
  return join(exportRootPath, `${modId}_${timestamp}`);
};

const resolveExportRootPath = async (
  options: ExportModRustOptions,
): Promise<string> => {
  const destinationMode = options.destinationMode ?? "downloads";

  if (destinationMode === "balatro-mods") {
    const balatroModsPath = (options.balatroModsPath || "").trim();
    if (!balatroModsPath) {
      throw new Error(
        "Balatro mods folder is not configured. Set it in Settings -> Paths.",
      );
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

  const positionsById: Record<string, RustAtlasPos> = {};
  const soulPositionsById: Record<string, RustAtlasPos> = {};

  let currentPosition = 0;
  for (const joker of sorted) {
    const col = currentPosition % itemsPerRow;
    const row = Math.floor(currentPosition / itemsPerRow);
    positionsById[joker.id] = { x: col, y: row };

    const x = col * 71 * scale;
    const y = row * 95 * scale;
    const baseImage = await loadImage(joker.image || "");
    if (baseImage) {
      ctx.drawImage(
        baseImage,
        0,
        0,
        baseImage.width,
        baseImage.height,
        x,
        y,
        71 * scale,
        95 * scale,
      );
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
        ctx.drawImage(
          overlayImage,
          0,
          0,
          overlayImage.width,
          overlayImage.height,
          soulX,
          soulY,
          71 * scale,
          95 * scale,
        );
      }
      currentPosition += 1;
    }
  }

  return {
    atlasDataUrl: canvas.toDataURL("image/png"),
    positionsById,
    soulPositionsById,
  };
};

const toRustParamValue = (
  raw: { value: unknown; valueType?: string } | undefined,
): RustParamValue => {
  if (!raw) return 0;
  if (raw.valueType && raw.valueType.length > 0) {
    return { value: raw.value, valueType: raw.valueType };
  }
  if (
    typeof raw.value === "string" ||
    typeof raw.value === "number" ||
    typeof raw.value === "boolean"
  ) {
    return raw.value;
  }
  return String(raw.value ?? "");
};

const mapParams = (
  params: Record<string, { value: unknown; valueType?: string }> | undefined,
): Record<string, RustParamValue> => {
  if (!params) return {};
  const out: Record<string, RustParamValue> = {};
  for (const [key, value] of Object.entries(params)) {
    out[key] = toRustParamValue(value);
  }
  return out;
};

const mapRules = (rules: Rule[] | undefined): RustRuleDef[] => {
  if (!rules) return [];
  return rules.map((rule) => ({
    id: rule.id,
    trigger: rule.trigger,
    condition_groups: (rule.conditionGroups || []).map((group) => ({
      logic_operator: group.operator === "or" ? "or" : "and",
      conditions: (group.conditions || []).map((condition) => ({
        condition_type: condition.type,
        negate: !!condition.negate,
        params: mapParams(condition.params),
      })),
    })),
    effects: (rule.effects || []).map((effect) => ({
      effect_type: effect.type,
      params: mapParams(effect.params),
    })),
    random_groups: (rule.randomGroups || []).map((group) => ({
      id: group.id,
      chance_numerator: toRustParamValue(group.chance_numerator),
      chance_denominator: toRustParamValue(group.chance_denominator),
      effects: (group.effects || []).map((effect) => ({
        effect_type: effect.type,
        params: mapParams(effect.params),
      })),
    })),
    loop_groups: (rule.loops || []).map((group) => ({
      id: group.id,
      count: toRustParamValue(group.repetitions),
      effects: (group.effects || []).map((effect) => ({
        effect_type: effect.type,
        params: mapParams(effect.params),
      })),
    })),
  }));
};

const mapUserVariableType = (
  type: string | undefined,
): RustUserVariableDef["var_type"] => {
  if (type === "pokerhand") return "poker_hand";
  if (type === "suit" || type === "rank" || type === "key" || type === "text")
    return type;
  return "number";
};

const getUserVariableInitialValue = (v: UserVariable): RustParamValue => {
  if (v.type === "suit") return v.initialSuit ?? "Spades";
  if (v.type === "rank") return v.initialRank ?? "Ace";
  if (v.type === "pokerhand") return v.initialPokerHand ?? "High Card";
  if (v.type === "key") return v.initialKey ?? "none";
  if (v.type === "text") return v.initialText ?? "";
  return typeof v.initialValue === "number"
    ? v.initialValue
    : Number(v.initialValue ?? 0) || 0;
};

const mapJokerToRustDef = (
  joker: JokerData,
  overrides: JokerCompileOverrides = {},
): RustJokerDef => {
  return {
    key: joker.objectKey,
    name: joker.name,
    description: splitDescription(joker.description),
    cost: joker.cost,
    rarity: normalizeRarity(joker.rarity),
    blueprint_compat: !!joker.blueprint_compat,
    eternal_compat: !!joker.eternal_compat,
    perishable_compat: joker.perishable_compat ?? true,
    unlocked: joker.unlocked ?? true,
    discovered: joker.discovered ?? true,
    atlas: "CustomJokers",
    pos: overrides.pos ?? { x: 0, y: 0 },
    soul_pos: overrides.soulPos,
    display_size: getDisplaySizeOverride(joker),
    user_variables: (joker.userVariables || []).map((v) => ({
      name: v.name,
      var_type: mapUserVariableType(v.type),
      initial_value: getUserVariableInitialValue(v),
    })),
    rules: mapRules(joker.rules),
  };
};

const buildMainLua = (jokers: JokerData[]): string => {
  const sorted = [...jokers].sort((a, b) => a.orderValue - b.orderValue);
  const requires = sorted
    .map((j) => `assert(SMODS.load_file("jokers/${j.objectKey}.lua"))()`)
    .join("\n");

  const atlasDecl =
    sorted.length > 0
      ? `SMODS.Atlas({
    key = "CustomJokers",
    path = "CustomJokers.png",
    px = 71,
    py = 95,
    atlas_table = "ASSET_ATLAS"
})

`
      : "";

  return `${atlasDecl}local NFS = require("nativefs")
to_big = to_big or function(a) return a end
lenient_bignum = lenient_bignum or function(a) return a end

${requires}
`;
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

export const compileSingleJokerLua = async (
  joker: JokerData,
  modPrefix: string,
  options: CompileSingleJokerOptions = {},
): Promise<string> => {
  const jokerDef = mapJokerToRustDef(joker);
  const includeLocTxt = options.includeLocTxt ?? true;
  return invoke<string>("compile_joker_lua_with_options", {
    jokerDef,
    modPrefix,
    includeLocTxt,
  });
};

export const exportSingleJokerRust = async (
  joker: JokerData,
  modPrefix: string,
): Promise<void> => {
  const code = await compileSingleJokerLua(joker, modPrefix);
  downloadBlob(
    `${joker.objectKey}.lua`,
    new Blob([code], { type: "text/plain" }),
  );
};

export const exportModRust = async (
  metadata: ModMetadata,
  jokers: JokerData[],
  options: ExportModRustOptions = {},
): Promise<ExportModRustResult> => {
  const exportRootPath = await resolveExportRootPath(options);
  const modFolderPath = await ensureUniqueModFolderPath(
    exportRootPath,
    metadata.id,
  );
  const useLocalizationFile = options.useLocalizationFile ?? false;
  const locale = options.localizationLocale ?? "en-us";
  let fileCount = 0;

  await mkdir(modFolderPath, { recursive: true });

  const jokersFolderPath = await join(modFolderPath, "jokers");
  await mkdir(jokersFolderPath, { recursive: true });

  await writeTextFile(
    await join(modFolderPath, metadata.main_file),
    buildMainLua(jokers),
  );
  fileCount += 1;
  await writeTextFile(
    await join(modFolderPath, `${metadata.id}.json`),
    buildModJson(metadata),
  );
  fileCount += 1;

  const sorted = [...jokers].sort((a, b) => a.orderValue - b.orderValue);

  if (sorted.length > 0) {
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

    for (const joker of sorted) {
      const jokerDef = mapJokerToRustDef(joker, {
        pos: atlas1x.positionsById[joker.id] ?? { x: 0, y: 0 },
        soulPos: atlas1x.soulPositionsById[joker.id],
      });
      const code = await invoke<string>("compile_joker_lua_with_options", {
        jokerDef,
        modPrefix: metadata.prefix,
        includeLocTxt: !useLocalizationFile,
      });
      await writeTextFile(
        await join(jokersFolderPath, `${joker.objectKey}.lua`),
        code,
      );
      fileCount += 1;
    }
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

  return {
    exportRootPath,
    modFolderPath,
    fileCount,
  };
};
