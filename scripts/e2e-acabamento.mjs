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
const ONLY_R3 = process.env.SO === "rodada3";
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

async function entrar(page, perfil, { frames, fpsOut } = {}) {
  await pace();
  await page.goto(`${BASE}/login`);
  await page.waitForTimeout(1200); // o portal aquece no ocioso depois da primeira pintura
  await vigiaVeu(page);
  await page.getByLabel("E-mail").fill(perfil.email);
  await page.getByLabel("Senha", { exact: true }).fill(perfil.password);
  await page.getByRole("button", { name: "Entrar" }).click();
  const t0 = Date.now();
  // FPS do portal: o mesmo documento do clique ao fim (navegação do cliente)
  if (fpsOut) fps(page, 1100).then((v) => { fpsOut.v = v; }, () => {});
  // Quadros desde o clique: dissolver, juntar, (respirar), explodir
  if (frames) await quadros(page, frames, [0, 120, 260, 420, 600, 800, 1000, 1250]);
  await page.waitForURL((u) => u.pathname.startsWith(perfil.home), { timeout: 20000 });
  // A entrada termina sozinha (sem espera artificial): o véu some e o atributo sai
  await page.waitForFunction(() => !document.documentElement.dataset.portal, null, { timeout: 15000 });
  return Date.now() - t0;
}

