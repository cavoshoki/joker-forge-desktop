import type { ProjectData } from "@/lib/storage";
import { normalizeProjectData } from "@/lib/jokerforge/legacy-transpiler";

export interface JokerforgeV2Export {
  format: "jokerforge";
  version: 2;
  exportedAt: string;
  project: ProjectData;
}

export const buildJokerforgeV2Export = (
  project: ProjectData,
): JokerforgeV2Export => {
  return {
    format: "jokerforge",
    version: 2,
    exportedAt: new Date().toISOString(),
    project: normalizeProjectData(project),
  };
};

export const serializeJokerforgeV2 = (project: ProjectData): string => {
  return JSON.stringify(buildJokerforgeV2Export(project), null, 2);
};

const sanitizeFilenameBase = (value: string): string => {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return cleaned || "jokerforge-export";
};

export const downloadJokerforgeV2 = (
  project: ProjectData,
  fileName?: string,
  extension: "jokerforge" | "json" = "jokerforge",
): void => {
  const baseName =
    fileName ||
    sanitizeFilenameBase(
      project.metadata?.id || project.metadata?.name || "jokerforge-export",
    );

  const content = serializeJokerforgeV2(project);
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = `${baseName}.${extension}`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
};
