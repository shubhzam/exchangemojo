"use client";

import { useEffect, useRef, useState } from "react";
import { useActiveAccount } from "@/hooks/use-active-account";
import { describeApiError } from "@/lib/api/client";
import { useCreateAccountMutation, useLazyGetAccountQuery } from "@/lib/api/exchange-api";
import { ASSETS, DEFAULT_STARTING_BALANCES, type Asset } from "@/lib/config/markets";
import { accountAdded, accountRemoved, accountSelected } from "@/lib/store/prefs-slice";
import { useAppDispatch, useAppSelector } from "@/lib/store/store";
import { InlineError, cx, inputClass, primaryButton, secondaryButton } from "./ui";

// no auth: accounts are {label, id} pairs kept in localStorage. ids are sent
// as X-Account-Id. new accounts are funded through the existing optional
// `balances` field of POST /api/v1/accounts.

const BALANCE_RE = /^\d{1,10}(\.\d{1,8})?$/;

function shortId(id: string): string {
  return id.length > 14 ? `${id.slice(0, 8)}...${id.slice(-4)}` : id;
}

export function AccountSwitcher() {
  const dispatch = useAppDispatch();
  const accounts = useAppSelector((s) => s.prefs.accounts);
  const active = useActiveAccount();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative" data-testid="account-switcher">
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        data-testid="account-switcher-toggle"
        className="flex items-center gap-2 rounded border border-border bg-raised px-3 py-1.5 text-sm text-text hover:border-accent"
      >
        <span className="text-muted">Account</span>
        <span className="font-medium">{active ? active.label : "None"}</span>
        {active && <span className="text-xs text-muted num">{shortId(active.id)}</span>}
        <span aria-hidden className="text-muted">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Accounts"
          data-testid="account-panel"
          className="absolute top-full right-0 z-20 mt-2 flex w-[400px] flex-col gap-4 rounded-md border border-border bg-panel p-3 shadow-2xl shadow-black"
        >
          <section className="flex flex-col gap-1">
            <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Accounts</h3>
            {accounts.length === 0 ? (
              <p className="py-2 text-xs text-muted">No accounts yet. Create one below or paste an id.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {accounts.map((a) => {
                  const isActive = a.id === active?.id;
                  return (
                    <li key={a.id} className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => dispatch(accountSelected(a.id))}
                        aria-pressed={isActive}
                        className={cx(
                          "flex flex-1 items-center justify-between rounded border px-2.5 py-1.5 text-left text-sm",
                          isActive
                            ? "border-accent bg-accent-soft text-accent"
                            : "border-border bg-raised text-text hover:border-accent",
                        )}
                      >
                        <span className="font-medium">{a.label}</span>
                        <span className={cx("text-xs num", isActive ? "text-accent" : "text-muted")} title={a.id}>
                          {shortId(a.id)}
                        </span>
                      </button>
                      <button
                        type="button"
                        className={secondaryButton}
                        aria-label={`Remove ${a.label} from this browser`}
                        onClick={() => dispatch(accountRemoved(a.id))}
                      >
                        Remove
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <CreateAccountForm nextLabel={`Account ${accounts.length + 1}`} />
          <PasteAccountForm nextLabel={`Account ${accounts.length + 1}`} />
        </div>
      )}
    </div>
  );
}

function CreateAccountForm({ nextLabel }: { nextLabel: string }) {
  const dispatch = useAppDispatch();
  const [createAccount, { isLoading }] = useCreateAccountMutation();
  const [label, setLabel] = useState("");
  const [balances, setBalances] = useState<Record<Asset, string>>(DEFAULT_STARTING_BALANCES);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const invalid = ASSETS.find((a) => !BALANCE_RE.test(balances[a]));
    if (invalid) {
      setError(`${invalid} must be a decimal with at most 10 integer digits and 8 decimals.`);
      return;
    }
    try {
      const created = await createAccount({ balances }).unwrap();
      dispatch(accountAdded({ label: label.trim() || nextLabel, id: created.accountId }));
      setLabel("");
    } catch (err) {
      setError(describeApiError(err));
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 border-t border-border pt-3" noValidate>
      <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Create test account</h3>
      <input
        aria-label="Label for the new account"
        placeholder={nextLabel}
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className={inputClass}
      />
      <div className="grid grid-cols-4 gap-2">
        {ASSETS.map((asset) => (
          <label key={asset} className="flex flex-col gap-1 text-[11px] text-muted">
            {asset}
            <input
              inputMode="decimal"
              value={balances[asset]}
              onChange={(e) => setBalances((b) => ({ ...b, [asset]: e.target.value }))}
              className={cx(inputClass, "px-2 py-1.5 text-xs num")}
            />
          </label>
        ))}
      </div>
      <p className="text-[11px] text-muted">Starting balances are set at creation. Use 0 for an empty account.</p>
      <button type="submit" disabled={isLoading} className={primaryButton} data-testid="create-account">
        {isLoading ? "Creating..." : "Create test account"}
      </button>
      {error && <InlineError>{error}</InlineError>}
    </form>
  );
}

function PasteAccountForm({ nextLabel }: { nextLabel: string }) {
  const dispatch = useAppDispatch();
  const [fetchAccount, { isFetching }] = useLazyGetAccountQuery();
  const [label, setLabel] = useState("");
  const [id, setId] = useState("");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = id.trim();
    if (!trimmed) {
      setError("Paste an account id.");
      return;
    }
    try {
      // confirm the id exists before saving it
      await fetchAccount(trimmed).unwrap();
      dispatch(accountAdded({ label: label.trim() || nextLabel, id: trimmed }));
      setId("");
      setLabel("");
    } catch (err) {
      setError(describeApiError(err));
    }
  };

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-2 border-t border-border pt-3" noValidate>
      <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">Add existing account</h3>
      <div className="grid grid-cols-[1fr_2fr] gap-2">
        <input
          aria-label="Label for the existing account"
          placeholder="Label"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          className={inputClass}
        />
        <input
          aria-label="Account id"
          placeholder="Account id"
          value={id}
          onChange={(e) => setId(e.target.value)}
          className={cx(inputClass, "num")}
        />
      </div>
      <button type="submit" disabled={isFetching} className={cx(secondaryButton, "py-1.5 text-sm")}>
        {isFetching ? "Checking..." : "Add account"}
      </button>
      {error && <InlineError>{error}</InlineError>}
    </form>
  );
}
