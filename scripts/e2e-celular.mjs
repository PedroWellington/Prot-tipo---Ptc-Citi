// Celular na cena de abertura: cabeçalho sempre visível, nada cortado, subtextos inteiros, quadros sem sobreposição,
// hero íntegro depois de ir e voltar, sem rolagem lateral, botões do tamanho certo.
// Uso (com o app rodando e o Chrome instalado):  npm run e2e:celular      BASE=http://localhost:3000 por padrão
// Só navega a página pública: não entra em conta nem grava nada.
import assert from "node:assert/strict";
import { chromium, devices } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:3000";
const APARELHOS = [
  ["Pixel 7", devices["Pixel 7"], "light"],
  ["iPhone 14", devices["iPhone 14"], "dark"],
  ["360x640", { viewport: { width: 360, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, "dark"],
  ["430x932", { viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, "light"],
];

/** Uma amostra da tela: tudo o que precisa valer em qualquer ponto da rolagem. */
const amostra = () => {
  const vw = visualViewport.width, vh = visualViewport.height;
  const h = document.querySelector(".site-header");
  const alvos = [h.querySelector(".logo-shrink"), ...h.querySelectorAll("button, a.btn")].filter((el) => {
    const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
    return r.width > 0 && cs.visibility !== "hidden" && cs.display !== "none" && !el.closest("[inert], #menu-site, .header-extra");
  });
  const cobertos = alvos.filter((el) => {
    const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return r.top < 0 || r.bottom > 72 + (parseFloat(getComputedStyle(h).paddingTop) || 0) || !(hit && (hit === el || el.contains(hit)));
  }).map((el) => el.textContent.trim() || el.getAttribute("aria-label"));
  const op = (el) => Number(getComputedStyle(el).opacity);
  const visiveis = [...document.querySelectorAll(".scene-frame")].filter((f) => [...f.querySelectorAll(".scene-item, .scene-word, .scene-sub")].some((x) => op(x) > 0.1)).map((f) => f.dataset.frame);
  const fora = [...document.querySelectorAll(".scene-frame .scene-item, .scene-frame .scene-word, .scene-frame .scene-sub, .scene-hint")]
    .filter((x) => op(x) > 0.9).filter((x) => { const r = x.getBoundingClientRect(); return r.left < -0.5 || r.right > vw + 0.5 || r.top < -0.5 || r.bottom > vh + 0.5; })
    .map((x) => x.textContent.trim().slice(0, 30));
  const truncados = [...document.querySelectorAll(".scene-sub")].filter((s) => s.scrollHeight > s.clientHeight + 1 || getComputedStyle(s).webkitLineClamp !== "none").length;
  return {
    headerTop: Math.round(h.getBoundingClientRect().top), cobertos, visiveis, fora, truncados,
    lateral: document.documentElement.scrollWidth > innerWidth + 1 || Math.abs(innerWidth - vw) > 1 || Math.abs(innerHeight - vh) > 1,
  };
};

const browser = await chromium.launch({ channel: "chrome", args: ["--ignore-gpu-blocklist"] });
let falhas = 0;
try {
  for (const [nome, d, tema] of APARELHOS) {
    const W = d.viewport.width, H = d.viewport.height, Hbarra = Math.round(H * 0.87);
    const ctx = await browser.newContext({ viewport: { width: W, height: Hbarra }, deviceScaleFactor: d.deviceScaleFactor, isMobile: true, hasTouch: true });
    await ctx.addInitScript((t) => { try { localStorage.setItem("mv-tema", t); sessionStorage.setItem("mv-intro", "1"); } catch {} }, tema);
    const page = await ctx.newPage();
    const caso = `${nome} ${tema}`;
    try {
      await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => document.querySelector("[data-scene]")?.classList.contains("is-ready"), null, { timeout: 30000 });
      await page.waitForTimeout(600);
      const inicio = await page.evaluate(() => ({ cta: document.querySelector(".scene-hero .btn-brand").getBoundingClientRect().toJSON(), hint: document.querySelector("[data-scene-hint]").getBoundingClientRect().toJSON(), vh: visualViewport.height, vw: visualViewport.width }));
      // Botões: 48 px de altura, mesma largura, 20 px ou mais entre eles, aviso a 16 px ou mais da base
      assert.ok(inicio.cta.height >= 47.5 && inicio.hint.height >= 47.5, `${caso}: altura dos botões ${JSON.stringify([inicio.cta.height, inicio.hint.height])}`);
      assert.ok(Math.abs(inicio.cta.width - inicio.hint.width) < 1, `${caso}: larguras diferentes`);
      assert.ok(inicio.hint.top - inicio.cta.bottom >= 20, `${caso}: botão e aviso próximos demais (${inicio.hint.top - inicio.cta.bottom}px)`);
      assert.ok(inicio.vh - inicio.hint.bottom >= 16, `${caso}: aviso colado na base`);
      assert.ok(inicio.cta.left >= 16 && inicio.cta.right <= inicio.vw - 16, `${caso}: botão fora da margem`);

      // Rola a cena inteira em passos curtos, alternando a altura da barra do navegador
      const total = await page.evaluate(() => { const s = document.querySelector("[data-scene]"); return s.getBoundingClientRect().bottom + scrollY; });
      let y = 0, i = 0, max = 0;
      while (y < total) {
        y += Math.round(H / 14);
        await page.evaluate((v) => scrollTo(0, v), y);
        if (++i % 9 === 0) await page.setViewportSize({ width: W, height: i % 18 === 0 ? Hbarra : H });
        await page.waitForTimeout(70);
        const a = await page.evaluate(amostra);
        max = Math.max(max, a.visiveis.length);
        const msg = `${caso} y=${y}: ${JSON.stringify(a)}`;
        assert.equal(a.headerTop, 0, msg);
        assert.deepEqual(a.cobertos, [], msg);
        assert.ok(a.visiveis.length <= 1, msg);
        assert.deepEqual(a.fora, [], msg);
        assert.equal(a.truncados, 0, msg);
        assert.ok(!a.lateral, msg);
      }
      assert.ok(max === 1, `${caso}: nenhuma frase apareceu ao rolar`);
      // Volta rápida ao topo, duas vezes: o hero fica idêntico ao do primeiro carregamento
      for (let k = 0; k < 2; k++) {
        for (const v of [total * 0.6, total * 0.3, 0]) { await page.evaluate((t) => scrollTo(0, t), v); await page.waitForTimeout(90); }
        await page.evaluate((t) => scrollTo(0, t), total);
        await page.waitForTimeout(200);
      }
      await page.evaluate(() => scrollTo(0, 0));
      await page.waitForTimeout(1400);
      const hero = await page.evaluate(() => ({
        itens: [...document.querySelectorAll(".scene-hero .scene-item")].map((e) => { const cs = getComputedStyle(e); const r = e.getBoundingClientRect(); return { tr: cs.transform, op: cs.opacity, l: r.left, r: r.right }; }),
        cta: document.querySelector(".scene-hero .btn-brand").getBoundingClientRect().toJSON(), hint: document.querySelector("[data-scene-hint]").getBoundingClientRect().toJSON(), vw: visualViewport.width,
        aviso: getComputedStyle(document.querySelector("[data-scene-hint]")).opacity,
      }));
      for (const it of hero.itens) {
        assert.equal(it.tr, "none", `${caso}: hero com deslocamento ${JSON.stringify(it)}`);
        assert.equal(it.op, "1", `${caso}: hero transparente`);
        assert.ok(it.l >= 15.5 && it.r <= hero.vw - 15.5, `${caso}: hero cortado na borda ${JSON.stringify(it)}`);
      }
      // A altura da tela pode ter mudado (barra do navegador): confere o arranjo, não a posição absoluta
      assert.ok(hero.hint.top - hero.cta.bottom >= 20, `${caso}: depois de voltar, botão e aviso próximos demais`);
      assert.ok(hero.cta.left >= 15.5 && hero.cta.right <= hero.vw - 15.5 && Math.abs(hero.cta.width - inicio.cta.width) < 1, `${caso}: botão mudou depois de voltar`);
      assert.equal(hero.aviso, "1", `${caso}: aviso não voltou no topo`);
      console.log(`✓ ${caso}`);
    } catch (e) {
      falhas++;
      console.error(`✗ ${caso}\n  ${e.message.split("\n").slice(0, 3).join(" ")}`);
    } finally {
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
process.exit(falhas ? 1 : 0);
