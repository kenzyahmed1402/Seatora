import { useEffect, useRef, type MouseEvent } from "react";
import { Film, LogIn, LogOut, Sparkles, Ticket, UserRound, type LucideIcon } from "lucide-react";
import { useAuth } from "./auth";
import { go, href, useRoute, type Page } from "./route";
import { Home } from "./pages/Home";
import { Chat } from "./pages/Chat";
import { ShowtimePage } from "./pages/Showtime";
import { BookingPage } from "./pages/Booking";
import { BookingsPage } from "./pages/Bookings";
import { PrivacyPage } from "./pages/Privacy";
import { Logo } from "./components/Logo";

// `short`: the label on phones, where the three must fit on one line
const NAV: { page: Page; label: string; short?: string; icon: LucideIcon }[] = [
  { page: "home", label: "What's on", icon: Film },
  { page: "chat", label: "Assistant", icon: Sparkles },
  { page: "bookings", label: "My bookings", short: "Bookings", icon: Ticket },
];

export const App = () => {
  const { user, logout, requireUser } = useAuth();
  const route = useRoute();
  const main = useRef<HTMLElement>(null);
  const header = useRef<HTMLElement>(null);

  // The header's real height (it wraps on phones), so full-height pages
  // like the assistant fit the screen below it
  useEffect(() => {
    const element = header.current;
    if (!element) return;
    const measure = () =>
      document.documentElement.style.setProperty("--header-h", `${element.getBoundingClientRect().height}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // The visible height, which shrinks when a phone's keyboard opens (100dvh
  // doesn't), so the assistant's chat stays above the keyboard
  useEffect(() => {
    const view = window.visualViewport;
    if (!view) return;
    const measure = () => document.documentElement.style.setProperty("--view-h", `${view.height}px`);
    measure();
    view.addEventListener("resize", measure);
    return () => view.removeEventListener("resize", measure);
  }, []);

  // My bookings needs an account: ask for one, or go back home
  useEffect(() => {
    if (route.page === "bookings" && user === null) {
      requireUser("Log in to see your bookings").then((next) => {
        if (!next) go("home");
      });
    }
  }, [route.page, user, requireUser]);

  // Page addresses use the #, so the skip link moves focus itself
  const skip = (event: MouseEvent) => {
    event.preventDefault();
    main.current?.focus();
  };

  return (
    <div className="app">
      <a className="skip-link" href="#main" onClick={skip}>
        Skip to content
      </a>
      <header className="topbar" ref={header}>
        <div className="wrap topbar-inner">
          <a className="brand" href={href("home")}>
            <Logo />
            Seatora
          </a>
          <nav aria-label="Main">
            {NAV.map(({ page, label, short, icon: Icon }) => (
              <a key={page} href={href(page)} aria-current={route.page === page ? "page" : undefined}>
                <Icon size={16} aria-hidden="true" />
                {short ? (
                  <>
                    <span className="label-long">{label}</span>
                    <span className="label-short">{short}</span>
                  </>
                ) : (
                  label
                )}
              </a>
            ))}
          </nav>
          <div className="account">
            {user === undefined ? null : user ? (
              <>
                <span className="user-name">
                  <UserRound size={16} aria-hidden="true" />
                  {/* a guest who gave their details is shown by name */}
                  {user.isGuest && !user.phone ? "Guest" : user.name}
                  {user.isGuest && <span className="badge">guest</span>}
                </span>
                <button type="button" className="button ghost small account-button" onClick={() => logout()} aria-label="Log out">
                  <LogOut size={15} aria-hidden="true" /> <span className="account-label">Log out</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                className="button ghost small account-button"
                onClick={() => requireUser("Welcome to Seatora")}
                aria-label="Log in"
              >
                <LogIn size={15} aria-hidden="true" /> <span className="account-label">Log in</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <main id="main" className="wrap" ref={main} tabIndex={-1}>
        {route.page === "home" && <Home />}
        {route.page === "chat" && <Chat initial={route.query.get("q") ?? undefined} />}
        {route.page === "showtime" && (
          <ShowtimePage key={route.param} id={route.param} seats={route.query.get("seats") ?? undefined} />
        )}
        {route.page === "booking" && <BookingPage key={route.param} id={route.param} />}
        {route.page === "bookings" && user && <BookingsPage key={user._id} />}
        {route.page === "privacy" && <PrivacyPage />}
      </main>

      <footer className="footer">
        <p className="wrap muted">
          Fictional movies and cinemas · PayPal Sandbox, no real money is charged · <a href={href("privacy")}>Privacy</a>
        </p>
      </footer>
    </div>
  );
};
