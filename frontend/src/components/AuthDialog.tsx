import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowRight, X } from "lucide-react";
import { errorMessage } from "../api";
import { useAuth } from "../auth";
import { href } from "../route";

export type Tab = "guest" | "login" | "register";

const TAB_NAMES: Record<Tab, string> = { guest: "Guest", login: "Log in", register: "Create account" };

// Continue as a guest (with the name, email and phone the booking is for),
// log in or create an account, shown only when an action needs an account
export const AuthDialog = ({ reason, initialTab = "login", onClose }: { reason: string; initialTab?: Tab; onClose: () => void }) => {
  const { login, register, continueAsGuest } = useAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  const run = async (action: () => Promise<void>) => {
    setError("");
    setBusy(true);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (tab === "guest") run(() => continueAsGuest(name, email, phone));
    else if (tab === "login") run(() => login(email, password));
    else run(() => register(name, email, password));
  };

  return (
    <dialog ref={dialog} className="auth-dialog" onCancel={onClose} aria-labelledby="auth-title">
      <button type="button" className="icon-button close" onClick={onClose} aria-label="Close">
        <X size={18} aria-hidden="true" />
      </button>
      <h2 id="auth-title">{reason}</h2>
      <p className="muted">Book as a guest, or with an account.</p>

      <div className="tabs" role="tablist">
        {(["guest", "login", "register"] as Tab[]).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={tab === value ? "tab active" : "tab"}
            onClick={() => setTab(value)}
          >
            {TAB_NAMES[value]}
          </button>
        ))}
      </div>

      <form className="stack" onSubmit={submit}>
        {tab !== "login" && (
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={50} autoComplete="name" />
          </label>
        )}
        {tab === "guest" && (
          <label>
            Phone
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              required
              maxLength={24}
              autoComplete="tel"
              placeholder="+1 (555) 123-4567"
            />
          </label>
        )}
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        {tab !== "guest" && (
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={tab === "login" ? "current-password" : "new-password"}
            />
          </label>
        )}
        {tab === "guest" && (
          <p className="hint">
            Used only for this booking, never shared · demo: please use made-up details ·{" "}
            <a href={href("privacy")} target="_blank" rel="noopener">
              Privacy
            </a>
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className={tab === "guest" ? "button primary wide" : "button secondary wide"} disabled={busy}>
          {busy ? (
            "Please wait…"
          ) : tab === "guest" ? (
            <>
              Continue as guest <ArrowRight size={16} aria-hidden="true" />
            </>
          ) : tab === "login" ? (
            "Log in"
          ) : (
            "Create account"
          )}
        </button>
      </form>
    </dialog>
  );
};