/** Tempos das fases da última execução do portal (ms desde o clique, relógio da página). */
const fases = (page) => page.evaluate(() => globalThis.__portal ?? null);
/** Enquanto o portal está ligado, o véu só tem o fundo e o canvas de partículas (nunca "M" solto nem disco liso). */
async function vigiaVeu(page) {
  await page.evaluate(() => {
    window.__veu = { marcador: false, canvas: false, ligado: false };
    const id = setInterval(() => {
      const d = document.documentElement;
      if (d.dataset.portal !== "on" && d.dataset.portal !== "burst") return;
      const v = document.querySelector("[data-entry-veil]");
      window.__veu.ligado = true;
      if (v.querySelector("svg, img, .entry-mark")) window.__veu.marcador = true;
      if (v.querySelector("canvas")) window.__veu.canvas = true;
    }, 16);
    setTimeout(() => clearInterval(id), 20000);
  });
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
  if (!ONLY_MEASURE && !ONLY_R2 && !ONLY_R3) {
    // 1. Entrada nos 4 perfis: desktop claro e celular escuro (com vídeo), e o contrário para os prints
    for (const [nome, perfil] of Object.entries(PERFIS)) {
      for (const [aparelho, dev, tema] of [["desktop", DESKTOP, "light"], ["celular", CELULAR, "dark"]]) {
        await caso(`${nome} ${aparelho} ${tema}: entrada com explosão, sem conteúdo invisível`, async () => {
          const ctx = await contexto(browser, dev, tema, { video: true });
          const page = await ctx.newPage();
          const fpsOut = {};
          await entrar(page, perfil, { frames: `entrada-${nome}-${aparelho}-${tema}`, fpsOut });
          const quadrosSeg = fpsOut.v;
          const f = await fases(page);
          const veu = await page.evaluate(() => window.__veu);
          assert.ok(veu.ligado && veu.canvas && !veu.marcador, `véu sem partículas ou com marcador: ${JSON.stringify(veu)}`);
          assert.ok(f?.juntou && f?.explosao && f?.fim, `fases incompletas ${JSON.stringify(f)}`);
          medidas.push({ caso: `portal ${nome} ${aparelho}`, ...f, "FPS (rAF)": quadrosSeg });
          await page.waitForTimeout(2200);
          assert.deepEqual(await numerosExatos(page), []);
          assert.deepEqual(await invisiveis(page), []);
          await page.screenshot({ path: `${OUT}/tela-${nome}-${aparelho}-${tema}.png` });
          // Recarregar já logado: sem véu
          await page.reload();
          assert.equal(await page.evaluate(() => document.documentElement.dataset.portal ?? null), null, "portal ao recarregar");
          // Trocar de aba pelo menu: sem véu
          const link = page.locator(aparelho === "desktop" ? 'nav[aria-label="Principal"] a' : 'nav[aria-label="Abas"] a').nth(1);
          await link.click();
          await page.waitForTimeout(150);
          assert.equal(await page.evaluate(() => document.documentElement.dataset.portal ?? null), null, "portal ao trocar de aba");
          await ctx.close();
        });
      }
      // Prints no tema oposto de cada aparelho
      for (const [aparelho, dev, tema] of [["desktop", DESKTOP, "dark"], ["celular", CELULAR, "light"]]) {
        await caso(`${nome} ${aparelho} ${tema}: print`, async () => {
          const ctx = await contexto(browser, dev, tema);
          const page = await ctx.newPage();
          // Sem capturas no meio (elas atrasam a animação): esta é a duração real
          // Sem capturas no meio (elas atrasam a animação): estes são os tempos reais das fases
          await entrar(page, perfil);
          medidas.push({ caso: `portal ${nome} ${aparelho} (sem capturas)`, ...(await fases(page)) });
          await page.waitForTimeout(2200);
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
      await pace();
      await page.goto(`${BASE}/login`);
      await page.getByLabel("E-mail").fill(PERFIS.paciente.email);
      await page.getByLabel("Senha", { exact: true }).fill(DEMO);
      await page.waitForTimeout(1200);
      await page.getByRole("button", { name: "Entrar" }).click();
      await page.waitForFunction(() => document.documentElement.dataset.portal === "on", null, { timeout: 5000 });
      await page.mouse.click(700, 450);
      await page.waitForURL((u) => u.pathname.startsWith("/app"));
      await page.waitForFunction(() => !document.documentElement.dataset.portal, null, { timeout: 15000 });
      // Pulou: a explosão sai assim que o painel está pronto (sem esperar a esfera terminar de se juntar)
      const f = await fases(page);
      assert.ok(f.pulo !== undefined && f.explosao - Math.max(f.pronto ?? 0, f.pulo) <= 150, `não pulou: ${JSON.stringify(f)}`);
      await ctx.close();
    });
    await caso("menos movimento: sem véu nem partículas, conteúdo visível", async () => {
      const ctx = await contexto(browser, CELULAR, "light", { reduce: true });
      const page = await ctx.newPage();
      await pace();
      await page.goto(`${BASE}/login`);
      await page.getByLabel("E-mail").fill(PERFIS.recepcao.email);
      await page.getByLabel("Senha", { exact: true }).fill(DEMO);
      await page.getByRole("button", { name: "Entrar" }).click();
      await page.waitForURL((u) => u.pathname.startsWith("/recepcao"));
      const estado = await page.evaluate(() => ({ e: document.documentElement.dataset.portal ?? null, canvas: !!document.querySelector(".entry-canvas"), veu: getComputedStyle(document.querySelector("[data-entry-veil]")).display }));
      assert.notEqual(estado.e, "on");
      assert.equal(estado.canvas, false);
      assert.equal(estado.veu, "none");
      await page.waitForTimeout(500);
      assert.deepEqual(await numerosExatos(page), []);
      assert.deepEqual(await invisiveis(page), []);
      await ctx.close();
    });

    // 3. Saída em partículas e "Minha área" (já logado) vindo da página pública: roda a mesma sequência, sem novo login
    await caso("Sair → partículas se juntam e explodem, a página inicial abre íntegra; Minha área roda o portal", async () => {
      const ctx = await contexto(browser, DESKTOP, "dark", { video: true });
      const page = await ctx.newPage();
      await page.goto(`${BASE}/login`);
      await page.waitForTimeout(1200);
      await entrar(page, PERFIS.fisio);
      await page.waitForTimeout(1500); // o portal de saída aquece no ocioso
      await page.getByRole("button", { name: "Sair" }).first().click();
      await quadros(page, "saida-fisio-desktop-escuro", [0, 150, 300, 450, 650, 800]);
      await page.waitForURL(`${BASE}/`);
      await page.waitForFunction(() => document.querySelector("[data-scene]")?.classList.contains("is-ready"), null, { timeout: 20000 });
      await page.screenshot({ path: `${OUT}/saida-chegada-desktop-escuro.png` });
      const inicio = await page.evaluate(() => ({ portal: document.documentElement.dataset.portal ?? null, hero: !!document.querySelector(".scene-hero h1")?.getBoundingClientRect().height, cabecalho: !!document.querySelector(".site-header"), botao: !!document.querySelector(".scene-hero .btn-brand") }));
      assert.deepEqual(inicio, { portal: null, hero: true, cabecalho: true, botao: true });
      // Logado de novo: "Minha área" no topo da página inicial (esfera visível) roda o portal até a agenda
      await page.goto(`${BASE}/login`);
      await page.waitForTimeout(1000);
      await entrar(page, PERFIS.fisio);
      await page.goto(`${BASE}/`);
      await page.waitForFunction(() => document.querySelector("[data-scene]")?.classList.contains("is-ready"), null, { timeout: 20000 });
      await page.waitForTimeout(800);
      await vigiaVeu(page);
      await page.getByRole("link", { name: "Minha área" }).first().click();
      await quadros(page, "minha-area-topo-desktop-escuro", [0, 120, 260, 420, 600, 800, 1000]);
      await page.waitForURL((u) => u.pathname.startsWith("/fisio"));
      await page.waitForFunction(() => !document.documentElement.dataset.portal, null, { timeout: 15000 });
      const veu = await page.evaluate(() => window.__veu);
      assert.ok(veu.ligado && veu.canvas && !veu.marcador, `Minha área sem portal: ${JSON.stringify(veu)}`);
      await ctx.close();
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
  if (!ONLY_MEASURE && !ONLY_R3) {
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

  // 7. Rodada 3: portal de partículas a partir de todos os pontos de entrada
  if (!ONLY_MEASURE && (ONLY_R3 || !ONLY_R2)) {
    /** Login só por API (sem portal), para os casos que começam já logados. */
    const loginApi = async (ctx, perfil) => { await pace(); const r = await ctx.request.post(`${BASE}/api/auth/login`, { data: { email: perfil.email, password: perfil.password } }); assert.equal(r.status(), 200); };
    const cenaPronta = (page) => page.waitForFunction(() => document.querySelector("[data-scene]")?.classList.contains("is-ready"), null, { timeout: 20000 });
    const fimPortal = (page) => page.waitForFunction(() => !document.documentElement.dataset.portal, null, { timeout: 15000 });
    const veuOk = async (page, nome) => { const v = await page.evaluate(() => window.__veu); assert.ok(v.ligado && v.canvas && !v.marcador, `${nome}: ${JSON.stringify(v)}`); };

    await caso("cena: Minha área no meio de cada forma, na explosão entre formas e nas seções normais", async () => {
      const ctx = await contexto(browser, DESKTOP, "light", { video: true });
      await loginApi(ctx, PERFIS.recepcao);
      const page = await ctx.newPage();
      // Progresso da rolagem: coluna, figura, joelho, anel, esfera final e a explosão entre coluna e figura
      const pontos = [["coluna", 0.19], ["figura", 0.37], ["articulacao", 0.55], ["anel", 0.74], ["esfera-final", 0.97], ["explosao-entre-formas", 0.28]];
      for (const [nome, p] of pontos) {
        await page.goto(`${BASE}/`);
        await cenaPronta(page);
        await page.evaluate((p) => { const s = document.querySelector("[data-scene]"); scrollTo(0, s.offsetTop + (s.offsetHeight - innerHeight) * p); }, p);
        await page.waitForTimeout(1600);
        await vigiaVeu(page);
        await page.locator(".site-header").getByRole("link", { name: "Minha área" }).locator("visible=true").first().click();
        if (nome === "figura" || nome === "explosao-entre-formas") await quadros(page, `cena-${nome}-desktop-claro`, [0, 120, 260, 420, 600, 800, 1000]);
        await page.waitForURL((u) => u.pathname.startsWith("/recepcao"));
        await fimPortal(page);
        const f = await fases(page);
        assert.ok(f.morph !== undefined, `${nome}: deveria transformar a forma da cena (${JSON.stringify(f)})`);
        await veuOk(page, nome);
        medidas.push({ caso: `portal cena ${nome}`, ...f });
      }
      // Seções normais (menu completo): sem canvas à vista, as partículas nascem no botão
      for (const id of ["clinica", "especialidades", "espaco", "sistema", "equipe", "unidades", "contato"]) {
        await page.goto(`${BASE}/#${id}`);
        await page.waitForTimeout(1500);
        await vigiaVeu(page);
        await page.locator(".site-header").getByRole("link", { name: "Minha área" }).locator("visible=true").first().click();
        if (id === "equipe") await quadros(page, "secao-equipe-desktop-claro", [0, 120, 260, 420, 600, 800, 1000]);
        await page.waitForURL((u) => u.pathname.startsWith("/recepcao"));
        await fimPortal(page);
        const f = await fases(page);
        assert.ok(f.nasce !== undefined || f.morph !== undefined, `${id}: ${JSON.stringify(f)}`);
        await veuOk(page, id);
      }
      await ctx.close();
    });

    await caso("Agendar tratamento (sem conta logada) → login → portal termina em Agendar", async () => {
      const ctx = await contexto(browser, DESKTOP, "dark");
      const page = await ctx.newPage();
      await page.goto(`${BASE}/`);
      await page.getByRole("link", { name: "Agendar tratamento" }).first().click();
      await page.waitForURL((u) => u.pathname === "/login");
      await page.waitForTimeout(1200);
      await vigiaVeu(page);
      await pace();
      await page.getByLabel("E-mail").fill("paciente11@exemplo.test");
      await page.getByLabel("Senha", { exact: true }).fill(DEMO);
      await page.getByRole("button", { name: "Entrar" }).click();
      await page.waitForURL((u) => u.pathname === "/app/agendar", { timeout: 20000 });
      await fimPortal(page);
      await veuOk(page, "agendar");
      await ctx.close();
    });

    await caso("login com senha errada: o portal se desfaz, o formulário fica livre e mostra o erro", async () => {
      const ctx = await contexto(browser, DESKTOP, "light");
      const page = await ctx.newPage();
      await page.goto(`${BASE}/login`);
      await page.waitForTimeout(1200);
      await pace();
      await page.getByLabel("E-mail").fill("paciente12@exemplo.test");
      await page.getByLabel("Senha", { exact: true }).fill("senha-errada-123");
      await page.getByRole("button", { name: "Entrar" }).click();
      await page.getByRole("alert").waitFor({ timeout: 8000 });
      await quadros(page, "login-falha-desktop-claro", [0, 150, 350]);
      await page.waitForFunction(() => !document.documentElement.dataset.portal, null, { timeout: 2000 });
      const estado = await page.evaluate(() => ({ url: location.pathname, email: document.querySelector('input[name="email"]').value, veu: getComputedStyle(document.querySelector("[data-entry-veil]")).display, filtro: getComputedStyle(document.body.firstElementChild).filter }));
      assert.deepEqual(estado, { url: "/login", email: "paciente12@exemplo.test", veu: "none", filtro: "none" });
      // O formulário responde de novo
      await page.getByLabel("Senha", { exact: true }).fill("x");
      await ctx.close();
    });

    await caso("duplo clique, voltar do navegador e recarregar no meio não travam nem repetem", async () => {
      const ctx = await contexto(browser, DESKTOP, "dark");
      await loginApi(ctx, PERFIS.paciente);
      const page = await ctx.newPage();
      await page.goto(`${BASE}/`);
      await cenaPronta(page);
      await page.waitForTimeout(600);
      await page.locator(".site-header").getByRole("link", { name: "Minha área" }).locator("visible=true").first().dblclick();
      await page.waitForURL((u) => u.pathname.startsWith("/app"));
      await fimPortal(page);
      assert.equal(await page.evaluate(() => globalThis.__portalRuns), 1, "duplo clique rodou duas vezes");
      // Voltar logo depois de entrar: a página inicial íntegra, sem portal preso
      await page.goBack();
      await page.waitForURL(`${BASE}/`);
      await page.waitForTimeout(800);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.portal ?? null), null);
      assert.ok(await page.locator(".scene-hero h1").isVisible());
      // Recarregar no meio da transição: a página abre normal, sem véu
      await page.locator(".site-header").getByRole("link", { name: "Minha área" }).locator("visible=true").first().click();
      await page.waitForTimeout(250);
      await page.reload();
      await page.waitForTimeout(800);
      assert.equal(await page.evaluate(() => document.documentElement.dataset.portal ?? null), null, "véu preso depois de recarregar");
      await ctx.close();
    });

    await caso("conexão lenta: a esfera respira até o painel ficar pronto, sem tela vazia", async () => {
      const ctx = await contexto(browser, DESKTOP, "light", { video: true });
      await loginApi(ctx, PERFIS.paciente);
      const page = await ctx.newPage();
      await page.goto(`${BASE}/`);
      await cenaPronta(page);
      await page.waitForTimeout(600);
      const cdp = await ctx.newCDPSession(page);
      await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 900, downloadThroughput: 60_000, uploadThroughput: 30_000 });
      await vigiaVeu(page);
      await page.locator(".site-header").getByRole("link", { name: "Minha área" }).locator("visible=true").first().click();
      await quadros(page, "rede-lenta-desktop-claro", [0, 400, 900, 1500, 2200]);
      await page.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 30000 });
      await page.waitForFunction(() => !document.documentElement.dataset.portal, null, { timeout: 30000 });
      const f = await fases(page);
      assert.ok(f.respiro !== undefined, `não respirou na rede lenta: ${JSON.stringify(f)}`);
      await veuOk(page, "rede lenta");
      medidas.push({ caso: "portal rede lenta", ...f });
      await ctx.close();
    });

    for (const [nome, dev] of [["Pixel 7", devices["Pixel 7"]], ["iPhone 14", devices["iPhone 14"]], ["360px", { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }], ["430px", { viewport: { width: 430, height: 812 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }]]) {
      await caso(`celular ${nome}: Minha área no topo e no meio da cena`, async () => {
        const ctx = await contexto(browser, dev, "dark");
        await loginApi(ctx, PERFIS.fisio);
        const page = await ctx.newPage();
        for (const p of [0, 0.37]) {
          await page.goto(`${BASE}/`);
          await cenaPronta(page);
          await page.evaluate((p) => { const s = document.querySelector("[data-scene]"); scrollTo(0, p ? s.offsetTop + (s.offsetHeight - innerHeight) * p : 0); }, p);
          await page.waitForTimeout(1500);
          await vigiaVeu(page);
          await page.locator(".site-header").getByRole("link", { name: "Minha área" }).locator("visible=true").first().tap();
          if (nome === "Pixel 7") await quadros(page, `celular-${p ? "cena" : "topo"}-pixel7-escuro`, [0, 150, 350, 550, 800, 1100]);
          await page.waitForURL((u) => u.pathname.startsWith("/fisio"));
          await fimPortal(page);
          await veuOk(page, `${nome} ${p}`);
        }
        await ctx.close();
      });
    }

    await caso("20 entradas seguidas (cache limpo e quente): nunca círculo liso nem 'M' solto", async () => {
      const contas = ["paciente13@exemplo.test", "paciente14@exemplo.test", "paciente15@exemplo.test", "paciente16@exemplo.test"];
      let quente = null;
      for (let i = 0; i < 20; i++) {
        const limpo = i % 2 === 0;
        const ctx = limpo || !quente ? await contexto(browser, i % 4 < 2 ? DESKTOP : CELULAR, i % 3 ? "light" : "dark") : quente;
        if (!limpo) quente = null; else quente = ctx;
        const page = await ctx.newPage();
        await page.goto(`${BASE}/login`);
        await page.waitForTimeout(limpo ? 1500 : 600);
        await vigiaVeu(page);
        await pace();
        await page.getByLabel("E-mail").fill(contas[i % contas.length]);
        await page.getByLabel("Senha", { exact: true }).fill(DEMO);
        await page.getByRole("button", { name: "Entrar" }).click();
        await page.waitForURL((u) => u.pathname.startsWith("/app"), { timeout: 20000 });
        await fimPortal(page);
        await veuOk(page, `entrada ${i + 1}`);
        await ctx.clearCookies();
        await page.close();
        if (!quente) await ctx.close();
      }
    });
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
