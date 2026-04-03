import React from "react";
import {
  BracketsCurly,
  WarningCircle,
  ArrowCounterClockwise,
  ArrowsOutLineHorizontal,
  DotsSixVertical,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";

interface LiveCodePanelProps {
  title: string;
  code: string;
  isLoading: boolean;
  statusMessage?: string;
  isError?: boolean;
  widthPercent: number;
  isBlockPreview: boolean;
  onBackToItem: () => void;
  onStartResize: (e: React.MouseEvent<HTMLButtonElement>) => void;
}

const LUA_KEYWORDS = new Set([
  "and",
  "break",
  "do",
  "else",
  "elseif",
  "end",
  "false",
  "for",
  "function",
  "if",
  "in",
  "local",
  "nil",
  "not",
  "or",
  "repeat",
  "return",
  "then",
  "true",
  "until",
  "while",
]);

const LUA_GLOBALS = new Set([
  "SMODS",
  "G",
  "card",
  "context",
  "self",
  "args",
  "math",
  "table",
  "string",
  "pairs",
  "ipairs",
]);

const tokenClassName = (token: string): string => {
  if (token.startsWith("--")) return "text-emerald-300";
  if (/^".*"$|^'.*'$/.test(token)) return "text-amber-200";
  if (/^\d+(?:\.\d+)?$/.test(token)) return "text-fuchsia-300";
  if (LUA_KEYWORDS.has(token)) return "text-sky-300 font-semibold";
  if (LUA_GLOBALS.has(token)) return "text-violet-300";
  if (/^[{}()[\],.:=+-/*<>#]+$/.test(token)) return "text-foreground/70";
  return "text-foreground/90";
};

const LUA_TOKEN_PATTERN =
  /--.*$|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\b\d+(?:\.\d+)?\b|\b[a-zA-Z_][a-zA-Z0-9_]*\b|[{}()[\],.:=+\-/*<>#]+|\s+|./g;

const renderLuaLine = (line: string, lineIndex: number) => {
  const tokens = line.match(LUA_TOKEN_PATTERN) ?? [line];
  return (
    <div key={`code-line-${lineIndex}`} className="contents">
      <span className="select-none text-right pr-4 text-foreground/35 tabular-nums">
        {lineIndex + 1}
      </span>
      <span className="whitespace-pre">
        {tokens.map((token, tokenIndex) => (
          <span
            key={`token-${lineIndex}-${tokenIndex}`}
            className={tokenClassName(token)}
          >
            {token}
          </span>
        ))}
      </span>
    </div>
  );
};

const LiveCodePanel: React.FC<LiveCodePanelProps> = ({
  title,
  code,
  isLoading,
  statusMessage,
  isError = false,
  widthPercent,
  isBlockPreview,
  onBackToItem,
  onStartResize,
}) => {
  const lines = (isLoading ? "Generating snippet..." : code).split("\n");

  return (
    <aside
      className="relative h-full bg-card/40 backdrop-blur-sm border-l border-border"
      style={{ width: `${widthPercent}%` }}
    >
      <div className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 rounded-xl bg-linear-to-b from-background to-background/80 border border-border/70 shadow-lg hover:shadow-xl hover:border-primary/60 cursor-col-resize"
          onMouseDown={onStartResize}
          title="Drag to resize"
        >
          <div className="relative flex items-center justify-center">
            <ArrowsOutLineHorizontal className="h-4 w-4 text-primary/80" />
            <DotsSixVertical className="absolute h-3.5 w-3.5 text-foreground/40" />
          </div>
        </Button>
      </div>

      <div className="h-full flex flex-col">
        <div className="min-h-16 px-4 py-2 border-b border-border/80 flex items-center justify-between gap-3 bg-card/70">
          <div className="flex items-center gap-2 min-w-0">
            <BracketsCurly className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-xs font-bold tracking-widest text-muted-foreground uppercase shrink-0">
              Live Code
            </span>
            <span className="text-xs text-foreground/70 truncate">{title}</span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {isBlockPreview && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs cursor-pointer"
                onClick={onBackToItem}
              >
                <ArrowCounterClockwise className="h-3.5 w-3.5 mr-1" />
                Full Item View
              </Button>
            )}
            <span className="text-[10px] text-muted-foreground w-9 text-right">
              {Math.round(widthPercent)}%
            </span>
          </div>
        </div>

        {statusMessage ? (
          <div
            className={`mx-4 mt-4 rounded-md border px-3 py-2 text-xs flex items-start gap-2 ${
              isError
                ? "border-destructive/40 bg-destructive/10 text-destructive"
                : "border-amber-400/40 bg-amber-400/10 text-amber-200"
            }`}
          >
            <WarningCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{statusMessage}</span>
          </div>
        ) : null}

        <div className="flex-1 p-4 min-h-0">
          <div className="h-full w-full rounded-lg bg-background/90 overflow-auto text-xs leading-relaxed font-mono">
            <div className="grid grid-cols-[3.4rem_1fr] gap-x-0 px-0 py-3 min-w-max">
              {lines.map((line, lineIndex) => renderLuaLine(line, lineIndex))}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default LiveCodePanel;
