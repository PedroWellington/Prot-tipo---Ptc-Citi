// Ponta a ponta no navegador: depois de entrar e sair da conta, a página inicial continua íntegra.
// Uso (com o app rodando e o Chrome instalado):  npm run e2e        BASE=http://localhost:3000 por padrão
// Só navega, entra e sai: não grava nada além da sessão de login. As senhas vêm do .env, nunca do código.
import assert from "node:assert/strict";
import { chromium } from "playwright-core";

process.loadEnvFile();
const BASE = process.env.BASE ?? "http://localhost:3000";
const PERFIS = [
  ["paciente01@exemplo.test", process.env.DEMO_PASSWORD],
  ["recepcao.bv@exemplo.test", process.env.DEMO_PASSWORD],
  ["fisio1@exemplo.test", process.env.DEMO_PASSWORD],
  [process.env.ADMIN_EMAIL ?? "admin@exemplo.test", process.env.ADMIN_PASSWORD],
];
const TELAS = { desktop: { width: 1366, height: 860 }, celular: { width: 390, height: 844, isMobile: true, hasTouch: true } };

/** O hero da "/" está inteiro: título, botões, palco preso, canvas desenhando e nenhuma frase solta na tela. */
async function heroIntegro(page, onde) {
  // Palco pronto e o canvas já no fim do fade de entrada (500 ms)
  await page.waitForFunction(() => {
    const c = document.querySelector("[data-scene].is-ready [data-scene-canvas]");
    return !!c && getComputedStyle(c).opacity === "1";
  }, null, { timeout: 15000 });
  const s = await page.evaluate(() => {
    const scene = document.querySelector("[data-scene]");
    const sticky = scene.querySelector(".scene-sticky");
    const canvas = scene.querySelector("[data-scene-canvas]");
    const visivel = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.display !== "none" && cs.visibility !== "hidden"; };
    const h1 = document.querySelector("#inicio-t");
    return {
      classes: document.documentElement.className,
      sticky: getComputedStyle(sticky).position,
      canvas: visivel(canvas) && getComputedStyle(canvas).opacity === "1",
      h1: !!h1 && visivel(h1) && h1.getBoundingClientRect().top < innerHeight,
      botoes: [...scene.querySelectorAll(".scene-hero a")].filter(visivel).length,
      cabecalho: document.querySelector(".site-header")?.dataset.mode,
      secoesInert: !!document.querySelector(".site-header .header-sections")?.inert,
      aviso: visivel(scene.querySelector("[data-scene-hint]")),
      ativos: [...scene.querySelectorAll(".scene-frame.is-on")].map((f) => f.dataset.frame),
      formasEstaticas: [...scene.querySelectorAll(".scene-shape")].filter(visivel).length,
      frasesVisiveis: [...scene.querySelectorAll(".scene-phrase .scene-word")].filter((w) => getComputedStyle(w).opacity !== "0").length,
      topo: scrollY,
    };
  });
  const msg = `${onde}: ${JSON.stringify(s)}`;
  assert.match(s.classes, /scene-live/, msg);
  assert.equal(s.sticky, "sticky", msg);
  assert.ok(s.canvas, msg);
  assert.ok(s.h1, msg);
  assert.equal(s.botoes, 1, msg); // só "Agendar tratamento": nada no hero pula a cena
  assert.equal(s.cabecalho, "cena", msg);
  assert.ok(s.secoesInert, msg);
  assert.ok(s.aviso, msg);
  assert.deepEqual(s.ativos, ["0"], msg);
  assert.equal(s.formasEstaticas, 0, msg);
  assert.equal(s.frasesVisiveis, 0, msg);
  assert.equal(s.topo, 0, msg);
}

const browser = await chromium.launch({ channel: "chrome" });
let falhas = 0;
try {
  for (const [email, senha] of PERFIS) {
    assert.ok(senha, "defina DEMO_PASSWORD e ADMIN_PASSWORD no .env");
    for (const [tela, vp] of Object.entries(TELAS)) {
      for (const tema of ["light", "dark"]) {
        const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: vp.isMobile, hasTouch: vp.hasTouch });
        await ctx.addInitScript((t) => { try { localStorage.setItem("mv-tema", t); } catch {} }, tema);
        const page = await ctx.newPage();
        const caso = `${email.split("@")[0]} ${tela} ${tema}`;
        try {
          await page.goto(`${BASE}/login`);
          const st = await page.evaluate(async ([e, p]) => (await fetch("/api/auth/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: e, password: p }) })).json().then((j) => j.home ?? "/"), [email, senha]);
          await page.goto(`${BASE}${st}`, { waitUntil: "networkidle" });
          // 1. Da área logada para "/" pelo link (navegação do cliente)
          await page.getByRole("link", { name: "Voltar à página inicial" }).first().click();
          await page.waitForURL(`${BASE}/`);
          await heroIntegro(page, `${caso} · clique`);
          // 2. Botão Voltar e Avançar do navegador
          await page.goBack(); await page.waitForURL((u) => u.pathname !== "/");
          await page.goForward(); await page.waitForURL(`${BASE}/`);
          await heroIntegro(page, `${caso} · voltar/avançar`);
          // 3. Sair da conta: termina em "/" com navegação completa
          await page.goto(`${BASE}${st}`, { waitUntil: "networkidle" });
          const sair = tela === "desktop" ? page.locator("aside").getByRole("button", { name: "Sair" }) : page.getByRole("button", { name: "Sair" }).first();
          if (await sair.count()) {
            await sair.click();
          } else {
            // Paciente no celular: o "Sair" fica no Perfil
            await page.goto(`${BASE}/app/perfil`, { waitUntil: "networkidle" });
            await page.getByRole("button", { name: "Sair" }).click();
          }
          await page.waitForURL(`${BASE}/`);
          await heroIntegro(page, `${caso} · depois de sair`);
          // 4. Recarregar
          await page.reload();
          await heroIntegro(page, `${caso} · recarregar`);
          // 5. Fim do palco: o menu completo desce; voltando ao topo, some de novo
          await page.evaluate(() => { const s = document.querySelector("[data-scene]"); scrollTo(0, s.getBoundingClientRect().bottom + scrollY); });
          await page.waitForFunction(() => document.querySelector(".site-header")?.dataset.mode === "completo", null, { timeout: 5000 });
          await page.evaluate(() => scrollTo(0, 0));
          await page.waitForFunction(() => document.querySelector(".site-header")?.dataset.mode === "cena", null, { timeout: 5000 });
          console.log(`✓ ${caso}`);
        } catch (e) {
          falhas++;
          console.error(`✗ ${caso}\n  ${e.message.split("\n")[0]}`);
        } finally {
          await ctx.close();
        }
      }
    }
  }
} finally {
  await browser.close();
}
process.exit(falhas ? 1 : 0);
