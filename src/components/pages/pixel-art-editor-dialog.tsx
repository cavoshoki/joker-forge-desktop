import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowBendUpLeft,
  ArrowBendUpRight,
  Circle,
  DownloadSimple,
  Eraser,
  Eyedropper,
  FlipHorizontal,
  FlipVertical,
  FloppyDiskBack,
  GridFour,
  Image as ImageIcon,
  Keyboard,
  Minus,
  PaintBucket,
  PencilSimple,
  Plus,
  Rectangle,
  ArrowsOutCardinal,
  Trash,
} from "@phosphor-icons/react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeFile } from "@tauri-apps/plugin-fs";
import { downloadDir, join } from "@tauri-apps/api/path";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { GenericDialogColorPicker } from "@/components/ui/generic-dialog-color-picker";
import { PlaceholderPickerDialog } from "@/components/pages/placeholder-picker-dialog";
import {
  PlaceholderCategory,
  PlaceholderEntry,
} from "@/lib/placeholder-assets.ts";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type Tool = "pen" | "eraser" | "fill" | "picker" | "shape";
type ShapeType = "line" | "rect" | "ellipse";

type PixelArtEditorDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemName: string;
  sourceImage?: string;
  onSaveToItem: (imageDataUrl: string) => void;
};

const CANVAS_WIDTH = 71;
const CANVAS_HEIGHT = 95;
const DISPLAY_SCALE = 6;
const MAX_HISTORY = 40;

const BALATRO_PALETTE = [
  "#000000", "#222222", "#666666", "#888888", "#d8d8d8", "#eeeeee", "#efefef", "#ffffff",
  "#fe5f55", "#f83b2f", "#f87d75", "#b44430", "#f06b3f", "#fd682b", "#cb724c", "#ff9a00",
  "#f3b958", "#fda200", "#e29000", "#ffc052", "#eac058", "#fae37e", "#ffff00", "#65efaf",
  "#50846e", "#4bc292", "#56a887", "#4ca893", "#235955", "#b8d8d8", "#00ffff", "#7a9e9f",
  "#374244", "#4f6367", "#5f7377", "#374649", "#13afce", "#708b91", "#cdd9dc", "#9bb6bd",
  "#424e54", "#009dff", "#008ee6", "#bfc7d5", "#4584fa", "#95acff", "#646eb7", "#8389dd",
  "#403995", "#4f31b9", "#a782d1", "#8867a5", "#caa0ef", "#b26cbb", "#c75985", "#f03464",
] as const;

const KEYBINDS = [
  { key: "B / P", action: "Pen tool" },
  { key: "E", action: "Eraser tool" },
  { key: "F", action: "Fill tool" },
  { key: "I / K", action: "Eyedropper tool" },
  { key: "H", action: "Shape tool" },
  { key: "G", action: "Toggle grid" },
  { key: "Alt+Click", action: "Quick pick color (returns to previous tool)" },
  { key: "Ctrl+Z", action: "Undo" },
  { key: "Ctrl+Y / Ctrl+Shift+Z", action: "Redo" },
  { key: "Del / Backspace", action: "Clear canvas" },
  { key: "[ / ]", action: "Decrease / increase brush size" },
  { key: "0 / R", action: "Reset view" },
  { key: "Space+Drag", action: "Pan" },
  { key: "MMB Drag", action: "Pan" },
  { key: "Scroll", action: "Zoom" },
  { key: "Ctrl+Scroll", action: "Brush size" },
];

const normalizeHex = (value: string) => {
  const trimmed = value.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{3}$/.test(trimmed))
    return `#${trimmed.split("").map((c) => `${c}${c}`).join("")}`;
  if (/^[0-9a-f]{6}$/.test(trimmed)) return `#${trimmed}`;
  return "#000000";
};

