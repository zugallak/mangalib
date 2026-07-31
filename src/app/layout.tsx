import type { Metadata, Viewport } from "next";
import "./globals.css";

import { BottomNav } from "@/components/bottom-nav";

export const metadata: Metadata = {
  title: "MangaLib",
  description: "Track your physical manga collection — see what you own and what's missing.",
  applicationName: "MangaLib",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "MangaLib",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-background text-foreground antialiased">
        {/* Mobile-first column, capped so it stays readable on larger screens. */}
        <div className="mx-auto flex min-h-dvh w-full max-w-screen-sm flex-col">
          <main className="flex-1 px-4 pb-24 pt-4">{children}</main>
          <BottomNav />
        </div>
      </body>
    </html>
  );
}
