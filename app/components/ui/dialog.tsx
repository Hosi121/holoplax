"use client";

import { Dialog } from "@base-ui/react/dialog";
import { X } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../../lib/cn";

export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-slate-950/45" />
        <Dialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center p-4 [padding-bottom:max(1rem,env(safe-area-inset-bottom))] [padding-top:max(1rem,env(safe-area-inset-top))]">
          <Dialog.Popup
            className={cn(
              "max-h-full w-full max-w-lg overflow-y-auto border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--text-primary)] shadow-xl outline-none",
              className,
            )}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <Dialog.Title className="text-balance text-lg font-semibold">{title}</Dialog.Title>
                {description ? (
                  <Dialog.Description className="mt-1 text-pretty text-sm text-[var(--text-muted)]">
                    {description}
                  </Dialog.Description>
                ) : null}
              </div>
              <Dialog.Close
                className="flex size-9 shrink-0 items-center justify-center border border-[var(--border)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                aria-label="閉じる"
              >
                <X size={16} />
              </Dialog.Close>
            </div>
            <div className="mt-4">{children}</div>
            {footer ? <div className="mt-6 flex justify-end gap-2">{footer}</div> : null}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
