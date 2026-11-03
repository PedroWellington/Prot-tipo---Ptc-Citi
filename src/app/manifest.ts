import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Clínica Movimento",
    short_name: "Movimento",
    description: "Acompanhe seu tratamento de fisioterapia.",
    start_url: "/",
    display: "standalone",
    background_color: "#123a6b",
    theme_color: "#123a6b",
    lang: "pt-BR",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
