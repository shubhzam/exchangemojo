import type { ComponentProps, ReactNode } from "react";

// shared building blocks. every color comes from the theme tokens in
// app/globals.css.

export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

export function Panel({ className, ...props }: ComponentProps<"section">) {
  return <section className={cx("flex flex-col rounded-md border border-border bg-panel", className)} {...props} />;
}

export function PanelHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
      <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">{title}</h2>
      {children}
    </header>
  );
}

export const primaryButton =
  "inline-flex items-center justify-center rounded px-4 py-2 text-sm font-semibold bg-accent text-bg hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50";

export const secondaryButton =
  "inline-flex items-center justify-center rounded border border-border bg-raised px-2.5 py-1 text-xs text-text hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50";

export const inputClass =
  "w-full rounded border border-border bg-raised px-3 py-2 text-sm text-text placeholder:text-muted focus:border-accent";

export function InlineError({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="rounded border border-accent/40 bg-accent-soft px-3 py-2 text-xs text-text">
      {children}
    </p>
  );
}
