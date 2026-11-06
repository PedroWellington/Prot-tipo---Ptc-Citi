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
const ONLY_R2 = process.env.SO === "rodada2";
const ONLY_R4 = process.env.SO === "rodada4";
const DEMO = process.env.DEMO_PASSWORD;
// Admin: E2E_ADMIN_* (.env.local) quando entram neste servidor; no banco local, o admin de demonstração do .env.
// Credenciais só em memória: nunca impressas, nem em capturas.
const ADMIN = await (async () => {
  for (const [email, password] of [[process.env.E2E_ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD], [process.env.ADMIN_EMAIL, process.env.ADMIN_PASSWORD]]) {
    if (!email || !password) continue;
    const r = await fetch(`${BASE}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) }).catch(() => null);
    if (r?.ok) return { email, password };
  }
  return {};
})();
assert.ok(DEMO && ADMIN.password, "defina DEMO_PASSWORD e E2E_ADMIN_* ou ADMIN_* (node --env-file=.env --env-file=.env.local)");
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
// O servidor aceita 20 logins por minuto por IP e 8 por e-mail: o roteiro espaça os logins para não bater no limite
const logins = [];
async function pace() {
  const now = Date.now();
  while (logins.length && now - logins[0] > 61_000) logins.shift();
  if (logins.length >= 15) await new Promise((r) => setTimeout(r, 61_000 - (now - logins[0])));
  logins.push(Date.now());
}
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
  await ctx.addInitScript(vigiaInit);
  return ctx;
}

/**
 * Login pelo formulário. Mede: do clique até a página de destino (autenticação + carregamento, tempo real) e, depois
 * dela, quanto a transição leve leva para assentar (a entrada em cascata dos blocos da tela, a mesma da tela de login).
 */
async function entrar(page, perfil, { frames } = {}) {
  await pace();
  await page.goto(`${BASE}/login`);
  await page.getByLabel("E-mail").fill(perfil.email);
  await page.getByLabel("Senha", { exact: true }).fill(perfil.password);
  const t0 = Date.now();
  await page.getByRole("button", { name: "Entrar" }).click();
  if (frames) await quadros(page, frames, [0, 150, 350, 550, 800, 1100, 1500]);
  await page.waitForURL((u) => u.pathname.startsWith(perfil.home), { timeout: 20000 });
  await page.locator("main > *").first().waitFor();
  const destino = Date.now() - t0;
  const transicao = await assentou(page);
  await semPortal(page, `login ${perfil.home}`);
  return { "clique → destino (ms)": destino, "transição (ms)": transicao };
}

/** Tempo até nenhum bloco direto de <main> ter animação de entrada rodando (a transição terminou). */
const assentou = (page) => page.evaluate(() => new Promise((r) => {
  const t0 = performance.now();
  const f = () => {
    const rodando = [...document.querySelectorAll("main > *")].some((el) => el.getAnimations().some((a) => a.playState === "running" || a.playState === "pending"));
    if (!rodando || performance.now() - t0 > 5000) r(Math.round(performance.now() - t0));
    else requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}));

/** Em todo documento: registra se aparece véu, canvas fora da cena da página inicial ou marcador (círculo liso, "M" solto). */
function vigiaInit() {
  window.__sujo = [];
  const id = setInterval(() => {
    if (!document.documentElement) return;
    const achou = [...document.querySelectorAll("canvas:not([data-scene-canvas]), .entry-veil, .entry-mark, [data-entry-veil]")].map((el) => el.className || el.tagName);
    if (document.documentElement.dataset.portal) achou.push("data-portal");
    for (const a of achou) if (!window.__sujo.includes(a)) window.__sujo.push(a);
  }, 16);
  setTimeout(() => clearInterval(id), 30000);
}
const semPortal = async (page, onde) => assert.deepEqual(await page.evaluate(() => window.__sujo ?? []), [], `${onde}: apareceu portal/véu/canvas extra`);

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
// CASO=trecho: roda só os casos cujo nome contém o trecho
const caso = async (nome, fn) => { if (process.env.CASO && !nome.includes(process.env.CASO)) return; try { await fn(); ok(nome); } catch (e) { falhas++; console.error(`✗ ${nome}\n  ${e.message.split("\n").slice(0, 14).join("\n  ")}`); } };

try {
  if (!ONLY_MEASURE && !ONLY_R2 && !ONLY_R4) {
    // 1. Entrada nos 4 perfis: desktop claro e celular escuro (com vídeo), e o contrário para os prints
    for (const [nome, perfil] of Object.entries(PERFIS)) {
      for (const [aparelho, dev, tema] of [["desktop", DESKTOP, "light"], ["celular", CELULAR, "dark"]]) {
        await caso(`${nome} ${aparelho} ${tema}: login com a transição leve, sem partículas nem conteúdo invisível`, async () => {
          const ctx = await contexto(browser, dev, tema, { video: true });
          const page = await ctx.newPage();
          const t = await entrar(page, perfil, { frames: `login-${nome}-${aparelho}-${tema}` });
          medidas.push({ caso: `login ${nome} ${aparelho}`, ...t });
          await page.waitForTimeout(2200);
          assert.deepEqual(await numerosExatos(page), []);
          assert.deepEqual(await invisiveis(page), []);
          await page.screenshot({ path: `${OUT}/tela-${nome}-${aparelho}-${tema}.png` });
          // Recarregar já logado: sem véu
          await page.reload();
          await semPortal(page, "recarregar");
          // Trocar de aba pelo menu: sem véu
          const link = page.locator(aparelho === "desktop" ? 'nav[aria-label="Principal"] a' : 'nav[aria-label="Abas"] a').nth(1);
          await link.click();
          await page.waitForTimeout(150);
          await semPortal(page, "trocar de aba");
          await ctx.close();
        });
      }
      // Prints no tema oposto de cada aparelho
      for (const [aparelho, dev, tema] of [["desktop", DESKTOP, "dark"], ["celular", CELULAR, "light"]]) {
        await caso(`${nome} ${aparelho} ${tema}: print`, async () => {
          const ctx = await contexto(browser, dev, tema);
          const page = await ctx.newPage();
          // Sem capturas no meio (elas atrasam a animação): estes são os tempos reais
          medidas.push({ caso: `login ${nome} ${aparelho} (sem capturas)`, ...(await entrar(page, perfil)) });
          await page.waitForTimeout(2200);
          assert.deepEqual(await invisiveis(page), []);
          await page.screenshot({ path: `${OUT}/tela-${nome}-${aparelho}-${tema}.png` });
          await ctx.close();
        });
      }
    }

    // 2. Pular a entrada com um clique; e menos movimento (sem véu, sem partículas)
    await caso("menos movimento: só fade, conteúdo visível", async () => {
      const ctx = await contexto(browser, CELULAR, "light", { reduce: true });
      const page = await ctx.newPage();
      await pace();
      await page.goto(`${BASE}/login`);
      await page.getByLabel("E-mail").fill(PERFIS.recepcao.email);
      await page.getByLabel("Senha", { exact: true }).fill(DEMO);
      await page.getByRole("button", { name: "Entrar" }).click();
      await page.waitForURL((u) => u.pathname.startsWith("/recepcao"));
      await semPortal(page, "menos movimento");
      await page.waitForTimeout(500);
      assert.deepEqual(await numerosExatos(page), []);
      assert.deepEqual(await invisiveis(page), []);
      await ctx.close();
    });

    // 3. Logout, "Minha área" já logado, login com falha e 20 ciclos login/logout: só a transição leve, nunca partículas
    /** A página inicial íntegra: hero, cabeçalho, botões e a esfera de triângulos da cena (canvas WebGL pronto). */
    const inicioIntegro = async (page, onde) => {
      await page.waitForURL(`${BASE}/`);
      await page.waitForFunction(() => document.querySelector("[data-scene]")?.classList.contains("is-ready"), null, { timeout: 20000 });
      const r = await page.evaluate(() => ({
        hero: (document.querySelector(".scene-hero h1")?.getBoundingClientRect().height ?? 0) > 0,
        cabecalho: !!document.querySelector(".site-header"),
        botao: !!document.querySelector(".scene-hero .btn-brand"),
        esfera: document.querySelector("[data-scene]").dataset.stage === "webgl",
      }));
      assert.deepEqual(r, { hero: true, cabecalho: true, botao: true, esfera: true }, `${onde}: página inicial quebrada`);
      await semPortal(page, onde);
    };

    await caso("logout: a página inicial abre íntegra com a transição leve; Minha área já logado vai direto ao painel", async () => {
      const ctx = await contexto(browser, DESKTOP, "dark", { video: true });
      const page = await ctx.newPage();
      await entrar(page, PERFIS.fisio);
      await page.waitForTimeout(800);
      await page.getByRole("button", { name: "Sair" }).first().click();
      await quadros(page, "logout-fisio-desktop-escuro", [0, 150, 350, 600, 900, 1300]);
      await inicioIntegro(page, "logout");
      medidas.push({ caso: "logout → página inicial", "transição (ms)": await assentou(page) });
      await page.screenshot({ path: `${OUT}/logout-chegada-desktop-escuro.png` });
      // Logado de novo: "Minha área" no topo da página inicial vai direto ao painel, com a mesma transição
      await entrar(page, PERFIS.fisio);
      await page.goto(`${BASE}/`);
      await page.waitForTimeout(1500);
      await page.locator(".site-header").getByRole("link", { name: "Minha área" }).locator("visible=true").first().click();
      await quadros(page, "minha-area-logado-desktop-escuro", [0, 150, 350, 600, 900]);
      await page.waitForURL((u) => u.pathname.startsWith("/fisio"));
      medidas.push({ caso: "Minha área (logado) → painel", "transição (ms)": await assentou(page) });
      await semPortal(page, "Minha área");
      await ctx.close();
    });

    await caso("login com senha errada: erro normal, sem transição nem tela escura", async () => {
      const ctx = await contexto(browser, DESKTOP, "light");
      const page = await ctx.newPage();
      await page.goto(`${BASE}/login`);
      await pace();
      await page.getByLabel("E-mail").fill("paciente12@exemplo.test");
      await page.getByLabel("Senha", { exact: true }).fill("senha-errada-123");
      await page.getByRole("button", { name: "Entrar" }).click();
      await page.getByRole("alert").waitFor({ timeout: 8000 });
      await page.screenshot({ path: `${OUT}/login-falha-desktop-claro.png` });
      const r = await page.evaluate(() => ({ url: location.pathname, email: document.querySelector('input[name="email"]').value, filtro: getComputedStyle(document.body.firstElementChild).filter }));
      assert.deepEqual(r, { url: "/login", email: "paciente12@exemplo.test", filtro: "none" });
      await semPortal(page, "login com falha");
      await ctx.close();
    });

    await caso("20 ciclos de login e logout seguidos: página inicial íntegra e nenhuma partícula fora da cena", async () => {
      const contas = ["paciente13@exemplo.test", "paciente14@exemplo.test", "paciente15@exemplo.test", "paciente16@exemplo.test", "paciente17@exemplo.test"];
      const ctx = await contexto(browser, DESKTOP, "light");
      const page = await ctx.newPage();
      for (let i = 0; i < 20; i++) {
        await entrar(page, { email: contas[i % contas.length], password: DEMO, home: "/app" });
        await page.locator("main > *").first().waitFor();
        await page.getByRole("button", { name: "Sair" }).first().click();
        await inicioIntegro(page, `ciclo ${i + 1}`);
      }
      await ctx.close();
    });

    await caso("painel do paciente: sem exercícios, calendário nem atalhos; Mobilidade completa; menu dá acesso a tudo", async () => {
      for (const [aparelho, dev, tema] of [["desktop", DESKTOP, "light"], ["desktop", DESKTOP, "dark"], ["celular", CELULAR, "light"], ["celular", CELULAR, "dark"]]) {
        const ctx = await contexto(browser, dev, tema);
        const page = await ctx.newPage();
        await entrar(page, PERFIS.paciente);
        await page.waitForTimeout(2200);
        const r = await page.evaluate(() => {
          const txt = document.querySelector("main").textContent; // textContent: inclui o que está abaixo da dobra (content-visibility)
          return {
            exercicios: /Exercícios prévios|Marcar como feito|Ver vídeo no YouTube/.test(txt), calendario: !!document.querySelector("main ol.grid-cols-7"),
            atalhos: !!document.querySelector('main nav[aria-label="Atalhos"]'),
            blocos: ["Próxima sessão", "Evolução da dor", "Conquistas", "Sua unidade", "Agendar mais sessões"].filter((t) => !txt.includes(t)),
            buraco: (() => { const g = document.querySelector("main .grid.lg\\:grid-cols-12"); return g ? g.scrollWidth > g.clientWidth + 1 : false; })(),
          };
        });
        assert.deepEqual(r, { exercicios: false, calendario: false, atalhos: false, blocos: [], buraco: false }, `${aparelho} ${tema}`);
        assert.deepEqual(await invisiveis(page), []);
        // Rola até o fim: os blocos abaixo da dobra (content-visibility) só são desenhados perto da tela
        for (let y = 0; y < 6000; y += 500) { await page.mouse.wheel(0, 500); await page.waitForTimeout(80); }
        await page.evaluate(() => scrollTo(0, 0));
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${OUT}/painel-paciente-${aparelho}-${tema}.png`, fullPage: true });
        // Ordem no celular: boas-vindas, próxima sessão, evolução da dor, conquistas, sua unidade
        if (aparelho === "celular") {
          const ordem = await page.evaluate(() => ["Olá|Bom dia|Boa tarde|Boa noite", "Próxima sessão", "Evolução da dor", "Conquistas", "Sua unidade"].map((t) => {
            const el = [...document.querySelectorAll("main h1, main h2")].find((h) => new RegExp(t).test(h.textContent));
            return el ? Math.round(el.getBoundingClientRect().top + scrollY) : -1;
          }));
          assert.ok(ordem.every((y) => y >= 0) && ordem.every((y, i) => !i || y > ordem[i - 1]), `ordem no celular ${ordem}`);
        }
        // Mobilidade completa (exercícios, marcar como feito)
        await page.goto(`${BASE}/app/mobilidade`);
        await page.waitForTimeout(1500);
        assert.ok(await page.getByRole("heading", { name: /Exercícios da semana|Exercícios prévios/ }).first().isVisible(), "Mobilidade sem exercícios");
        // Menu (desktop) e barra + "Mais" (celular) dão acesso a Agendar, Troca, Unidades e Perfil
        const links = await page.evaluate(() => [...document.querySelectorAll('nav[aria-label="Principal"] a, nav[aria-label="Abas"] a, nav[aria-label="Abas"] button')].map((a) => a.textContent.trim()));
        for (const l of aparelho === "desktop" ? ["Agendar", "Troca", "Unidades", "Perfil"] : ["Agendar", "Troca", "Mais"]) assert.ok(links.some((x) => x.includes(l)), `${aparelho}: falta ${l} no menu`);
        await ctx.close();
      }
    });

    // 4. Permissões: cada perfil só vê o que é seu (somente leituras)
    await caso("permissões dos 4 perfis seguem iguais", async () => {
      const req = await (await browser.newContext()).request;
      const login = async (p) => { await pace(); const r = await req.post(`${BASE}/api/auth/login`, { data: { email: p.email, password: p.password } }); assert.equal(r.status(), 200, p.email); };
      const status = async (path) => (await req.get(`${BASE}/api${path}`)).status();
      // Outra conta de paciente: o limite é de 8 logins por minuto por e-mail
      await login({ ...PERFIS.paciente, email: "paciente10@exemplo.test" });
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
        await quadros(page, `abas-admin-${aparelho}-${tema}`, [0, 90, 200, 350, 550, 900]);
        await page.getByRole("tab", { name: "Faltas" }).click();
        await page.waitForTimeout(2200);
        await page.getByRole("radio", { name: "30 dias" }).click();
        await quadros(page, `filtro-admin-${aparelho}-${tema}`, [0, 200, 450, 800, 1300, 1800]);
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

  // 6. Rodada 2: tema por revelação circular em todas as telas, cena com mais texto, entrada borrado → nítido
  if (!ONLY_MEASURE && !ONLY_R4) {
    /** Clica no botão de tema visível, captura quadros e confere: círculo aconteceu, tema trocou e ficou salvo. */
    async function tema(page, nome) {
      const antes = await page.evaluate(() => document.documentElement.dataset.theme);
      await page.evaluate(() => {
        window.__vt = false;
        const orig = document.startViewTransition?.bind(document);
        if (orig) document.startViewTransition = (cb) => { window.__vt = document.documentElement.dataset.vt === "theme"; return orig(cb); };
      });
      await page.locator('button[aria-label="Alternar tema claro e escuro"]').locator("visible=true").first().click();
      await quadros(page, `tema-${nome}`, [0, 140, 300, 450, 700]);
      const d = await page.evaluate(() => ({ t: document.documentElement.dataset.theme, vt: window.__vt, salvo: localStorage.getItem("mv-tema"), sobra: document.documentElement.dataset.vt ?? null }));
      assert.notEqual(d.t, antes, `${nome}: tema não trocou`);
      assert.equal(d.vt, true, `${nome}: sem revelação circular`);
      assert.equal(d.salvo, d.t, `${nome}: tema não ficou salvo`);
      assert.equal(d.sobra, null, `${nome}: transição presa`);
    }
    for (const [aparelho, dev, cor] of [["desktop", DESKTOP, "light"], ["celular", CELULAR, "dark"]]) {
      await caso(`tema em todas as telas públicas (${aparelho} ${cor}), sem reiniciar a cena`, async () => {
        const ctx = await contexto(browser, dev, cor, { video: true });
        const page = await ctx.newPage();
        await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
        await page.waitForFunction(() => document.querySelector("[data-scene]")?.classList.contains("is-ready"), null, { timeout: 30000 });
        await tema(page, `publica-topo-${aparelho}`);
        // No meio da cena (quadro de frase): a rolagem e o quadro ficam onde estavam, e o palco não é recriado
        await page.evaluate(() => { const s = document.querySelector("[data-scene]"); scrollTo(0, s.offsetTop + (s.offsetHeight - innerHeight) * 0.37); });
        await page.waitForTimeout(1800);
        await page.evaluate(() => { window.__canvas = document.querySelector("[data-scene-canvas]"); });
        const antes = await page.evaluate(() => ({ y: scrollY, q: document.querySelector(".scene-frame.is-on")?.dataset.frame }));
        await tema(page, `publica-cena-${aparelho}`);
        const depois = await page.evaluate(() => ({ y: scrollY, q: document.querySelector(".scene-frame.is-on")?.dataset.frame, mesmo: window.__canvas === document.querySelector("[data-scene-canvas]"), pronto: document.querySelector("[data-scene]").classList.contains("is-ready") }));
        assert.equal(depois.y, antes.y, "a rolagem pulou");
        assert.equal(depois.q, antes.q, "o quadro da cena mudou");
        assert.ok(depois.mesmo && depois.pronto, "a cena reiniciou");
        // Quadro ativo com rótulo, título, parágrafo e (no computador) tópicos, tudo visível e sem corte
        const q = await page.evaluate(() => {
          const f = document.querySelector(".scene-frame.is-on.scene-phrase");
          if (!f) return null;
          const vis = (el) => !!el && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().height > 0;
          const sub = f.querySelector(".scene-sub");
          return { rotulo: vis(f.querySelector(".scene-label")), titulo: vis(f.querySelector(".scene-text")), texto: vis(sub), topicos: vis(f.querySelector(".scene-points")), cortado: sub.scrollHeight > sub.clientHeight + 1, fs: parseFloat(getComputedStyle(sub).fontSize) };
        });
        assert.ok(q, "nenhum quadro de frase ativo");
        assert.ok(q.rotulo && q.titulo && q.texto && !q.cortado, `quadro incompleto ${JSON.stringify(q)}`);
        if (aparelho === "desktop") { assert.ok(q.topicos, "tópicos ausentes no computador"); assert.ok(q.fs >= 17 && q.fs <= 20, `texto com ${q.fs}px`); }
        else assert.ok(!q.topicos, "tópicos no celular");
        await page.screenshot({ path: `${OUT}/cena-quadro-${aparelho}-${cor}.png` });
        for (const rota of ["/login", "/cadastro", "/recuperar"]) {
          await page.goto(`${BASE}${rota}`);
          await page.waitForTimeout(600);
          await tema(page, `${rota.slice(1)}-${aparelho}`);
        }
        await ctx.close();
      });
      await caso(`tema e entrada borrado → nítido nas telas logadas (${aparelho} ${cor})`, async () => {
        const ctx = await contexto(browser, dev, cor, { video: true });
        const page = await ctx.newPage();
        await entrar(page, PERFIS.paciente);
        await page.waitForTimeout(2200);
        await tema(page, `paciente-${aparelho}`);
        // Troca de tela pelo menu: os blocos entram borrados e ficam nítidos; os números contam junto
        const nav = page.locator(aparelho === "desktop" ? 'nav[aria-label="Principal"] a' : 'nav[aria-label="Abas"] a');
        await nav.nth(1).click();
        await page.waitForURL(/mobilidade/);
        await page.waitForTimeout(800);
        await nav.nth(0).click();
        await page.waitForURL((u) => u.pathname === "/app");
        await quadros(page, `entrada-borrada-paciente-${aparelho}-${cor}`, [0, 120, 260, 420, 650, 1000, 1600]);
        await page.waitForTimeout(800);
        assert.deepEqual(await numerosExatos(page), []);
        assert.deepEqual(await invisiveis(page), []);
        const filtros = await page.evaluate(() => [...document.querySelectorAll("main *")].filter((el) => getComputedStyle(el).filter.includes("blur")).length);
        assert.equal(filtros, 0, "desfoque ficou depois da entrada");
        // Telas simples também entram em cascata e terminam visíveis
        for (const rota of ["/app/perfil", "/app/unidades", "/app/agendar"]) {
          await page.goto(`${BASE}${rota}`);
          await page.waitForTimeout(2000);
          assert.deepEqual(await invisiveis(page), [], rota);
        }
        await tema(page, `perfil-${aparelho}`);
        await ctx.close();
      });
    }
  }

  // 8. Medições comparáveis com a main (as mesmas interações, sem a entrada)
  for (const [aparelho, dev] of [["desktop", DESKTOP], ["celular", CELULAR]]) {
    await caso(`medição ${aparelho}`, async () => {
      const ctx = await contexto(browser, dev, "light");
      const page = await ctx.newPage();
      if (dev === CELULAR) { const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 }); }
      await entrar(page, PERFIS.admin);
      await page.waitForTimeout(1500);
      await perf(page);
      for (const aba of ["Financeiro", "Previsões", "Faltas"]) { await page.getByRole("tab", { name: aba }).click(); await page.waitForTimeout(1800); }
      for (const per of ["30 dias", "90 dias", "6 meses"]) { await page.getByRole("radio", { name: per }).click(); await page.waitForTimeout(1800); }
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
