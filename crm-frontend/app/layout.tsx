import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { LayoutDashboard, Mic, Settings } from "lucide-react";
import { Providers } from "./providers";
import { SystemStatus } from "../components/SystemStatus";

export const metadata: Metadata = {
  title: "MeetingPi",
  description: "Local meeting transcription and summarisation on Raspberry Pi",
};

const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/meetings", label: "Réunions", icon: Mic },
  { href: "/settings", label: "Paramètres", icon: Settings },
];

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="flex min-h-screen bg-bg-base text-text-primary">
        <Providers>
          {/* ── Sidebar ─────────────────────────────────────────────── */}
          <aside className="flex h-screen w-[240px] shrink-0 flex-col border-r border-border bg-bg-surface">
            {/* Logo */}
            <div className="flex items-center gap-2 border-b border-border px-4 py-4">
              <Mic className="h-5 w-5 text-accent-red" aria-hidden="true" />
              <span className="font-mono text-sm font-bold text-text-primary">
                MeetingPi
              </span>
            </div>

            {/* Nav */}
            <nav className="flex flex-1 flex-col gap-1 p-2" aria-label="Navigation principale">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-elevated hover:text-text-primary"
                >
                  <item.icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  {item.label}
                </Link>
              ))}
            </nav>

            {/* Pi status compact */}
            <div className="border-t border-border p-3">
              <SystemStatus compact />
            </div>
          </aside>

          {/* ── Main content ─────────────────────────────────────────── */}
          <main className="flex-1 overflow-y-auto">
            {children}
          </main>
        </Providers>
      </body>
    </html>
  );
}
