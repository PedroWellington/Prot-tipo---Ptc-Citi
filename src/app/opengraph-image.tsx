import { ImageResponse } from "next/og";

export const alt = "Clínica Movimento: fisioterapia do primeiro dia à alta (clínica fictícia de demonstração)";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Imagem de compartilhamento: gradiente da paleta e texto, sem foto
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "linear-gradient(125deg, #3fdccd 0%, #6fd0f0 55%, #8ec9ff 100%)", color: "#123a6b" }}>
        <div style={{ fontSize: 40, fontWeight: 700 }}>Movimento</div>
        <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.05, marginTop: 24, maxWidth: 900 }}>Fisioterapia do primeiro dia à alta</div>
        <div style={{ fontSize: 28, marginTop: 32 }}>Clínica fictícia · conteúdo de demonstração</div>
      </div>
    ),
    size,
  );
}