const hexToRgba = (hex: string, alpha: number) => {
  const n = normalizeHex(hex);
  const r = parseInt(n.slice(1, 3), 16);
  const g = parseInt(n.slice(3, 5), 16);
  const b = parseInt(n.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

const getCtx = (canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D context unavailable");
  return ctx;
};

const toPixel = (
  clientX: number, clientY: number,
  stage: HTMLDivElement, zoom: number, pan: { x: number; y: number },
) => {
  const rect = stage.getBoundingClientRect();
  const worldX = (clientX - rect.left - pan.x) / zoom;
  const worldY = (clientY - rect.top - pan.y) / zoom;
  return {
    x: clamp(Math.floor(worldX / DISPLAY_SCALE), 0, CANVAS_WIDTH - 1),
    y: clamp(Math.floor(worldY / DISPLAY_SCALE), 0, CANVAS_HEIGHT - 1),
  };
};

function TipButton({
  tooltip, side = "bottom", children, ...props
}: React.ComponentProps<typeof Button> & { tooltip: string; side?: "top" | "bottom" | "left" | "right" }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild><Button {...props}>{children}</Button></TooltipTrigger>
      <TooltipContent side={side}>{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function PixelArtEditorDialog({
  open, onOpenChange, itemName, sourceImage, onSaveToItem,
}: PixelArtEditorDialogProps) {
  const bitmapCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const [tool, setTool] = useState<Tool>("pen");
  const [shapeType, setShapeType] = useState<ShapeType>("rect");
  const [shapeFilled, setShapeFilled] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [gridOpacity, setGridOpacity] = useState(8); // percent
  const [penSize, setPenSize] = useState(1);
  const [currentColor, setCurrentColor] = useState("#fe5f55");
  const [recentColors, setRecentColors] = useState<string[]>([]);
  const [zoom, setZoom] = useState(1.3);
  const [pan, setPan] = useState({ x: 20, y: 20 });
  const [isPlaceholderPickerOpen, setIsPlaceholderPickerOpen] = useState(false);
  const [placeholderCategory, setPlaceholderCategory] = useState<PlaceholderCategory>("joker");
  const [showKeybinds, setShowKeybinds] = useState(false);
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);

  const historyRef = useRef<ImageData[]>([]);
  const historyIndexRef = useRef(-1);
  const [historyIndexUi, setHistoryIndexUi] = useState(-1);
  const [historyLengthUi, setHistoryLengthUi] = useState(0);

  // Stable refs so event handlers and imperative functions don't go stale
  const panRef = useRef(pan);
  const zoomRef = useRef(zoom);
  const toolRef = useRef(tool);
  const penSizeRef = useRef(penSize);
  const currentColorRef = useRef(currentColor);
  const showGridRef = useRef(showGrid);
  const gridOpacityRef = useRef(gridOpacity);

  useEffect(() => { panRef.current = pan; }, [pan]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { penSizeRef.current = penSize; }, [penSize]);
  useEffect(() => { currentColorRef.current = currentColor; }, [currentColor]);
  useEffect(() => { showGridRef.current = showGrid; }, [showGrid]);
  useEffect(() => { gridOpacityRef.current = gridOpacity; }, [gridOpacity]);

  const lastHoverPixelRef = useRef<{ x: number; y: number } | null>(null);
  const keyStateRef = useRef({ spaceDown: false });
  const dragStateRef = useRef<{
    drawing: boolean; panning: boolean; pointerId: number | null;
    startX: number; startY: number; lastX: number; lastY: number;
    panOriginX: number; panOriginY: number; snapshot: ImageData | null;
  }>({
    drawing: false, panning: false, pointerId: null,
    startX: 0, startY: 0, lastX: 0, lastY: 0,
    panOriginX: 0, panOriginY: 0, snapshot: null,
  });

  // ── Color management ──────────────────────────────────────────────────────

  const commitColor = useCallback((color: string) => {
    const n = normalizeHex(color);
    if (BALATRO_PALETTE.includes(n as (typeof BALATRO_PALETTE)[number])) return;
    setRecentColors((prev) => [n, ...prev.filter((c) => c !== n)].slice(0, 24));
  }, []);

  // eyedropper — always registers & commits
  const registerColor = useCallback((color: string) => {
    const n = normalizeHex(color);
    setCurrentColor(n);
    if (!BALATRO_PALETTE.includes(n as (typeof BALATRO_PALETTE)[number])) {
      setRecentColors((prev) => [n, ...prev.filter((c) => c !== n)].slice(0, 24));
    }
  }, []);

  // ── Preview & overlay rendering ───────────────────────────────────────────

  const renderGrid = useCallback((ctx: CanvasRenderingContext2D) => {
    const opacity = gridOpacityRef.current / 100;
    ctx.save();
    ctx.strokeStyle = `rgba(255,255,255,${opacity})`;
    ctx.lineWidth = 1;
    for (let x = 0; x <= CANVAS_WIDTH; x++) {
      const px = x * DISPLAY_SCALE + 0.5;
      ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, CANVAS_HEIGHT * DISPLAY_SCALE); ctx.stroke();
    }
    for (let y = 0; y <= CANVAS_HEIGHT; y++) {
      const py = y * DISPLAY_SCALE + 0.5;
      ctx.beginPath(); ctx.moveTo(0, py); ctx.lineTo(CANVAS_WIDTH * DISPLAY_SCALE, py); ctx.stroke();
    }
    ctx.restore();
  }, []);

  const refreshPreview = useCallback(() => {
    const bitmap = bitmapCanvasRef.current;
    const preview = previewCanvasRef.current;
    if (!bitmap || !preview) return;
    const ctx = getCtx(preview);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, preview.width, preview.height);
    ctx.drawImage(bitmap, 0, 0, preview.width, preview.height);
    if (showGridRef.current) renderGrid(ctx);
  }, [renderGrid]);

  // Draw the brush preview onto the overlay canvas — pixel-accurate
  const drawOverlayPreview = useCallback((px: number | null, py: number | null) => {
    const overlay = overlayCanvasRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    if (px === null || py === null) return;

    const t = toolRef.current;
    if (t !== "pen" && t !== "eraser") return;

    const radius = Math.floor(penSizeRef.current / 2);
    ctx.fillStyle = t === "pen"
      ? hexToRgba(currentColorRef.current, 0.65)
      : "rgba(255,255,255,0.25)";

    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) {
          const x = px + dx, y = py + dy;
          if (x >= 0 && x < CANVAS_WIDTH && y >= 0 && y < CANVAS_HEIGHT) {
            ctx.fillRect(x * DISPLAY_SCALE, y * DISPLAY_SCALE, DISPLAY_SCALE, DISPLAY_SCALE);
          }
        }
      }
    }
  }, []);

  // ── Cursor ────────────────────────────────────────────────────────────────

  const updateStageCursor = useCallback(() => {
    const stage = stageRef.current;
    if (!stage) return;
    if (dragStateRef.current.panning) { stage.style.cursor = "grabbing"; return; }
    if (keyStateRef.current.spaceDown) { stage.style.cursor = "grab"; return; }
    const map: Record<Tool, string> = {
      pen: "none",       // overlay canvas acts as cursor
      eraser: "none",    // overlay canvas acts as cursor
      fill: "cell",
      picker: "crosshair",
      shape: "crosshair",
    };
    stage.style.cursor = map[toolRef.current] ?? "crosshair";
  }, []);

  // Redraw overlay immediately when color changes (e.g. palette click while hovering)
  useEffect(() => {
    if (lastHoverPixelRef.current) drawOverlayPreview(lastHoverPixelRef.current.x, lastHoverPixelRef.current.y);
  }, [currentColor, drawOverlayPreview]);

  // ── History ───────────────────────────────────────────────────────────────

  const pushHistory = useCallback(() => {
    const bitmap = bitmapCanvasRef.current;
    if (!bitmap) return;
    const snapshot = getCtx(bitmap).getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const base = historyRef.current.slice(0, historyIndexRef.current + 1);
    base.push(snapshot);
    if (base.length > MAX_HISTORY) base.shift();
    historyRef.current = base;
    historyIndexRef.current = base.length - 1;
    setHistoryLengthUi(base.length);
    setHistoryIndexUi(historyIndexRef.current);
  }, []);

  const restoreHistory = useCallback((index: number) => {
    const bitmap = bitmapCanvasRef.current;
    if (!bitmap) return;
    const snapshot = historyRef.current[index];
    if (!snapshot) return;
    getCtx(bitmap).putImageData(snapshot, 0, 0);
    historyIndexRef.current = index;
    setHistoryIndexUi(index);
    refreshPreview();
  }, [refreshPreview]);

  // ── Drawing primitives ────────────────────────────────────────────────────

  const drawCircle = useCallback((cx: number, cy: number, radius: number, color: string, erase = false) => {
    const bitmap = bitmapCanvasRef.current;
    if (!bitmap) return;
    const ctx = getCtx(bitmap);
    ctx.save();
    if (erase) ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = color;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy <= radius * radius) {
          const x = cx + dx, y = cy + dy;
          if (x >= 0 && x < CANVAS_WIDTH && y >= 0 && y < CANVAS_HEIGHT)
            ctx.fillRect(x, y, 1, 1);
        }
      }
    }
    ctx.restore();
  }, []);

  const drawLine = useCallback((
    x0: number, y0: number, x1: number, y1: number,
    color: string, size: number, erase = false,
  ) => {
    let cx = x0, cy = y0;
    const dx = Math.abs(x1 - x0), sx = x0 < x1 ? 1 : -1;
    const dy = -Math.abs(y1 - y0), sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    const radius = Math.max(0, Math.floor(size / 2));
    while (true) {
      drawCircle(cx, cy, radius, color, erase);
      if (cx === x1 && cy === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; cx += sx; }
      if (e2 <= dx) { err += dx; cy += sy; }
    }
  }, [drawCircle]);

  const floodFill = useCallback((x: number, y: number, color: string) => {
    const bitmap = bitmapCanvasRef.current;
    if (!bitmap) return;
    const ctx = getCtx(bitmap);
    const image = ctx.getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    const data = image.data;
    const idx = (y * CANVAS_WIDTH + x) * 4;
    const start = [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
    const n = normalizeHex(color);
    const target = [parseInt(n.slice(1, 3), 16), parseInt(n.slice(3, 5), 16), parseInt(n.slice(5, 7), 16), 255];
    if (start.every((v, i) => v === target[i])) return;
    const stack: Array<[number, number]> = [[x, y]];
    const matches = (o: number) => data[o] === start[0] && data[o + 1] === start[1] && data[o + 2] === start[2] && data[o + 3] === start[3];
    while (stack.length > 0) {
      const curr = stack.pop()!;
      const [px, py] = curr;
      if (px < 0 || py < 0 || px >= CANVAS_WIDTH || py >= CANVAS_HEIGHT) continue;
      const o = (py * CANVAS_WIDTH + px) * 4;
      if (!matches(o)) continue;
      data[o] = target[0]; data[o + 1] = target[1]; data[o + 2] = target[2]; data[o + 3] = target[3];
      stack.push([px + 1, py], [px - 1, py], [px, py + 1], [px, py - 1]);
    }
    ctx.putImageData(image, 0, 0);
    refreshPreview();
  }, [refreshPreview]);

  const drawShape = useCallback((startX: number, startY: number, endX: number, endY: number, erase = false) => {
    const bitmap = bitmapCanvasRef.current;
    if (!bitmap) return;
    const ctx = getCtx(bitmap);
    const minX = Math.min(startX, endX), minY = Math.min(startY, endY);
    const maxX = Math.max(startX, endX), maxY = Math.max(startY, endY);
    const color = currentColorRef.current;
    const size = penSizeRef.current;
    const type = shapeType;
    const filled = shapeFilled;

    if (type === "line") { drawLine(startX, startY, endX, endY, color, size, erase); return; }
    if (type === "rect") {
      if (filled) {
        ctx.save();
        if (erase) ctx.globalCompositeOperation = "destination-out";
        ctx.fillStyle = color;
        ctx.fillRect(minX, minY, maxX - minX + 1, maxY - minY + 1);
        ctx.restore();
      } else {
        drawLine(minX, minY, maxX, minY, color, size, erase);
        drawLine(maxX, minY, maxX, maxY, color, size, erase);
        drawLine(maxX, maxY, minX, maxY, color, size, erase);
        drawLine(minX, maxY, minX, minY, color, size, erase);
      }
      return;
    }
    const rx = Math.max(1, Math.floor((maxX - minX) / 2));
    const ry = Math.max(1, Math.floor((maxY - minY) / 2));
    const cx = minX + rx, cy = minY + ry;
    ctx.save();
    if (erase) ctx.globalCompositeOperation = "destination-out";
    ctx.fillStyle = color;
    for (let ey = minY; ey <= maxY; ey++) {
      for (let ex = minX; ex <= maxX; ex++) {
        const nx = (ex - cx) / rx, ny = (ey - cy) / ry;
        const v = nx * nx + ny * ny;
        if (filled ? v <= 1 : v >= 0.82 && v <= 1.1) ctx.fillRect(ex, ey, 1, 1);
      }
    }
    ctx.restore();
  }, [drawLine, shapeType, shapeFilled]);

  const pickColorAt = useCallback((x: number, y: number) => {
    const bitmap = bitmapCanvasRef.current;
    if (!bitmap) return;
    const pixel = getCtx(bitmap).getImageData(x, y, 1, 1).data;
    const hex = `#${pixel[0].toString(16).padStart(2, "0")}${pixel[1].toString(16).padStart(2, "0")}${pixel[2].toString(16).padStart(2, "0")}`;
    registerColor(hex);
  }, [registerColor]);

  const applyFlip = useCallback((direction: "horizontal" | "vertical") => {
    const bitmap = bitmapCanvasRef.current;
    if (!bitmap) return;
    const ctx = getCtx(bitmap);
    const target = { x: 0, y: 0, w: CANVAS_WIDTH, h: CANVAS_HEIGHT };
    const source = ctx.getImageData(target.x, target.y, target.w, target.h);
    const temp = document.createElement("canvas");
    temp.width = target.w; temp.height = target.h;
    getCtx(temp).putImageData(source, 0, 0);
    ctx.save();
    ctx.clearRect(target.x, target.y, target.w, target.h);
    if (direction === "horizontal") { ctx.translate(target.w, 0); ctx.scale(-1, 1); }
    else { ctx.translate(0, target.h); ctx.scale(1, -1); }
    ctx.drawImage(temp, 0, 0);
    ctx.restore();
    pushHistory(); refreshPreview();
  }, [pushHistory, refreshPreview]);

  const clearCanvas = useCallback(() => {
    const bitmap = bitmapCanvasRef.current;
    if (!bitmap) return;
    getCtx(bitmap).clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    pushHistory(); refreshPreview();
  }, [pushHistory, refreshPreview]);

  const centerCanvas = useCallback((currentZoom: number) => {
    const stage = stageRef.current;
    if (!stage) return;
    const cw = CANVAS_WIDTH * DISPLAY_SCALE * currentZoom;
    const ch = CANVAS_HEIGHT * DISPLAY_SCALE * currentZoom;
    setPan({ x: (stage.clientWidth - cw) / 2, y: (stage.clientHeight - ch) / 2 });
  }, []);

  const loadImageToCanvas = useCallback(async (src: string) => {
    const bitmap = bitmapCanvasRef.current;
    if (!bitmap) return;
    const ctx = getCtx(bitmap);
    const img = new Image();
    img.crossOrigin = "anonymous";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`Failed to load: ${src}`));
      img.src = src;
    });
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(img, 0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    pushHistory(); refreshPreview();
  }, [pushHistory, refreshPreview]);

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    const rafId = requestAnimationFrame(() => {
      const bitmap = bitmapCanvasRef.current;
      const preview = previewCanvasRef.current;
      const overlay = overlayCanvasRef.current;
      if (!bitmap || !preview || !overlay) return;
      bitmap.width = CANVAS_WIDTH;
      bitmap.height = CANVAS_HEIGHT;
      preview.width = CANVAS_WIDTH * DISPLAY_SCALE;
      preview.height = CANVAS_HEIGHT * DISPLAY_SCALE;
      overlay.width = CANVAS_WIDTH * DISPLAY_SCALE;
      overlay.height = CANVAS_HEIGHT * DISPLAY_SCALE;

      const initialize = async () => {
        setTool("pen"); setShapeType("rect"); setShapeFilled(false);
        historyRef.current = []; historyIndexRef.current = -1;
        setHistoryLengthUi(0); setHistoryIndexUi(-1);
        const initialZoom = 1.3;
        setZoom(initialZoom);
        try { await loadImageToCanvas(sourceImage || "/images/back.png"); }
        catch { await loadImageToCanvas("/images/back.png"); }
        centerCanvas(initialZoom);
      };
      void initialize();
    });
    return () => cancelAnimationFrame(rafId);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard shortcuts ────────────────────────────────────────────────────

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (e.code === "Space") { keyStateRef.current.spaceDown = true; updateStageCursor(); return; }
      if (ctrl && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        if (historyIndexRef.current > 0) restoreHistory(historyIndexRef.current - 1);
        return;
      }
      if (ctrl && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault();
        if (historyIndexRef.current < historyRef.current.length - 1) restoreHistory(historyIndexRef.current + 1);
        return;
      }
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "b" || e.key === "p") { setTool("pen"); toolRef.current = "pen"; updateStageCursor(); }
      if (e.key === "e") { setTool("eraser"); toolRef.current = "eraser"; updateStageCursor(); }
      if (e.key === "f") { setTool("fill"); toolRef.current = "fill"; updateStageCursor(); }
      if (e.key === "i" || e.key === "k") { setTool("picker"); toolRef.current = "picker"; updateStageCursor(); }
      if (e.key === "h") { setTool("shape"); toolRef.current = "shape"; setShapeMenuOpen(true); updateStageCursor(); }
      if (e.key === "g") setShowGrid((prev) => !prev);
      if (e.key === "[") { const n = clamp(penSizeRef.current - 1, 1, 16); penSizeRef.current = n; setPenSize(n); if (lastHoverPixelRef.current) drawOverlayPreview(lastHoverPixelRef.current.x, lastHoverPixelRef.current.y); }
      if (e.key === "]") { const n = clamp(penSizeRef.current + 1, 1, 16); penSizeRef.current = n; setPenSize(n); if (lastHoverPixelRef.current) drawOverlayPreview(lastHoverPixelRef.current.x, lastHoverPixelRef.current.y); }
      if (e.key === "0" || e.key === "r") { const z = 1.3; setZoom(z); centerCanvas(z); }
      if (e.key === "Delete" || e.key === "Backspace") { e.preventDefault(); clearCanvas(); }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") { keyStateRef.current.spaceDown = false; updateStageCursor(); }
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => { window.removeEventListener("keydown", onKeyDown); window.removeEventListener("keyup", onKeyUp); };
  }, [open, restoreHistory, clearCanvas, centerCanvas, updateStageCursor]);

  useEffect(() => { refreshPreview(); }, [refreshPreview]);

  // ── Pointer handlers ──────────────────────────────────────────────────────

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const allowPan = event.button === 1 || keyStateRef.current.spaceDown;
    const drag = dragStateRef.current;
    drag.pointerId = event.pointerId;
    drag.startX = event.clientX; drag.startY = event.clientY;
    drag.lastX = event.clientX; drag.lastY = event.clientY;
    drag.panOriginX = panRef.current.x; drag.panOriginY = panRef.current.y;
    drag.snapshot = bitmapCanvasRef.current
      ? getCtx(bitmapCanvasRef.current).getImageData(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT) : null;

    if (allowPan) {
      drag.panning = true; drag.drawing = false;
      event.currentTarget.setPointerCapture(event.pointerId);
      updateStageCursor(); return;
    }
    if (event.button !== 0) return;

    const { x, y } = toPixel(event.clientX, event.clientY, stage, zoomRef.current, panRef.current);

    // Alt+click: quick eyedropper then return to previous tool
    if (event.altKey) {
      pickColorAt(x, y);
      drag.drawing = false; drag.pointerId = null;
      return;
    }

    drag.drawing = true; drag.panning = false;
    event.currentTarget.setPointerCapture(event.pointerId);

    const t = toolRef.current;
    if (t === "picker") { pickColorAt(x, y); drag.drawing = false; return; }
    if (t === "fill") {
      commitColor(currentColorRef.current);
      floodFill(x, y, currentColorRef.current);
      pushHistory(); drag.drawing = false; return;
    }
    if (t === "pen") {
      commitColor(currentColorRef.current);
      drawCircle(x, y, Math.floor(penSizeRef.current / 2), currentColorRef.current, false);
      refreshPreview(); return;
    }
    if (t === "eraser") {
      drawCircle(x, y, Math.floor(penSizeRef.current / 2), currentColorRef.current, true);
      refreshPreview(); return;
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const drag = dragStateRef.current;

    const hp = toPixel(event.clientX, event.clientY, stage, zoomRef.current, panRef.current);
    lastHoverPixelRef.current = hp;
    drawOverlayPreview(hp.x, hp.y);

    if (drag.pointerId !== event.pointerId) return;
    if (drag.panning) {
      setPan({ x: drag.panOriginX + event.clientX - drag.startX, y: drag.panOriginY + event.clientY - drag.startY });
      return;
    }
    if (!drag.drawing) return;

    const { x, y } = hp;
    const last = toPixel(drag.lastX, drag.lastY, stage, zoomRef.current, panRef.current);
    const t = toolRef.current;

    if (t === "pen") {
      drawLine(last.x, last.y, x, y, currentColorRef.current, penSizeRef.current, false);
      drag.lastX = event.clientX; drag.lastY = event.clientY;
      refreshPreview(); return;
    }
    if (t === "eraser") {
      drawLine(last.x, last.y, x, y, currentColorRef.current, penSizeRef.current, true);
      drag.lastX = event.clientX; drag.lastY = event.clientY;
      refreshPreview(); return;
    }
    if (t === "shape") {
      const start = toPixel(drag.startX, drag.startY, stage, zoomRef.current, panRef.current);
      const bitmap = bitmapCanvasRef.current;
      if (bitmap && drag.snapshot) getCtx(bitmap).putImageData(drag.snapshot, 0, 0);
      drawShape(start.x, start.y, x, y);
      refreshPreview();
    }
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const stage = stageRef.current;
    if (!stage) return;
    const drag = dragStateRef.current;
    if (drag.pointerId !== event.pointerId) return;
    if (drag.panning) {
      drag.panning = false; drag.pointerId = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
      updateStageCursor(); return;
    }
    if (!drag.drawing) {
      drag.pointerId = null;
      event.currentTarget.releasePointerCapture(event.pointerId); return;
    }
    const { x, y } = toPixel(event.clientX, event.clientY, stage, zoomRef.current, panRef.current);
    const t = toolRef.current;
    if (t === "shape") {
      const bitmap = bitmapCanvasRef.current;
      if (bitmap && drag.snapshot) getCtx(bitmap).putImageData(drag.snapshot, 0, 0);
      const start = toPixel(drag.startX, drag.startY, stage, zoomRef.current, panRef.current);
      commitColor(currentColorRef.current);
      drawShape(start.x, start.y, x, y);
      refreshPreview();
    }
    if (t === "pen" || t === "eraser" || t === "shape") pushHistory();
    drag.drawing = false; drag.pointerId = null; drag.snapshot = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const handlePointerLeave = () => { lastHoverPixelRef.current = null; drawOverlayPreview(null, null); };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (event.ctrlKey) {
      event.preventDefault();
      const next = clamp(penSizeRef.current + (event.deltaY > 0 ? -1 : 1), 1, 16);
      penSizeRef.current = next;
      setPenSize(next);
      if (lastHoverPixelRef.current) drawOverlayPreview(lastHoverPixelRef.current.x, lastHoverPixelRef.current.y);
      return;
    }
    event.preventDefault();
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const mx = event.clientX - rect.left, my = event.clientY - rect.top;
    const nextZoom = clamp(zoomRef.current + (event.deltaY > 0 ? -0.1 : 0.1), 0.5, 8);
    const worldX = (mx - panRef.current.x) / zoomRef.current;
    const worldY = (my - panRef.current.y) / zoomRef.current;
    setZoom(nextZoom);
    setPan({ x: mx - worldX * nextZoom, y: my - worldY * nextZoom });
  };

  // ── Save ──────────────────────────────────────────────────────────────────

  const handleSaveToItem = () => {
    const bitmap = bitmapCanvasRef.current;
    if (!bitmap) return;
    onSaveToItem(bitmap.toDataURL("image/png"));
    onOpenChange(false);
  };

  const handleSaveToDevice = async () => {
    const bitmap = bitmapCanvasRef.current;
    if (!bitmap) return;
    const filename = `${itemName.replace(/[^a-z0-9]/gi, "_")}_pixel.png`;
    const dataUrl = bitmap.toDataURL("image/png");
    try {
      try {
        const target = await save({
          title: "Save Pixel Art",
          defaultPath: await join(await downloadDir(), filename),
          filters: [{ name: "PNG Image", extensions: ["png"] }],
        });
        if (!target || typeof target !== "string") return;
        const finalPath = target.toLowerCase().endsWith(".png") ? target : `${target}.png`;
        await writeFile(finalPath, new Uint8Array(await (await fetch(dataUrl)).arrayBuffer()));
      } catch {
        const link = document.createElement("a");
        link.download = filename; link.href = dataUrl; link.click();
      }
    } catch (error) {
      console.error("Failed to save pixel image:", error);
      window.alert("Failed to save image. Please try again.");
    }
  };

  // ── Derived data ──────────────────────────────────────────────────────────

  const mergedPalette = useMemo(() => {
    const base: string[] = [...BALATRO_PALETTE];
    for (const c of recentColors) if (!base.includes(c)) base.unshift(c);
    return Array.from(new Set(base));
  }, [recentColors]);

  const paletteRows = useMemo(() => {
    const rows: string[][] = [];
    for (let i = 0; i < mergedPalette.length; i += 7) rows.push(mergedPalette.slice(i, i + 7));
    return rows;
  }, [mergedPalette]);

  const SHAPE_OPTIONS: { key: ShapeType; label: string; icon: typeof Rectangle }[] = [
    { key: "line", label: "Line", icon: PencilSimple },
    { key: "rect", label: "Rectangle", icon: Rectangle },
    { key: "ellipse", label: "Ellipse", icon: Circle },
  ];

  const TOOLS: { key: Tool; label: string; shortcut: string; icon: typeof PencilSimple }[] = [
    { key: "pen", label: "Pen", shortcut: "B", icon: PencilSimple },
    { key: "eraser", label: "Eraser", shortcut: "E", icon: Eraser },
    { key: "fill", label: "Fill", shortcut: "F", icon: PaintBucket },
    { key: "picker", label: "Eyedropper", shortcut: "I", icon: Eyedropper },
  ];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="h-[80vh] w-[70vw]! max-w-none! overflow-hidden border-border/60 bg-card p-0"
          onInteractOutside={(event) => event.preventDefault()}
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Pixel Art Editor</DialogTitle>
            <DialogDescription>Edit a 71×95 pixel sprite.</DialogDescription>
          </DialogHeader>

          <div className="flex h-full flex-col">
            {/* ── Header ── */}
            <div className="flex items-center gap-2 border-b border-border/40 px-3 py-2 pr-12">
              <span className="shrink-0 text-sm font-semibold text-foreground">Pixel Art Editor</span>

              <div className="mx-1 h-4 w-px shrink-0 bg-border/50" />

              {/* Brush size */}
              <div className="flex items-center gap-1.5">
                <span className="shrink-0 text-xs text-muted-foreground">Brush</span>
                <TipButton tooltip="Decrease ([)" variant="outline" size="icon-sm" className="cursor-pointer"
                  onClick={() => { const n = clamp(penSizeRef.current - 1, 1, 16); penSizeRef.current = n; setPenSize(n); if (lastHoverPixelRef.current) drawOverlayPreview(lastHoverPixelRef.current.x, lastHoverPixelRef.current.y); }}>
                  <Minus className="h-3 w-3" />
                </TipButton>
                <span className="w-7 text-center text-xs font-semibold tabular-nums">{penSize}px</span>
                <TipButton tooltip="Increase (])" variant="outline" size="icon-sm" className="cursor-pointer"
                  onClick={() => { const n = clamp(penSizeRef.current + 1, 1, 16); penSizeRef.current = n; setPenSize(n); if (lastHoverPixelRef.current) drawOverlayPreview(lastHoverPixelRef.current.x, lastHoverPixelRef.current.y); }}>
                  <Plus className="h-3 w-3" />
                </TipButton>
              </div>

              <div className="mx-1 h-4 w-px shrink-0 bg-border/50" />

              {/* Zoom */}
              <div className="flex items-center gap-1">
                <TipButton tooltip="Zoom out" variant="outline" size="icon-sm" className="cursor-pointer"
                  onClick={() => setZoom((p) => clamp(p - 0.1, 0.5, 8))}>
                  <Minus className="h-3 w-3" />
                </TipButton>
                <span className="w-12 text-center text-xs font-semibold tabular-nums">{Math.round(zoom * 100)}%</span>
                <TipButton tooltip="Zoom in" variant="outline" size="icon-sm" className="cursor-pointer"
                  onClick={() => setZoom((p) => clamp(p + 0.1, 0.5, 8))}>
                  <Plus className="h-3 w-3" />
                </TipButton>
              </div>

              {/* Grid opacity */}
              <div className="flex items-center gap-1.5">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      className="cursor-pointer"
                      onClick={() => setShowGrid((p) => !p)}
                    >
                      <GridFour className={cn("h-3.5 w-3.5", showGrid ? "text-foreground" : "text-muted-foreground/40")} />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent>{showGrid ? "Hide grid (G)" : "Show grid (G)"}</TooltipContent>
                </Tooltip>
                {showGrid && (
                  <input
                    type="range" min={2} max={30} step={1} value={gridOpacity}
                    onChange={(e) => { setGridOpacity(Number(e.target.value)); refreshPreview(); }}
                    className="w-16 cursor-pointer accent-foreground"
                    title="Grid opacity"
                  />
                )}
              </div>

              {/* Shape options in header when active */}
              {tool === "shape" && (
                <>
                  <div className="mx-1 h-4 w-px shrink-0 bg-border/50" />
                  <div className="flex items-center gap-1">
                    {SHAPE_OPTIONS.map(({ key, label, icon: Icon }) => (
                      <TipButton key={key} tooltip={label}
                        variant={shapeType === key ? "default" : "outline"} size="icon-sm" className="cursor-pointer"
                        onClick={() => setShapeType(key)}>
                        <Icon className="h-3.5 w-3.5" weight={shapeType === key ? "fill" : "regular"} />
                      </TipButton>
                    ))}
                  </div>
                  <TipButton tooltip={shapeFilled ? "Switch to outline" : "Switch to filled"}
                    variant={shapeFilled ? "default" : "outline"} size="sm" className="cursor-pointer text-xs"
                    onClick={() => setShapeFilled((p) => !p)}>
                    {shapeFilled ? "Filled" : "Outline"}
                  </TipButton>
                </>
              )}

              <div className="flex-1" />

              {/* Action icons */}
              <div className="flex items-center gap-1">
                <TipButton tooltip="Alt+Click canvas to pick color" variant="outline" size="icon-sm" className="cursor-pointer"
                  onClick={() => { setTool("picker"); toolRef.current = "picker"; updateStageCursor(); }}>
                  <Eyedropper className="h-3.5 w-3.5" />
                </TipButton>

                <div className="mx-0.5 h-4 w-px bg-border/50" />

                <TipButton tooltip="Flip horizontal" variant="outline" size="icon-sm" className="cursor-pointer"
                  onClick={() => applyFlip("horizontal")}>
                  <FlipHorizontal className="h-3.5 w-3.5" />
                </TipButton>
                <TipButton tooltip="Flip vertical" variant="outline" size="icon-sm" className="cursor-pointer"
                  onClick={() => applyFlip("vertical")}>
                  <FlipVertical className="h-3.5 w-3.5" />
                </TipButton>

                <div className="mx-0.5 h-4 w-px bg-border/50" />

                <TipButton tooltip="Reset view (0)" variant="outline" size="icon-sm" className="cursor-pointer"
                  onClick={() => { const z = 1.3; setZoom(z); centerCanvas(z); }}>
                  <ArrowsOutCardinal className="h-3.5 w-3.5" />
                </TipButton>
                <TipButton tooltip="Clear canvas (Del)" variant="outline" size="icon-sm" className="cursor-pointer"
                  onClick={clearCanvas}>
                  <Trash className="h-3.5 w-3.5" />
                </TipButton>

                <div className="mx-0.5 h-4 w-px bg-border/50" />

                <TipButton tooltip="Load back.png" variant="outline" size="icon-sm" className="cursor-pointer"
                  onClick={() => void loadImageToCanvas("/images/back.png")}>
                  <ImageIcon className="h-3.5 w-3.5" />
                </TipButton>
                <TipButton tooltip="Choose placeholder" variant="outline" size="icon-sm" className="cursor-pointer"
                  onClick={() => setIsPlaceholderPickerOpen(true)}>
                  <ImageIcon className="h-3.5 w-3.5" weight="duotone" />
                </TipButton>

                <div className="mx-0.5 h-4 w-px bg-border/50" />

                <TipButton tooltip="Keyboard shortcuts" variant="outline" size="icon-sm" className="cursor-pointer"
                  onClick={() => setShowKeybinds(true)}>
                  <Keyboard className="h-3.5 w-3.5" />
                </TipButton>
              </div>

              <div className="mx-1 h-4 w-px shrink-0 bg-border/50" />

              {/* Undo / Redo */}
              <div className="flex items-center gap-1">
                <TipButton tooltip="Undo (Ctrl+Z)" variant="secondary" size="icon-sm" className="cursor-pointer"
                  onClick={() => historyIndexRef.current > 0 && restoreHistory(historyIndexRef.current - 1)}
                  disabled={historyIndexUi <= 0}>
                  <ArrowBendUpLeft className="h-3.5 w-3.5" weight="bold" />
                </TipButton>
                <TipButton tooltip="Redo (Ctrl+Y)" variant="secondary" size="icon-sm" className="cursor-pointer"
                  onClick={() => historyIndexRef.current < historyRef.current.length - 1 && restoreHistory(historyIndexRef.current + 1)}
                  disabled={historyIndexUi >= historyLengthUi - 1}>
                  <ArrowBendUpRight className="h-3.5 w-3.5" weight="bold" />
                </TipButton>
              </div>

              <div className="mx-1 h-4 w-px shrink-0 bg-border/50" />

              <Button variant="secondary" size="sm" className="cursor-pointer" onClick={handleSaveToDevice}>
                <DownloadSimple weight="bold" /> Save Image
              </Button>
              <Button variant="default" size="sm" className="cursor-pointer" onClick={handleSaveToItem}>
                <FloppyDiskBack weight="bold" /> Save To Item
              </Button>
            </div>

            <div className="flex min-h-0 flex-1">
              {/* ── Left column: tools (Photoshop-style) ── */}
              <aside className="flex w-12 shrink-0 flex-col items-center gap-1.5 border-r border-border/40 bg-card py-2.5">
                {TOOLS.map(({ key, label, shortcut, icon: Icon }) => {
                  const active = tool === key;
                  return (
                    <Tooltip key={key}>
                      <TooltipTrigger asChild>
                        <Button
                          variant={active ? "default" : "ghost"}
                          size="icon"
                          className="h-8 w-8 cursor-pointer"
                          onClick={() => { setTool(key); toolRef.current = key; updateStageCursor(); }}
                        >
                          <Icon className="h-4 w-4" weight={active ? "fill" : "regular"} />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="right">{label} ({shortcut})</TooltipContent>
                    </Tooltip>
                  );
                })}

                {/* Shape tool with submenu */}
                <Popover open={shapeMenuOpen} onOpenChange={setShapeMenuOpen}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <PopoverTrigger asChild>
                        <Button
                          variant={tool === "shape" ? "default" : "ghost"}
                          size="icon"
                          className="h-8 w-8 cursor-pointer"
                          onClick={() => { setTool("shape"); toolRef.current = "shape"; setShapeMenuOpen(true); updateStageCursor(); }}
                        >
                          {(() => {
                            const ActiveIcon = SHAPE_OPTIONS.find(s => s.key === shapeType)?.icon ?? Rectangle;
                            return <ActiveIcon className="h-4 w-4" weight={tool === "shape" ? "fill" : "regular"} />;
                          })()}
                        </Button>
                      </PopoverTrigger>
                    </TooltipTrigger>
                    <TooltipContent side="right">Shape (H)</TooltipContent>
                  </Tooltip>
                  <PopoverContent side="right" className="w-36 p-1.5" sideOffset={8}>
                    <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Shape</p>
                    <div className="flex flex-col gap-1">
                      {SHAPE_OPTIONS.map(({ key, label, icon: Icon }) => (
                        <Button key={key} variant={shapeType === key ? "default" : "ghost"} size="sm"
                          className="h-7 w-full cursor-pointer justify-start gap-2 text-xs"
                          onClick={() => { setShapeType(key); setShapeMenuOpen(false); }}>
                          <Icon className="h-3.5 w-3.5" weight={shapeType === key ? "fill" : "regular"} />
                          {label}
                        </Button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

                {/* Current color swatch */}
                <div className="mt-auto px-1">
                  <div
                    className="h-7 w-7 rounded-md border border-white/20 shadow-inner"
                    style={{ backgroundColor: currentColor }}
                    title={currentColor}
                  />
                </div>
              </aside>

              {/* ── Canvas area ── */}
              <main className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 overflow-hidden p-4">
                  <div
                    ref={stageRef}
                    className="relative h-full w-full overflow-hidden rounded-xl bg-background"
                    onContextMenu={(e) => e.preventDefault()}
                    onWheel={handleWheel}
                    onPointerDown={handlePointerDown}
                    onPointerMove={handlePointerMove}
                    onPointerUp={handlePointerUp}
                    onPointerCancel={handlePointerUp}
                    onPointerLeave={handlePointerLeave}
                  >
                    <div
                      style={{
                        position: "absolute",
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                        transformOrigin: "top left",
                        width: CANVAS_WIDTH * DISPLAY_SCALE,
                        height: CANVAS_HEIGHT * DISPLAY_SCALE,
                        backgroundImage: "repeating-conic-gradient(#1c1f2e 0% 25%, #13162a 0% 50%)",
                        backgroundSize: "12px 12px",
                      }}
                    >
                      <canvas
                        ref={previewCanvasRef}
                        className="pointer-events-none absolute inset-0 select-none"
                        style={{ width: CANVAS_WIDTH * DISPLAY_SCALE, height: CANVAS_HEIGHT * DISPLAY_SCALE, imageRendering: "pixelated" }}
                      />
                      <canvas
                        ref={overlayCanvasRef}
                        className="pointer-events-none absolute inset-0 select-none"
                        style={{ width: CANVAS_WIDTH * DISPLAY_SCALE, height: CANVAS_HEIGHT * DISPLAY_SCALE, imageRendering: "pixelated" }}
                      />
                    </div>
                  </div>
                </div>
              </main>

              {/* ── Right sidebar: palette + color picker ── */}
              <aside className="flex w-60 shrink-0 flex-col border-l border-border/40 bg-card">
                {/* Palette */}
                <div className="flex-1 overflow-y-auto p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Palette</span>
                    {recentColors.length > 0 && (
                      <span className="text-[10px] text-muted-foreground">+{recentColors.length}</span>
                    )}
                  </div>
                  <div className="space-y-1">
                    {paletteRows.map((row, idx) => (
                      <div key={idx} className="flex gap-1.5">
                        {row.map((hex) => (
                          <Tooltip key={hex}>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                onClick={() => setCurrentColor(hex)}
                                className={cn(
                                  "h-7 w-7 cursor-pointer rounded-md border transition-all hover:scale-110 hover:shadow-md",
                                  currentColor.toLowerCase() === hex
                                    ? "border-white ring-1 ring-white/60 scale-110"
                                    : "border-black/20",
                                )}
                                style={{ backgroundColor: hex }}
                              />
                            </TooltipTrigger>
                            <TooltipContent>{hex}</TooltipContent>
                          </Tooltip>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Color picker */}
                <div className="border-t border-border/40 p-3">
                  <GenericDialogColorPicker
                    value={currentColor}
                    onChange={(next) => setCurrentColor(normalizeHex(next))}
                    defaultColor="#fe5f55"
                    valueMode="with-hash"
                    placeholder="#FE5F55"
                  />
                </div>
              </aside>
            </div>
          </div>

          <canvas ref={bitmapCanvasRef} className="hidden" aria-hidden="true" />
        </DialogContent>
      </Dialog>

      {/* Keybinds dialog */}
      <Dialog open={showKeybinds} onOpenChange={setShowKeybinds}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Keyboard Shortcuts</DialogTitle>
            <DialogDescription>All shortcuts for the pixel art editor.</DialogDescription>
          </DialogHeader>
          <div className="mt-1 space-y-0.5">
            {KEYBINDS.map(({ key, action }) => (
              <div key={key} className="flex items-center justify-between gap-4 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40">
                <span className="text-muted-foreground">{action}</span>
                <kbd className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{key}</kbd>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <PlaceholderPickerDialog
        open={isPlaceholderPickerOpen}
        onOpenChange={setIsPlaceholderPickerOpen}
        initialCategory={placeholderCategory}
        onSelect={(entry: PlaceholderEntry) => {
          setPlaceholderCategory(entry.category);
          void loadImageToCanvas(entry.src);
        }}
      />
    </>
  );
}
