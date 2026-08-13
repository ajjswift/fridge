import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Recime — your kitchen",
    short_name: "Recime",
    description:
      "See what's in your kitchen, what needs eating, and scan the shopping in.",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f7f2",
    theme_color: "#f7f7f2",
    orientation: "portrait",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/apple-icon", sizes: "180x180", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Scan an item", short_name: "Scan", url: "/scan" },
      { name: "Shopping list", short_name: "Shopping", url: "/shopping" },
    ],
  };
}
