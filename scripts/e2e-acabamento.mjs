// Acabamento animado do app logado: entrada com explosão de partículas, abas, filtro, tema e saída, nos 4 perfis,
// desktop e celular, claro e escuro. Grava vídeo e quadros em OUT e imprime medições (eventos lentos, tarefas longas,
// FPS da entrada). Também confere que cada perfil só vê o que é seu.
// Uso (app rodando, Chrome instalado):  node --env-file=.env scripts/e2e-acabamento.mjs
//   BASE=http://localhost:3000   OUT=.playwright-mcp/acabamento   SO=medir ROTULO=main (só as medições, para comparar)
// Faz login com contas @exemplo.test (o login grava a sessão, como qualquer acesso); não altera outros dados.
import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { chromium, devices } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? ".playwright-mcp/acabamento";
const ONLY_MEASURE = process.env.SO === "medir";
const DEMO = process.env.DEMO_PASSWORD;
const ADMIN = { email: process.env.ADMIN_EMAIL ?? "admin@exemplo.test", password: process.env.ADMIN_PASSWORD };
assert.ok(DEMO && ADMIN.password, "defina DEMO_PASSWORD e ADMIN_PASSWORD (node --env-file=.env)");
mkdirSync(OUT, { recursive: true });

const PERFIS = {
  paciente: { email: "paciente20@exemplo.test", password: DEMO, home: "/app" },
  recepcao: { email: "recepcao.bv@exemplo.test", password: DEMO, home: "/recepcao" },
  fisio: { email: "fisio1@exemplo.test", password: DEMO, home: "/fisio" },
  admin: { ...ADMIN, home: "/admin" },
};
const DESKTOP = { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 };
const CELULAR = { ...devices["Pixel 7"] };

const ok = (s) => console.log(`✓ ${s}`);
const medidas = [];

/** Observadores de desempenho, instalados antes de qualquer script da página. */
function perfInit() {
  window.__perf = { events: [], long: [] };
  try {
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.interactionId) window.__perf.events.push({ name: e.name, d: Math.round(e.duration) }); })
      .observe({ type: "event", durationThreshold: 16, buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__perf.long.push(Math.round(e.duration)); }).observe({ type: "longtask", buffered: true });
  } catch {}
}
const perf = (page) => page.evaluate(() => { const p = window.__perf; window.__perf = { events: [], long: [] }; return p; });
/** Quadros por segundo de requestAnimationFrame durante `ms`. */
const fps = (page, ms) => page.evaluate((ms) => new Promise((r) => { let n = 0; const t0 = performance.now(); const f = (t) => { n++; if (t - t0 < ms) requestAnimationFrame(f); else r(Math.round((n * 1000) / (t - t0))); }; requestAnimationFrame(f); }), ms);

async function quadros(page, nome, tempos) {
  const t0 = Date.now();
  for (const t of tempos) {
    const espera = t - (Date.now() - t0);
    if (espera > 0) await page.waitForTimeout(espera);
    await page.screenshot({ path: `${OUT}/${nome}-${String(t).padStart(4, "0")}ms.png` });
  }
}

async function contexto(browser, aparelho, tema, { reduce = false, video = false } = {}) {
  const ctx = await browser.newContext({ ...aparelho, reducedMotion: reduce ? "reduce" : "no-preference", ...(video ? { recordVideo: { dir: OUT, size: aparelho.viewport } } : {}) });
  // Só na primeira carga: recarregar precisa manter o tema que a pessoa escolheu
  await ctx.addInitScript((t) => { try { if (!localStorage.getItem("mv-tema")) localStorage.setItem("mv-tema", t); sessionStorage.setItem("mv-intro", "1"); } catch {} }, tema);
  await ctx.addInitScript(perfInit);
  return ctx;
}

