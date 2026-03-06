"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

type ToastKind = "success" | "error" | "info";

type ToastItem = {
  id: string;
  message: string;
  type: ToastKind;
};

const ToastContext = createContext<(message: string, type?: ToastKind) => void>(() => {});

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((items) => items.filter((item) => item.id !== id));
  }, []);

  const show = useCallback((message: string, type: ToastKind = "info") => {
    const id = String(++counter.current);
    setToasts((items) => [...items, { id, message, type }]);
    if (type !== "error") {
      window.setTimeout(() => {
        setToasts((items) => items.filter((item) => item.id !== id));
      }, 3000);
    }
  }, []);

  const colors: Record<ToastKind, string> = {
    success: "bg-emerald-600",
    error: "bg-red-600",
    info: "bg-slate-800"
  };

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="fixed bottom-20 right-4 z-[200] flex flex-col gap-2 md:bottom-4">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-lg ${colors[toast.type]}`}
          >
            <span>{toast.type === "success" ? "✓" : toast.type === "error" ? "✕" : "ℹ"}</span>
            <span className="flex-1">{toast.message}</span>
            <button
              type="button"
              onClick={() => dismiss(toast.id)}
              className="ml-2 rounded px-1 text-white/80 transition hover:bg-white/10 hover:text-white"
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
