import type { Metadata } from "next";
import { Merriweather, Source_Sans_3 } from "next/font/google";
import "./globals.css";

const bodyFont = Source_Sans_3({
  subsets: ["latin"],
  variable: "--font-body"
});

const headingFont = Merriweather({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["400", "700", "900"]
});

export const metadata: Metadata = {
  title: "University SIS",
  description: "Student Information System — academic planning, course registration, and enrollment management"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${bodyFont.variable} ${headingFont.variable}`}>
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