async function entrar(page, perfil, { frames } = {}) {
  await page.goto(`${BASE}/login`);
  await page.getByLabel("E-mail").fill(perfil.email);
  await page.getByLabel("Senha", { exact: true }).fill(perfil.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL((u) => u.pathname.startsWith(perfil.home), { timeout: 20000 });
  const t0 = Date.now();
  if (frames) await quadros(page, frames, [0, 150, 350, 550, 750, 950, 1200]);
  // A entrada termina sozinha (sem espera artificial): o véu some e o atributo sai
  await page.waitForFunction(() => !document.documentElement.dataset.entrada, null, { timeout: 6000 });
  return Date.now() - t0;
}

/** Os números terminam no valor exato: o texto visível é igual ao dos leitores de tela. */
const numerosExatos = (page) => page.evaluate(() => [...document.querySelectorAll("span > span[aria-hidden].tabular-nums + .sr-only")]
  .filter((sr) => sr.previousElementSibling.textContent !== sr.textContent).map((sr) => [sr.previousElementSibling.textContent, sr.textContent]));

/** Nada da tela fica invisível depois das entradas (opacidade 0 em conteúdo visível). */
const invisiveis = (page) => page.evaluate(() => [...document.querySelectorAll("main *")].filter((el) => {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && r.top < innerHeight && getComputedStyle(el).opacity === "0" && !el.closest("[aria-hidden], .export-btn, [role=tooltip], .pill-ind") && el.textContent.trim();
}).map((el) => el.textContent.trim().slice(0, 40)));

const browser = await chromium.launch({ channel: "chrome", args: ["--ignore-gpu-blocklist", "--enable-gpu-rasterization"] });
let falhas = 0;
const caso = async (nome, fn) => { try { await fn(); ok(nome); } catch (e) { falhas++; console.error(`✗ ${nome}\n  ${e.message.split("\n").slice(0, 3).join("\n  ")}`); } };

try {
  if (!ONLY_MEASURE) {
    // 1. Entrada nos 4 perfis: desktop claro e celular escuro (com vídeo), e o contrário para os prints
    for (const [nome, perfil] of Object.entries(PERFIS)) {
      for (const [aparelho, dev, tema] of [["desktop", DESKTOP, "light"], ["celular", CELULAR, "dark"]]) {
        await caso(`${nome} ${aparelho} ${tema}: entrada com explosão, sem conteúdo invisível`, async () => {
          const ctx = await contexto(browser, dev, tema, { video: true });
          const page = await ctx.newPage();
          await page.goto(`${BASE}/login`);
          const fpsP = page.waitForURL((u) => u.pathname.startsWith(perfil.home), { timeout: 20000 }).then(() => fps(page, 1100));
          const ms = await entrar(page, perfil, { frames: `entrada-${nome}-${aparelho}-${tema}` });
          const quadrosSeg = await fpsP;
          assert.ok(ms < 4500, `entrada demorou ${ms} ms`);
          await page.waitForTimeout(1200);
          assert.deepEqual(await numerosExatos(page), []);
          assert.deepEqual(await invisiveis(page), []);
          await page.screenshot({ path: `${OUT}/tela-${nome}-${aparelho}-${tema}.png` });
          medidas.push({ caso: `entrada ${nome} ${aparelho}`, "duração até o fim (ms)": ms, "FPS (rAF)": quadrosSeg });
          // Recarregar já logado: sem véu
          await page.reload();
          assert.equal(await page.evaluate(() => document.documentElement.dataset.entrada ?? null), null, "véu reapareceu ao recarregar");
          // Trocar de aba pelo menu: sem véu
          const link = page.locator(aparelho === "desktop" ? 'nav[aria-label="Principal"] a' : 'nav[aria-label="Abas"] a').nth(1);
          await link.click();
          await page.waitForTimeout(150);
          assert.equal(await page.evaluate(() => document.documentElement.dataset.entrada ?? null), null, "véu ao trocar de aba");
          await ctx.close();
        });
      }
      // Prints no tema oposto de cada aparelho
      for (const [aparelho, dev, tema] of [["desktop", DESKTOP, "dark"], ["celular", CELULAR, "light"]]) {
        await caso(`${nome} ${aparelho} ${tema}: print`, async () => {
          const ctx = await contexto(browser, dev, tema);
          const page = await ctx.newPage();
          // Sem capturas no meio (elas atrasam a animação): esta é a duração real
          const ms = await entrar(page, perfil);
          medidas.push({ caso: `entrada ${nome} ${aparelho} (sem capturas)`, "duração até o fim (ms)": ms });
          await page.waitForTimeout(1200);
          assert.deepEqual(await invisiveis(page), []);
          await page.screenshot({ path: `${OUT}/tela-${nome}-${aparelho}-${tema}.png` });
          await ctx.close();
        });
      }
    }

    // 2. Pular a entrada com um clique; e menos movimento (sem véu, sem partículas)
    await caso("clique pula a entrada", async () => {
      const ctx = await contexto(browser, DESKTOP, "dark");
      const page = await ctx.newPage();
      await page.goto(`${BASE}/login`);
      await page.getByLabel("E-mail").fill(PERFIS.paciente.email);
      await page.getByLabel("Senha", { exact: true }).fill(DEMO);
      await page.getByRole("button", { name: "Entrar" }).click();
      await page.waitForURL((u) => u.pathname.startsWith("/app"));
      await page.waitForFunction(() => document.documentElement.dataset.entrada === "run", null, { timeout: 5000 });
      const t0 = Date.now();
      await page.mouse.click(700, 450);
      await page.waitForFunction(() => !document.documentElement.dataset.entrada, null, { timeout: 2000 });
      assert.ok(Date.now() - t0 < 700, `pular levou ${Date.now() - t0} ms`);
      await ctx.close();
    });
    await caso("menos movimento: sem véu nem partículas, conteúdo visível", async () => {
      const ctx = await contexto(browser, CELULAR, "light", { reduce: true });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/login`);
      await page.getByLabel("E-mail").fill(PERFIS.recepcao.email);
      await page.getByLabel("Senha", { exact: true }).fill(DEMO);
      await page.getByRole("button", { name: "Entrar" }).click();
      await page.waitForURL((u) => u.pathname.startsWith("/recepcao"));
      const estado = await page.evaluate(() => ({ e: document.documentElement.dataset.entrada ?? null, canvas: !!document.querySelector(".entry-canvas"), veu: getComputedStyle(document.querySelector("[data-entry-veil]")).display }));
      assert.notEqual(estado.e, "run");
      assert.equal(estado.canvas, false);
      assert.equal(estado.veu, "none");
      await page.waitForTimeout(500);
      assert.deepEqual(await numerosExatos(page), []);
      assert.deepEqual(await invisiveis(page), []);
      await ctx.close();
    });

    // 3. "Minha área" vindo da página pública (navegação do cliente) e a saída de volta
    await caso("Minha área → entrada; Sair → esfera se junta e a página inicial abre íntegra", async () => {
      const ctx = await contexto(browser, DESKTOP, "dark", { video: true });
      const page = await ctx.newPage();
      await entrar(page, PERFIS.fisio);
      await page.getByRole("button", { name: "Sair" }).first().click();
      await quadros(page, "saida-fisio-desktop-escuro", [0, 200, 400, 600]);
      await page.waitForURL(`${BASE}/`);
      await page.waitForFunction(() => document.querySelector("[data-scene]")?.classList.contains("is-ready"), null, { timeout: 20000 });
      assert.equal(await page.evaluate(() => document.documentElement.dataset.entrada ?? null), null);
      // Entrou de novo pela página pública: "Minha área" aparece e roda a entrada (um login novo)
      await page.goto(`${BASE}/login`);
      await page.getByLabel("E-mail").fill(PERFIS.fisio.email);
      await page.getByLabel("Senha", { exact: true }).fill(DEMO);
      await page.getByRole("button", { name: "Entrar" }).click();
      await page.waitForURL((u) => u.pathname.startsWith("/fisio"));
      await page.waitForFunction(() => !document.documentElement.dataset.entrada, null, { timeout: 6000 });
      await page.goto(`${BASE}/`);
      await page.getByRole("link", { name: "Minha área" }).first().click();
      // Já entrou neste login: "Minha área" não repete a animação
      await page.waitForURL((u) => u.pathname.startsWith("/fisio"));
      assert.equal(await page.evaluate(() => document.documentElement.dataset.entrada ?? null), null, "animação repetiu no mesmo login");
      await ctx.close();
    });

    // 4. Permissões: cada perfil só vê o que é seu (somente leituras)
    await caso("permissões dos 4 perfis seguem iguais", async () => {
      const req = await (await browser.newContext()).request;
      const login = async (p) => { const r = await req.post(`${BASE}/api/auth/login`, { data: { email: p.email, password: p.password } }); assert.equal(r.status(), 200, p.email); };
      const status = async (path) => (await req.get(`${BASE}/api${path}`)).status();
      await login(PERFIS.paciente);
      assert.equal(await status("/desk/agenda"), 403, "paciente na agenda da recepção");
      assert.equal(await status("/admin/dashboard"), 403, "paciente nas análises");
      await login(PERFIS.fisio);
      assert.equal(await status("/admin/dashboard"), 403, "fisioterapeuta nas análises");
      await login(PERFIS.recepcao);
      assert.equal(await status("/admin/users"), 403, "recepção na equipe");
      assert.equal(await status("/admin/dashboard"), 403, "recepção nas análises do admin");
      // Recepção de Boa Viagem pedindo a agenda de Casa Forte: recebe só a própria unidade
      const units = await (await req.get(`${BASE}/api/units`)).json();
      const cf = units.find((u) => u.code === "CF");
      const agenda = await (await req.get(`${BASE}/api/desk/agenda?unitId=${cf.id}`)).json();
      assert.ok(agenda.length && agenda.every((s) => (s.unit?.name ?? s.unit) !== cf.name), "recepção viu outra unidade");
    });

    // 5. Admin: troca de abas, filtro (números do valor atual para o novo), tema por revelação circular
    for (const [aparelho, dev, tema] of [["desktop", DESKTOP, "light"], ["celular", CELULAR, "dark"]]) {
      await caso(`admin ${aparelho} ${tema}: abas, filtro e tema`, async () => {
        const ctx = await contexto(browser, dev, tema, { video: true });
        const page = await ctx.newPage();
        await entrar(page, PERFIS.admin);
        await page.waitForTimeout(1000);
        await perf(page);
        await page.getByRole("tab", { name: "Financeiro" }).click();
        await quadros(page, `abas-admin-${aparelho}-${tema}`, [0, 60, 140, 260, 420]);
        await page.getByRole("tab", { name: "Faltas" }).click();
        await page.waitForTimeout(900);
        await page.getByRole("radio", { name: "30 dias" }).click();
        await quadros(page, `filtro-admin-${aparelho}-${tema}`, [0, 200, 450, 800, 1200]);
        assert.deepEqual(await numerosExatos(page), [], "número não terminou no valor exato");
        const antes = await page.evaluate(() => document.documentElement.dataset.theme);
        const botao = page.getByRole("button", { name: "Alternar tema claro e escuro" }).locator("visible=true").first();
        await botao.click();
        await quadros(page, `tema-admin-${aparelho}-${tema}`, [0, 120, 260, 400, 650]);
        const depois = await page.evaluate(() => ({ t: document.documentElement.dataset.theme, vt: document.documentElement.dataset.vt ?? null, salvo: localStorage.getItem("mv-tema") }));
        assert.notEqual(depois.t, antes);
        assert.equal(depois.salvo, depois.t);
        assert.equal(depois.vt, null);
        await page.reload();
        assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), depois.t, "tema errado ao recarregar");
        const p = await perf(page);
        medidas.push({ caso: `admin ${aparelho}: abas + filtro + tema`, "evento mais lento (ms)": Math.max(0, ...p.events.map((e) => e.d)), "tarefas longas > 100 ms": p.long.filter((d) => d > 100).length });
        await ctx.close();
      });
    }
  }

  // 6. Medições comparáveis com a main (as mesmas interações, sem a entrada)
  for (const [aparelho, dev] of [["desktop", DESKTOP], ["celular", CELULAR]]) {
    await caso(`medição ${aparelho}`, async () => {
      const ctx = await contexto(browser, dev, "light");
      const page = await ctx.newPage();
      if (dev === CELULAR) { const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 }); }
      await entrar(page, PERFIS.admin);
      await page.waitForTimeout(1500);
      await perf(page);
      for (const aba of ["Financeiro", "Previsões", "Faltas"]) { await page.getByRole("tab", { name: aba }).click(); await page.waitForTimeout(1200); }
      for (const per of ["30 dias", "90 dias", "6 meses"]) { await page.getByRole("radio", { name: per }).click(); await page.waitForTimeout(1200); }
      const p = await perf(page);
      const ev = p.events.map((e) => e.d).sort((a, b) => a - b);
      medidas.push({ caso: `${process.env.ROTULO ?? "branch"} ${aparelho}${dev === CELULAR ? " (CPU 4x)" : ""}`, "INP aprox. (ms)": ev.at(-1) ?? 0, "tarefas longas > 100 ms": p.long.filter((d) => d > 100).length, "maior tarefa (ms)": Math.max(0, ...p.long) });
      await ctx.close();
    });
  }
} finally {
  await browser.close();
}
console.table(medidas);
console.log(falhas ? `\n${falhas} falha(s)` : `\nTudo certo. Quadros e vídeos em ${OUT}`);
process.exit(falhas ? 1 : 0);
