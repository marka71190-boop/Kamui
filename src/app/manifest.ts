import type { MetadataRoute } from "next";
import { SITE } from "@/config/site";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.title,
    short_name: "Kamui × Abramov",
    description: SITE.description,
    start_url: "/",
    display: "standalone",
    background_color: "#070707",
    theme_color: "#070707",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png" },
    ],
  };
}
