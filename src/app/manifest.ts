import type { MetadataRoute } from "next";

// What a phone reads when someone taps "Add to Home Screen": the name to
// print under the icon, the icon itself, and the colours to paint while
// the app is opening so it doesn't flash white first.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Blair Lawn Care",
    // The home screen only has room for about eleven characters before it
    // starts trimming with an ellipsis.
    short_name: "Blair Lawn",
    description: "Blair Lawn Care operations dashboard",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f6f3ea",
    theme_color: "#1e3a2e",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // Android crops icons to whatever shape the launcher uses, so it gets
      // a copy with room to spare around the mark.
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
