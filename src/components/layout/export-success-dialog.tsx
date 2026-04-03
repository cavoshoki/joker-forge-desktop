import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { CheckCircle, Copy, FolderOpen, Sparkle } from "@phosphor-icons/react";
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

  const sparkleDots = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => ({
        id: i,
        left: 10 + i * 8,
        top: i % 2 === 0 ? 16 : 74,
        delay: i * 0.06,
      })),
    [],
  );

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(modFolderPath);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  const handleOpenFolder = async () => {
    await openPath(modFolderPath);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="overflow-hidden border-2 border-primary/30 bg-card p-0 sm:max-w-xl">
        <div className="relative">
          <motion.div
            initial={{ opacity: 0.5, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45 }}
            className="absolute inset-0 bg-[radial-gradient(circle_at_10%_10%,hsl(var(--primary)/0.20),transparent_40%),radial-gradient(circle_at_85%_40%,hsl(var(--accent)/0.25),transparent_50%)]"
          />

          <div className="relative border-b border-border/70 p-6">
            {sparkleDots.map((dot) => (
              <motion.div
                key={dot.id}
                className="absolute h-1.5 w-1.5 rounded-full bg-primary/70"
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
                  <DialogTitle className="text-2xl font-black tracking-tight text-foreground">
                    Mod Exported
                  </DialogTitle>
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
                onClick={handleCopyPath}
              >
                <Copy className="mr-2 h-4 w-4" />
                {copied ? "Copied" : "Copy Path"}
              </Button>
              <Button
                variant="secondary"
                className="cursor-pointer"
                onClick={handleOpenFolder}
              >
                <FolderOpen className="mr-2 h-4 w-4" />
                Open Folder
              </Button>
            </div>
            <Button
              className="cursor-pointer"
              onClick={() => onOpenChange(false)}
            >
              Nice
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
