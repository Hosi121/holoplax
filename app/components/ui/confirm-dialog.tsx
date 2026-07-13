"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";
import type { ReactElement } from "react";

export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel = "実行する",
  cancelLabel = "キャンセル",
  onConfirm,
}: {
  trigger: ReactElement;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => unknown | Promise<unknown>;
}) {
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger render={trigger} />
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-40 bg-slate-950/45" />
        <AlertDialog.Viewport className="fixed inset-0 z-50 flex items-center justify-center p-4 [padding-bottom:max(1rem,env(safe-area-inset-bottom))] [padding-top:max(1rem,env(safe-area-inset-top))]">
          <AlertDialog.Popup className="w-full max-w-md border border-[var(--border)] bg-[var(--surface)] p-6 text-[var(--text-primary)] shadow-xl outline-none">
            <AlertDialog.Title className="text-balance text-lg font-semibold">
              {title}
            </AlertDialog.Title>
            <AlertDialog.Description className="mt-2 text-pretty text-sm text-[var(--text-secondary)]">
              {description}
            </AlertDialog.Description>
            <div className="mt-6 flex justify-end gap-2">
              <AlertDialog.Close className="border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--text-secondary)]">
                {cancelLabel}
              </AlertDialog.Close>
              <AlertDialog.Close
                onClick={() => void onConfirm()}
                className="border border-rose-700 bg-rose-700 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-800"
              >
                {confirmLabel}
              </AlertDialog.Close>
            </div>
          </AlertDialog.Popup>
        </AlertDialog.Viewport>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
