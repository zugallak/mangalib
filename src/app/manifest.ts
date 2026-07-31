import type { MetadataRoute } from "next";

/**
 * Native Next.js PWA manifest (no extra dependency). Next serves this at
 * /manifest.webmanifest and injects the <link rel="manifest"> automatically.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MangaLib",
    short_name: "MangaLib",
    description: "Track your physical manga collection.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a0a0a",
    theme_color: "#0a0a0a",
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
    ],
  };
}
