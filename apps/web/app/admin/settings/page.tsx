import SystemSettingsEditor from "./SystemSettingsEditor";

export default function SettingsPage() {
  const settings = [
    {
      group: "Application",
      items: [
        { key: "NODE_ENV", value: process.env.NODE_ENV ?? "—" },
        { key: "NEXT_PUBLIC_APP_VERSION", value: process.env.NEXT_PUBLIC_APP_VERSION ?? "—" },
        { key: "NEXT_PUBLIC_API_URL", value: process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000" },
        { key: "SIS_TIMEZONE", value: process.env.SIS_TIMEZONE ?? "America/Los_Angeles" }
      ]
    },
    {
      group: "CSRF",
      items: [
        { key: "NEXT_PUBLIC_CSRF_COOKIE_NAME", value: process.env.NEXT_PUBLIC_CSRF_COOKIE_NAME ?? "—" },
        { key: "NEXT_PUBLIC_CSRF_HEADER_NAME", value: process.env.NEXT_PUBLIC_CSRF_HEADER_NAME ?? "—" }
      ]
    },
    {
      group: "Email (SMTP)",
      items: [
        { key: "SMTP_HOST", value: process.env.SMTP_HOST ? "✓ Configured" : "✗ Not configured" },
        { key: "SMTP_FROM", value: process.env.SMTP_FROM ?? "—" }
      ]
    },
    {
      group: "Monitoring",
      items: [{ key: "NEXT_PUBLIC_GRAFANA_URL", value: process.env.NEXT_PUBLIC_GRAFANA_URL ?? "http://localhost:3001" }]
    },
    {
      group: "Feature Flags",
      items: [
        { key: "ENABLE_PUBLIC_SCHEDULE_SHARING", value: process.env.ENABLE_PUBLIC_SCHEDULE_SHARING ?? "false" },
        { key: "NEXT_PUBLIC_ENABLE_PUBLIC_SCHEDULE_SHARING", value: process.env.NEXT_PUBLIC_ENABLE_PUBLIC_SCHEDULE_SHARING ?? "false" }
      ]
    },
    {
      group: "Secrets (hidden)",
      items: [
        { key: "JWT_SECRET", value: process.env.JWT_SECRET ? "✓ Set" : "✗ Not set" },
        { key: "DATABASE_URL", value: process.env.DATABASE_URL ? "✓ Set" : "✗ Not set" }
      ]
    }
  ];

  return (
    <div className="campus-page space-y-6">
      <div className="campus-hero">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">System Settings</h1>
        <p className="mt-1 text-sm text-slate-500">
          Environment configuration (read-only). Use the editor below to manage <code>maintenance_mode</code>,
          registration messaging, and system limits.
        </p>
      </div>

      {settings.map((group) => (
        <div key={group.group} className="campus-card overflow-hidden">
          <div className="border-b border-slate-100 bg-slate-50 px-4 py-2 dark:border-slate-700 dark:bg-slate-800">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{group.group}</p>
          </div>
          <div className="divide-y divide-slate-50 dark:divide-slate-700">
            {group.items.map((item) => (
              <div key={item.key} className="flex items-center justify-between px-4 py-3">
                <code className="text-xs font-mono text-slate-600 dark:text-slate-400">{item.key}</code>
                <span
                  className={`text-sm font-medium ${
                    item.value.startsWith("✓")
                      ? "text-emerald-600"
                      : item.value.startsWith("✗")
                        ? "text-red-500"
                        : "text-slate-700 dark:text-slate-200"
                  }`}
                >
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>
      ))}

      <SystemSettingsEditor />

      <p className="text-center text-xs text-slate-400">
        To modify settings, update <code>.env</code> and restart the service.
      </p>
    </div>
  );
}
