"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { buscarBairros, type Bairro } from "@/lib/bairros";
import { cx, Field } from "./ui";

let cache: Promise<Bairro[]> | undefined;

/** O arquivo de bairros vira um chunk próprio: só baixa quando alguma tela precisa dele. */
export const loadBairros = () =>
  (cache ??= import("../../data/bairros-recife.json").then((m) => m.default.bairros as unknown as Bairro[]));

export function useBairros() {
  const [lista, setLista] = useState<Bairro[]>([]);
  useEffect(() => { void loadBairros().then(setLista); }, []);
  return lista;
}

/** Autocompletar de bairro. Com `name`, participa do FormData do formulário. */
export function BairroInput({ label = "Bairro", name, defaultValue = "", error, hint, onPick }: {
  label?: string; name?: string; defaultValue?: string; error?: string; hint?: string; onPick?: (b: Bairro) => void;
}) {
  const lista = useBairros();
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listId = useId();
  const options = useMemo(() => (open ? buscarBairros(lista, value) : []), [lista, value, open]);

  const pick = (b: Bairro) => {
    setValue(b.nome);
    setOpen(false);
    onPick?.(b);
  };

  return (
    <Field label={label} error={error} hint={hint}>
      {(id, describedBy) => (
        <div className="relative">
          <input id={id} name={name} value={value} autoComplete="off" role="combobox" aria-expanded={open && !!options.length} aria-controls={listId}
            aria-autocomplete="list" aria-describedby={describedBy} aria-invalid={!!error} className="field"
            aria-activedescendant={open && options[active] ? `${listId}-${active}` : undefined}
            onChange={(e) => { setValue(e.target.value); setOpen(true); setActive(0); }}
            onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
            onKeyDown={(e) => {
              if (!open || !options.length) return;
              if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => (a + 1) % options.length); }
              if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => (a - 1 + options.length) % options.length); }
              if (e.key === "Enter") { e.preventDefault(); pick(options[active]); }
              if (e.key === "Escape") setOpen(false);
            }} />
          {open && !!options.length && (
            <ul id={listId} role="listbox" className="absolute inset-x-0 top-full z-40 mt-1 max-h-64 overflow-y-auto rounded-xl border border-line-strong bg-surface py-1 shadow-xl">
              {options.map((b, i) => (
                <li key={b.nome} id={`${listId}-${i}`} role="option" aria-selected={i === active}
                  // mouseDown: o clique precisa vencer o blur do campo
                  onMouseDown={(e) => { e.preventDefault(); pick(b); }}
                  className={cx("flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3.5", i === active && "bg-accent-soft")}>
                  <span>{b.nome}</span>
                  <span className="text-xs text-ink-3">RPA {b.rpa}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </Field>
  );
}
