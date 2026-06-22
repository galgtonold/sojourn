"use client";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useT } from "@/components/i18n";
import { cn } from "@/lib/utils";

export type ConfirmOptions = {
  message: ReactNode;
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Style the confirm button as destructive (red). */
  danger?: boolean;
  /** Informational notice — a single OK button, no cancel (replaces alert). */
  notice?: boolean;
};

type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

const ConfirmCtx = createContext<ConfirmFn | null>(null);

/** Promise-based confirm() replacement — see ConfirmProvider. */
export function useConfirm(): ConfirmFn {
  const fn = useContext(ConfirmCtx);
  if (!fn) throw new Error("useConfirm must be used within ConfirmProvider");
  return fn;
}

/**
 * App-level provider exposing a custom, on-brand confirmation dialog via
 * `useConfirm()` — a drop-in, awaitable replacement for `window.confirm`.
 * Escape / backdrop click cancels; Enter confirms.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((v: boolean) => void) | null>(null);

  const confirm = useCallback<ConfirmFn>((next) => {
    setOpts(next);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = useCallback((result: boolean) => {
    resolver.current?.(result);
    resolver.current = null;
    setOpts(null);
  }, []);

  useEffect(() => {
    if (!opts) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        settle(false);
      } else if (e.key === "Enter") {
        e.preventDefault();
        settle(true);
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [opts, settle]);

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {opts && (
        <div
          className="fixed inset-0 z-[100] grid place-items-center bg-ink-950/70 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          onClick={() => settle(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-ink-900 p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {opts.title && (
              <h2 className="font-display text-lg font-semibold text-sand-50">
                {opts.title}
              </h2>
            )}
            <div
              className={cn(
                "text-sm leading-relaxed text-sand-100/80",
                opts.title && "mt-1.5",
              )}
            >
              {opts.message}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              {!opts.notice && (
                <button
                  onClick={() => settle(false)}
                  className="rounded-full px-4 py-2 text-sm text-sand-100/70 transition hover:bg-white/5 hover:text-sand-50"
                >
                  {opts.cancelLabel ?? t("common.cancel")}
                </button>
              )}
              <button
                autoFocus
                onClick={() => settle(true)}
                className={cn(
                  "rounded-full px-4 py-2 text-sm font-semibold transition",
                  opts.danger
                    ? "bg-red-500/90 text-white hover:bg-red-500"
                    : "bg-ember-500 text-ink-950 hover:bg-ember-400",
                )}
              >
                {opts.confirmLabel ??
                  (opts.notice ? t("common.ok") : t("common.confirm"))}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}
