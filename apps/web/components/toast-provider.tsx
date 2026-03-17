"use client";

import { createContext, useContext, useMemo, useReducer, type ReactNode } from "react";

type ToastType = "success" | "error" | "warning" | "info";

type ToastItem = {
  id: string;
  type: ToastType;
  message: string;
  duration: number;
  closing: boolean;
};

type ToastApi = ((message: string, type?: ToastType) => void) & {
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
};

type Action =
  | { type: "ADD"; toast: ToastItem }
  | { type: "CLOSE"; id: string }
  | { type: "REMOVE"; id: string };

const ToastContext = createContext<ToastApi>(((() => {}) as unknown) as ToastApi);

function reducer(state: ToastItem[], action: Action) {
  if (action.type === "ADD") return [...state, action.toast];
  if (action.type === "CLOSE") return state.map((toast) => (toast.id === action.id ? { ...toast, closing: true } : toast));
  if (action.type === "REMOVE") return state.filter((toast) => toast.id !== action.id);
  return state;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, dispatch] = useReducer(reducer, []);

  const api = useMemo<ToastApi>(() => {
    const dismiss = (id: string, immediate = false) => {
      dispatch({ type: "CLOSE", id });
      window.setTimeout(() => dispatch({ type: "REMOVE", id }), immediate ? 0 : 180);
    };

    const createToast = (message: string, type: ToastType, duration?: number) => {
      const resolvedDuration = duration ?? (type === "error" ? 6000 : 4000);
      const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
      dispatch({ type: "ADD", toast: { id, type, message, duration: resolvedDuration, closing: false } });
      window.setTimeout(() => dismiss(id), resolvedDuration);
    };

    const show = ((message: string, type: ToastType = "info") => {
      createToast(message, type);
    }) as ToastApi;

    show.success = (message, duration) => createToast(message, "success", duration);
    show.error = (message, duration) => createToast(message, "error", duration);
    show.warning = (message, duration) => createToast(message, "warning", duration);
    show.info = (message, duration) => createToast(message, "info", duration);

    return show;
  }, []);

  const tone = (type: ToastType) => {
    if (type === "success") return "bg-emerald-500";
    if (type === "error") return "bg-red-500";
    if (type === "warning") return "bg-amber-500";
    return "bg-blue-500";
  };

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`campus-card relative flex max-w-xs items-start gap-3 overflow-hidden px-4 py-3 ${toast.closing ? "toast-exit" : "toast-enter"}`}
          >
            <div className={`absolute inset-y-0 left-0 w-1 ${tone(toast.type)}`} />
            <div className="min-w-0 flex-1 pl-2 text-sm text-slate-700">{toast.message}</div>
            <button
              type="button"
              onClick={() => {
                dispatch({ type: "CLOSE", id: toast.id });
                window.setTimeout(() => dispatch({ type: "REMOVE", id: toast.id }), 180);
              }}
              className="text-slate-400 transition hover:text-slate-600"
              aria-label="关闭提示"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
