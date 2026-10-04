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
  ReceiptText,
} from "lucide-react";
import type { Theme, User } from "./contracts";
import { Dashboard } from "./Dashboard";
import { POS } from "./POS";
import { dateLabel } from "./shared";
import { ShiftStatus } from './ShiftStatus';
import { Products } from './Products';
import { Inventory } from './Inventory';
import { Purchases } from './Purchases';
import { SalesHistory } from './SalesHistory';
import { Accounts } from './Accounts';
import { Closing } from './Closing';
import { Reports } from './Reports';
import { OperationalSettings } from './OperationalSettings';
import { UsersAdmin } from './UsersAdmin';
const nav = [
  ["Dashboard", LayoutDashboard],
  ["Point of Sale", ShoppingCart],
  ["Sales History", ReceiptText],
  ["Products", Package],
  ["Inventory", Boxes],
  ["Purchases", Truck],
  ["Accounts", Users],
  ["Closing", ChartColumn],
  ["Suppliers", Building2],
  ["Reports", ChartColumn],
  ["Settings", Settings],
] as const;
export function App() {
  const [reviewAccess,setReviewAccess]=useState<{username:string;password:string}|null>(null);
  const [user, setUser] = useState<User | null>(null),
    [page, setPage] = useState("Dashboard"),
    [theme, setTheme] = useState<Theme>(() => {
      const t = localStorage.getItem("techorbit.appearance");
      return t === "dark" || t === "light" ? t : "system";
    }),
    [collapsed, setCollapsed] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    window.pharmacy.reviewAccess().then(setReviewAccess).catch(()=>{});
  },[]);
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
          {reviewAccess?<small>Isolated review workspace: {reviewAccess.username} / {reviewAccess.password}<br/>Sample data only. This password is unique to this Windows workspace.</small>:<small>Sign in with your assigned account.</small>}
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
                !["Dashboard", "Point of Sale", "Sales History", "Settings", "Products", "Inventory", "Purchases", "Accounts", "Closing", "Suppliers", "Reports"].includes(label)||(label==='Reports'&&!user.canViewProfit&&!user.canViewSalesReport&&!user.canViewInventory&&!user.canViewDues&&!user.canViewClosingReport&&!user.canViewAuditReport)
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
        {user.demo && (
          <div className="demo-banner" role="status">
            Demo Edition · Sample data only · Real pharmacy operations ke liye use na karein
          </div>
        )}
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
            <Dashboard onSale={() => setPage("Point of Sale")} onAccounts={()=>setPage('Accounts')} onInventory={()=>setPage('Inventory')} onReports={()=>setPage('Reports')} canViewProfit={user.canViewProfit} />
          )}
          <div hidden={page !== "Point of Sale"}>
            <POS user={user} />
          </div>
          {page === 'Sales History'&&<SalesHistory/>}
          {page === 'Products' && <Products/>}
          {page === 'Inventory' && <Inventory/>}
          {page === 'Purchases' && <Purchases initialTab="purchases"/>}
          {page === 'Accounts' && <Accounts/>}
          {page === 'Closing' && <Closing/>}
          {page === 'Reports' && <Reports canViewProfit={user.canViewProfit} canViewSalesReport={user.canViewSalesReport} canViewInventory={user.canViewInventory} canViewDues={user.canViewDues} canViewVendorDues={user.canViewVendorDues} canViewClosingReport={user.canViewClosingReport} canViewAuditReport={user.canViewAuditReport}/>}
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
              {user.canManageSettings&&<OperationalSettings/>}
              {user.roleCode==='admin'&&<UsersAdmin/>}
              {user.demo && (
                <section className="panel demo-tools">
                  <h2>Demo data</h2>
                  <p>
                    Demo ke dauran ki gayi sales, purchases aur dusri entries hata
                    kar original sample data dobara load karein.
                  </p>
                  <button
                    onClick={async () => {
                      if (!window.confirm("Reset demo data? Demo ke dauran ki gayi tamam entries remove ho jayengi.")) return;
                      setError("");
                      try {
                        await window.pharmacy.resetDemo();
                        setUser(null);
                        setPage("Dashboard");
                      } catch (e) {
                        setError((e as Error).message);
                      }
                    }}
                  >
                    Reset demo data
                  </button>
                  {error && <p role="alert" className="error">{error}</p>}
                  <small>Reset sirf isolated Demo Edition database par available hai.</small>
                </section>
              )}
            </>
          )}
        </main>
        <footer className="status">
          <span className="dot" />
          {user.demo
            ? "Demo Edition · Isolated sample database"
            : "Local SQLite database"}
          <span className="top-spacer" />
          <span>TechOrbit Systems</span>
        </footer>
      </div>
    </div>
  );
}
