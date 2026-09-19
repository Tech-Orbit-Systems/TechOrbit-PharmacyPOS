import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Boxes,
  Truck,
  Users,
  Building2,
  ChartColumn,
  Settings,
  Orbit,
  LogOut,
  Menu,
} from "lucide-react";
import type { Theme, User } from "./contracts";
import { Dashboard } from "./Dashboard";
import { POS } from "./POS";
import { dateLabel } from "./shared";
import { ShiftStatus } from './ShiftStatus';
import { Products } from './Products';
import { Inventory } from './Inventory';
import { Purchases } from './Purchases';
const nav = [
  ["Dashboard", LayoutDashboard],
  ["Point of Sale", ShoppingCart],
  ["Products", Package],
  ["Inventory", Boxes],
  ["Purchases", Truck],
  ["Customers", Users],
  ["Suppliers", Building2],
  ["Reports", ChartColumn],
  ["Settings", Settings],
] as const;
export function App() {
  const [user, setUser] = useState<User | null>(null),
    [page, setPage] = useState("Dashboard"),
    [theme, setTheme] = useState<Theme>(() => {
      const t = localStorage.getItem("techorbit.appearance");
      return t === "dark" || t === "light" ? t : "system";
    }),
    [collapsed, setCollapsed] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () =>
      (document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme);
    apply();
    media.addEventListener("change", apply);
    localStorage.setItem("techorbit.appearance", theme);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  if (!user || user.mustChangePassword)
    return (
      <main className="auth">
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            const fields = new FormData(event.currentTarget);
            try {
              if (user) {
                await window.pharmacy.changePassword({
                  currentPassword: String(fields.get("password")),
                  newPassword: String(fields.get("newPassword")),
                });
                setUser({ ...user, mustChangePassword: false });
              } else
                setUser(
                  await window.pharmacy.login({
                    username: String(fields.get("username")),
                    password: String(fields.get("password")),
                  }),
                );
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          <Orbit className="brand-icon" />
          <h1>TechOrbit</h1>
          <p>Pharmacy POS · Modern workspace</p>
          <h2>{user ? "Change temporary password" : "Sign in"}</h2>
          {!user && (
            <label>
              Username
              <input
                name="username"
                autoComplete="username"
                required
                autoFocus
              />
            </label>
          )}
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          {user && (
            <label>
              New password
              <input
                name="newPassword"
                type="password"
                autoComplete="new-password"
                minLength={12}
                required
              />
            </label>
          )}
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button className="primary">
            {user ? "Save password" : "Sign in"}
          </button>
          <small>
            Review workspace: demo / TechOrbit-Demo-2026!
            <br />
            Review data is separate from the existing pharmacy database.
          </small>
        </form>
      </main>
    );
  return (
    <div className={"shell " + (collapsed ? "collapsed" : "")}>
      <aside className="sidebar">
        <div className="brand">
          <Orbit />
          <span>
            <strong>TechOrbit</strong>
            <small>Pharmacy POS</small>
          </span>
        </div>
        <nav>
          {nav.map(([label, Icon]) => (
            <button
              key={label}
              title={label}
              disabled={
                !["Dashboard", "Point of Sale", "Settings", "Products", "Inventory", "Purchases", "Suppliers"].includes(label)
              }
              aria-current={page === label ? "page" : undefined}
              onClick={() => setPage(label)}
            >
              <Icon size={19} />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-foot">
          <span>{user.demo ? "Review workspace" : "SQLite workspace"}</span>
          <button
            onClick={async () => {
              await window.pharmacy.logout();
              setUser(null);
            }}
          >
            <LogOut size={17} />
            <span>Sign out</span>
          </button>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            onClick={() => setCollapsed(!collapsed)}
            aria-label="Toggle sidebar"
          >
            <Menu size={19} />
          </button>
          <span>
            <Building2 size={16} /> Main Branch
          </span>
          <span className="top-spacer" />
          <span>{dateLabel(new Date().toISOString())}</span>
          <ShiftStatus/>
          <span className="user-avatar">{user.displayName[0]}</span>
          <span>{user.displayName}</span>
        </header>
        <main className="page">
          {page === "Dashboard" && (
            <Dashboard onSale={() => setPage("Point of Sale")} />
          )}
          <div hidden={page !== "Point of Sale"}>
            <POS user={user} />
          </div>
          {page === 'Products' && <Products/>}
          {page === 'Inventory' && <Inventory/>}
          {page === 'Purchases' && <Purchases initialTab="purchases"/>}
          {page === 'Suppliers' && <Purchases initialTab="suppliers"/>}
          {page === "Settings" && (
            <>
              <h1>Settings</h1>
              <section className="panel appearance">
                <h2>Appearance</h2>
                <p>Choose your preferred theme. The layout stays the same.</p>
                <div className="segmented">
                  {(["light", "dark", "system"] as Theme[]).map((value) => (
                    <button
                      key={value}
                      aria-pressed={theme === value}
                      onClick={() => setTheme(value)}
                    >
                      {value[0].toUpperCase() + value.slice(1)}
                    </button>
                  ))}
                </div>
                <small>
                  System follows your Windows appearance preference.
                </small>
              </section>
            </>
          )}
        </main>
        <footer className="status">
          <span className="dot" />
          {user.demo
            ? "Isolated review database · Test data"
            : "Local SQLite database"}
          <span className="top-spacer" />
          <span>TechOrbit Systems</span>
        </footer>
      </div>
    </div>
  );
}
