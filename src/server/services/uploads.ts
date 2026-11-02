import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { AppError, forbidden, notFound } from "../errors";
import { guidanceWithFile } from "../repositories/treatments";
import type { CurrentUser } from "../auth/session";

const MAX_BYTES = 50 * 1024 * 1024;
const TYPES: Record<string, string> = {
  "video/mp4": ".mp4", "video/webm": ".webm", "application/pdf": ".pdf", "image/jpeg": ".jpg", "image/png": ".png",
};
const MIME = Object.fromEntries(Object.entries(TYPES).map(([k, v]) => [v, k]));
const dir = () => path.resolve(/*turbopackIgnore: true*/ process.env.UPLOAD_DIR ?? "./uploads");

export async function saveUpload(file: File) {
  // shortcut: o disco da Vercel é efêmero; para arquivos lá, use armazenamento de objetos
  if (process.env.VERCEL) throw new AppError(501, "UPLOAD", "Envio de arquivo indisponível nesta demonstração. Use um link.");
  const ext = TYPES[file.type];
  if (!ext) throw new AppError(415, "TIPO_ARQUIVO", "Envie vídeo MP4/WebM, PDF, JPG ou PNG.");
  if (file.size > MAX_BYTES) throw new AppError(413, "ARQUIVO_GRANDE", "O arquivo passa do limite de 50 MB.");
  await mkdir(dir(), { recursive: true });
  const name = `${randomUUID()}${ext}`;
  await writeFile(path.join(/*turbopackIgnore: true*/ dir(), name), Buffer.from(await file.arrayBuffer()));
  return name;
}

export async function readUpload(name: string, user: CurrentUser) {
  if (!/^[0-9a-f-]{36}\.[a-z0-9]+$/.test(name)) throw notFound("Arquivo");
  if (user.role === "PACIENTE") {
    const g = await guidanceWithFile(name);
    if (g?.treatment.patient.userId !== user.id) throw forbidden();
  }
  const body = await readFile(path.join(/*turbopackIgnore: true*/ dir(), name)).catch(() => { throw notFound("Arquivo"); });
  return new Response(body, {
    headers: { "Content-Type": MIME[path.extname(name)], "Cache-Control": "private, max-age=3600", "Content-Disposition": "inline" },
  });
}
