import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DEFAULT_EXERCISES, YOUTUBE_URL } from "@/lib/exercicios";
import { FIXED_PHRASE, GenericExercises, type GenericExercise } from "./generic-exercises";

const items = DEFAULT_EXERCISES.map((e, i) => ({ ...e, id: `e${i}`, doneAt: null })) as unknown as GenericExercise[];
const render = (collapsed?: boolean) =>
  renderToStaticMarkup(createElement(QueryClientProvider, { client: new QueryClient() }, createElement(GenericExercises, { items, collapsed })));

describe("Exercícios prévios", () => {
  it("6 exercícios: 3 de mobilidade e 3 de fortalecimento, todos leves", () => {
    expect(DEFAULT_EXERCISES).toHaveLength(6);
    expect(DEFAULT_EXERCISES.filter((e) => e.category === "Mobilidade")).toHaveLength(3);
    expect(DEFAULT_EXERCISES.filter((e) => e.category === "Fortalecimento")).toHaveLength(3);
    expect(DEFAULT_EXERCISES.every((e) => e.level === "Leve" && e.prescription && e.rest && e.region)).toBe(true);
  });

  it("links são URLs válidas do YouTube", () => {
    for (const e of DEFAULT_EXERCISES.filter((x) => x.videoUrl)) expect(e.videoUrl).toMatch(YOUTUBE_URL);
    expect(YOUTUBE_URL.test("https://evil.example/watch?v=bolyL-Q6KPU")).toBe(false);
    expect(YOUTUBE_URL.test("javascript:alert(1)")).toBe(false);
  });

  it("frase fixa, links em nova aba com rel seguro e nenhum iframe ou miniatura", () => {
    for (const html of [render(), render(true)]) {
      expect(html).toContain(FIXED_PHRASE);
      const links = html.match(/<a [^>]*>/g) ?? [];
      expect(links).toHaveLength(DEFAULT_EXERCISES.filter((e) => e.videoUrl).length);
      for (const a of links) {
        expect(a).toContain('target="_blank"');
        expect(a).toContain('rel="noopener noreferrer"');
        expect(a).toMatch(/href="https:\/\/www\.youtube\.com\//);
      }
      expect(html).not.toMatch(/<iframe|<img|ytimg|youtube\.com\/embed/);
      expect(html).toContain("Vídeo de terceiros, apenas como referência geral");
      expect(html).toContain("Pare se sentir dor forte e fale com sua fisioterapeuta");
    }
  });

  it("recolhido quando a fisioterapeuta já passou exercícios", () => {
    expect(render(true)).toMatch(/^<details/);
    expect(render(false)).toMatch(/^<section/);
  });
});
