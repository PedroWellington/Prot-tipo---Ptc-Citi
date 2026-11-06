// Peso do JavaScript por rota (bytes transferidos com compressão e sem), no build de produção rodando.
// Uso: node --env-file=.env --env-file=.env.local scripts/peso-js.mjs   (BASE=http://localhost:3000)
// Credenciais só por variável de ambiente; nada é impresso além dos números.
import { gzipSync } from "node:zlib";
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3000";
// E2E_ADMIN_* (contas do site oficial) primeiro; no banco local, o admin de demonstração do .env
const ADMINS = [[process.env.E2E_ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD], [process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD]].filter(([e, p]) => e && p);
const browser = await chromium.launch({ channel: "chrome" });
const ctx = await browser.newContext();
const out = [];
async function medir(path) {
  const fresh = await browser.newContext({ storageState: await ctx.storageState() });
  const page = await fresh.newPage();
  const sizes = [];
  page.on("response", async (r) => {
    if (r.request().resourceType() !== "script") return;
    const body = await r.body().catch(() => Buffer.alloc(0));
    sizes.push({ url: r.url(), gz: gzipSync(body).length, raw: body.length });
  });
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const uniq = [...new Map(sizes.map((x) => [x.url, x])).values()];
  out.push({ rota: path, "JS gzip (KB)": +(uniq.reduce((a, b) => a + b.gz, 0) / 1024).toFixed(1), "JS sem compressão (KB)": +(uniq.reduce((a, b) => a + b.raw, 0) / 1024).toFixed(1), arquivos: uniq.length });
  await fresh.close();
}
for (const p of ["/", "/login", "/cadastro"]) await medir(p);
let logged = false;
for (const [email, password] of ADMINS) if ((await ctx.request.post(`${BASE}/api/auth/login`, { data: { email, password } })).status() === 200) { logged = true; break; }
if (!logged) { console.error("login do admin falhou"); process.exit(1); }
for (const p of ["/admin", "/admin/usuarios", "/recepcao"]) await medir(p);
await browser.close();
console.table(out);
