"use client";

import { Check, Circle, Eye, EyeOff } from "lucide-react";
import { useState, type ComponentProps } from "react";
import { PASSWORD_MAX, PASSWORD_RULES } from "@/lib/password";
import { cx, Field } from "./ui";

/** Campo de senha com olho. Cada campo guarda o próprio estado, então os dois alternam de forma independente. */
export function PasswordInput({ label, error, hint, ...p }: Omit<ComponentProps<"input">, "type"> & { label: string; error?: string; hint?: string }) {
  const [visible, setVisible] = useState(false);
  const Icon = visible ? EyeOff : Eye;
  return (
    <Field label={label} error={error} hint={hint}>
      {(id, describedBy) => (
        <div className="relative">
          <input {...p} id={id} type={visible ? "text" : "password"} autoCapitalize="none" autoCorrect="off" spellCheck={false}
            aria-describedby={describedBy} aria-invalid={!!error} className="field pr-12" />
          <button type="button" onClick={() => setVisible(!visible)} aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
            className="absolute top-1/2 right-0.5 flex size-11 -translate-y-1/2 items-center justify-center rounded-full text-ink-2">
            <Icon strokeWidth={1.5} className="size-5" />
          </button>
        </div>
      )}
    </Field>
  );
}

export type NewPassword = { password: string; confirm: string };

/** Senha e confirmação com requisitos ao vivo. O pai guarda o valor e decide o botão com passwordReady. */
export function NewPasswordFields({ value, onChange, label = "Senha", error }: { value: NewPassword; onChange: (v: NewPassword) => void; label?: string; error?: string }) {
  const { password, confirm } = value;
  const matches = !!confirm && password === confirm;
  return (
    <>
      <PasswordInput label={label} name="password" autoComplete="new-password" required maxLength={PASSWORD_MAX} value={password} error={error}
        onChange={(e) => onChange({ ...value, password: e.target.value })} />
      <ul className="flex flex-col gap-1 text-sm" aria-label="Requisitos da senha">
        {PASSWORD_RULES.map((r) => {
          const ok = r.test(password);
          const Icon = ok ? Check : Circle;
          return (
            <li key={r.id} className={cx("flex items-center gap-2", ok ? "font-medium text-ok" : "text-ink-3")}>
              <Icon strokeWidth={ok ? 2.5 : 1.5} aria-hidden className="size-4 shrink-0" />
              {r.label}<span className="sr-only">{ok ? ": cumprido" : ": pendente"}</span>
            </li>
          );
        })}
      </ul>
      <PasswordInput label="Confirmar senha" name="confirm" autoComplete="new-password" required maxLength={PASSWORD_MAX} value={confirm}
        error={confirm && !matches ? "As senhas não coincidem" : undefined}
        onChange={(e) => onChange({ ...value, confirm: e.target.value })} />
      {matches && <p role="status" className="-mt-2 flex items-center gap-2 text-sm font-medium text-ok"><Check strokeWidth={2.5} aria-hidden className="size-4" />As senhas coincidem</p>}
    </>
  );
}
