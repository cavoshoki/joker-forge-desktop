import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle,
  Confetti,
  Copy,
  FolderOpen,
  Sparkle,
} from "@phosphor-icons/react";
import { openPath } from "@tauri-apps/plugin-opener";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface ExportSuccessDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modFolderPath: string;
  fileCount: number;
}

export function ExportSuccessDialog({
  open,
  onOpenChange,
  modFolderPath,
  fileCount,
}: ExportSuccessDialogProps) {
  const [copied, setCopied] = useState(false);
  const [openFolderError, setOpenFolderError] = useState<string | null>(null);

  const sparkleDots = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        id: i,
        left: 6 + i * 6.4,
        top: i % 2 === 0 ? 16 : 74,
        delay: i * 0.06,
      })),
    [],
  );

  const confettiPieces = useMemo(
    () =>
      Array.from({ length: 16 }, (_, i) => ({
        id: i,
        left: 6 + i * 5.9,
        delay: i * 0.035,
        rotate: i % 2 === 0 ? -20 : 24,
      })),
    [],
  );

  useEffect(() => {
    if (!open) {
      setCopied(false);
      setOpenFolderError(null);
    }
  }, [open]);

  const handleCopyPath = async () => {
    try {
      if (!modFolderPath) return;
      await navigator.clipboard.writeText(modFolderPath);
      setCopied(true);
      setOpenFolderError(null);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
      setOpenFolderError("Could not copy path to clipboard.");
    }
  };

  const handleOpenFolder = async () => {
    try {
      if (!modFolderPath) return;
      await openPath(modFolderPath);
      setOpenFolderError(null);
    } catch {
      setOpenFolderError("Could not open the folder. Try Copy Path instead.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden border-2 border-primary/30 bg-card p-0 sm:max-w-xl">
        <div className="relative">
          <motion.div
            initial={{ opacity: 0.5, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45 }}
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,hsl(var(--primary)/0.20),transparent_40%),radial-gradient(circle_at_85%_40%,hsl(var(--accent)/0.25),transparent_50%)]"
          />

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.22, 0.08] }}
            transition={{ duration: 1.2, times: [0, 0.45, 1] }}
            className="pointer-events-none absolute inset-0 bg-[conic-gradient(from_180deg_at_50%_50%,hsl(var(--primary)/0.18),transparent_25%,hsl(var(--accent)/0.18),transparent_55%,hsl(var(--primary)/0.14))]"
          />

          <div className="relative border-b border-border/70 p-6">
            {sparkleDots.map((dot) => (
              <motion.div
                key={dot.id}
                className="pointer-events-none absolute h-1.5 w-1.5 rounded-full bg-primary/70"
                style={{ left: `${dot.left}%`, top: `${dot.top}%` }}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: [0, 1, 0.45], y: [8, -4, 2] }}
                transition={{
                  duration: 1.4,
                  repeat: Number.POSITIVE_INFINITY,
                  repeatType: "mirror",
                  delay: dot.delay,
                }}
              />
            ))}

            {confettiPieces.map((piece) => (
              <motion.div
                key={`confetti-${piece.id}`}
                className="pointer-events-none absolute top-1 h-2.5 w-1 rounded-full bg-linear-to-b from-primary to-accent/70"
                style={{ left: `${piece.left}%` }}
                initial={{ opacity: 0, y: -16, rotate: piece.rotate }}
                animate={{
                  opacity: [0, 1, 0],
                  y: [-16, 4, 20],
                  rotate: [piece.rotate, piece.rotate + 12, piece.rotate + 28],
                }}
                transition={{
                  duration: 1.1,
                  repeat: Number.POSITIVE_INFINITY,
                  repeatDelay: 1.2,
                  delay: piece.delay,
                }}
              />
            ))}

            <DialogHeader className="space-y-3 text-left">
              <div className="flex items-center gap-3">
                <motion.div
                  initial={{ scale: 0.8, rotate: -8 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 240, damping: 16 }}
                  className="relative inline-flex h-12 w-12 items-center justify-center rounded-xl border border-primary/40 bg-primary/15"
                >
                  <CheckCircle className="h-7 w-7 text-primary" weight="fill" />
                  <Sparkle
                    className="absolute -right-1 -top-1 h-4 w-4 text-primary"
                    weight="fill"
                  />
                </motion.div>
                <div>
                  <div className="flex items-center gap-2">
                    <DialogTitle className="text-2xl font-black tracking-tight text-foreground">
                      Mod Exported
                    </DialogTitle>
                    <motion.div
                      initial={{ scale: 0.8, opacity: 0 }}
                      animate={{ scale: [0.85, 1.05, 1], opacity: [0, 1, 1] }}
                      transition={{ duration: 0.55, delay: 0.1 }}
                    >
                      <Confetti
                        className="h-5 w-5 text-primary"
                        weight="fill"
                      />
                    </motion.div>
                  </div>
                  <DialogDescription className="text-sm text-muted-foreground">
                    Folder export complete. Your mod is ready to test.
                  </DialogDescription>
                </div>
              </div>
            </DialogHeader>
          </div>

          <div className="space-y-4 p-6">
            <div className="rounded-xl border border-border bg-background/70 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Export Location
              </div>
              <div className="mt-2 break-all font-mono text-xs text-foreground">
                {modFolderPath}
              </div>
            </div>

            <div className="rounded-xl border border-border bg-background/70 p-4">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Summary
              </div>
              <div className="mt-2 text-sm text-foreground">
                Wrote {fileCount} files to your mod folder.
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-border/70 bg-card/80 p-4 sm:justify-between">
            <div className="flex w-full gap-2 sm:w-auto">
              <Button
                variant="outline"
                className="cursor-pointer"
                type="button"
                onClick={handleCopyPath}
              >
                <Copy className="mr-2 h-4 w-4" />
                {copied ? "Copied" : "Copy Path"}
              </Button>
              <Button
                variant="secondary"
                className="cursor-pointer"
                type="button"
                onClick={handleOpenFolder}
              >
                <FolderOpen className="mr-2 h-4 w-4" />
                Open Folder
              </Button>
            </div>
            <Button
              className="cursor-pointer"
              type="button"
              onClick={() => onOpenChange(false)}
            >
              Nice
            </Button>
          </DialogFooter>

          {openFolderError ? (
            <div className="px-6 pb-5 text-xs text-destructive">
              {openFolderError}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
