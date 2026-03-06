"use client";

import { useEffect, useState } from "react";
import { XIcon } from "lucide-react";

const SHORTCUTS = [
  { key: "?", description: "Show keyboard shortcuts" },
  { key: "G H", description: "Go to Dashboard" },
  { key: "G C", description: "Go to Catalog (student)" },
  { key: "G S", description: "Go to Schedule (student)" },
  { key: "G P", description: "Go to Profile (student)" },
  { key: "Esc", description: "Close modal / Cancel" },
  { key: "/", description: "Focus search (if available)" },
  { key: "Ctrl+K", description: "Open Command Palette" }
];

export default function KeyboardShortcutsModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (event.key === "?") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Keyboard Shortcuts</h2>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="flex h-7 w-7 items-center justify-center rounded-lg hover:bg-slate-100"
          >
            <XIcon className="h-4 w-4 text-slate-500" />
          </button>
        </div>
        <div className="mt-4 space-y-2">
          {SHORTCUTS.map((shortcut) => (
            <div key={shortcut.key} className="flex items-center justify-between gap-4">
              <span className="text-sm text-slate-600">{shortcut.description}</span>
              <kbd className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">
                {shortcut.key}
              </kbd>
            </div>
          ))}
        </div>
        <p className="mt-4 text-center text-xs text-slate-400">
          Press <kbd className="font-mono">?</kbd> to toggle
        </p>
      </div>
    </div>
  );
}
