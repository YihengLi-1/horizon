import type { Metadata } from "next";
import type { CSSProperties } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "University SIS MVP",
  description: "Student information and course registration system"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      style={
        {
          "--font-body": '"Source Sans 3", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif',
          "--font-heading": '"Merriweather", Georgia, "Times New Roman", serif'
        } as CSSProperties
      }
    >
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
