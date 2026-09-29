import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Code,
  Menu,
  X,
  LayoutDashboard,
  ListChecks,
  BookOpen,
  Plug,
  Compass,
  Megaphone,
  Wrench,
  Settings2,
} from "lucide-react";

const groups = [
  {
    label: "Workspace",
    links: [
      { to: "/dashboard", label: "Overview", icon: LayoutDashboard },
      { to: "/integrations", label: "Connections", icon: Plug },
      { to: "/ai-analyzer", label: "Recommendations", icon: Compass },
      { to: "/publishing", label: "Launch checklist", icon: ListChecks },
    ],
  },
  {
    label: "Growth",
    links: [{ to: "/ads", label: "Advertising", icon: Megaphone }],
  },
  {
    label: "Resources",
    links: [{ to: "/newsletter", label: "News & learning", icon: BookOpen }],
  },
  {
    label: "Tools",
    links: [{ to: "/orchestrator", label: "Developer tools", icon: Wrench }],
  },
];
const links = groups.flatMap((group) => group.links);

function Navigation({ onNavigate }) {
  return (
    <>
      <nav className="sidebar-nav" aria-label="Main navigation">
        {groups.map((group) => (
          <div className="nav-group" key={group.label}>
            <p className="nav-group-label">{group.label}</p>
            {group.links.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  `nav-item${isActive ? " active" : ""}`
                }
                onClick={onNavigate}
              >
                <Icon size={19} aria-hidden="true" />
                <span>{label}</span>
              </NavLink>
            ))}
          </div>
        ))}
      </nav>
      <div className="nav-footer">
        <Link className="nav-item" to="/onboarding" onClick={onNavigate}>
          <Settings2 size={18} aria-hidden="true" />
          Project settings
        </Link>
        <p className="workspace-note">Local preview · no live accounts</p>
        <Link to="/premium" className="preview-link" onClick={onNavigate}>
          About this preview
        </Link>
      </div>
    </>
  );
}

export default function AppLayout({ project }) {
  const location = useLocation();
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const pageName =
    links.find((link) => link.to === location.pathname)?.label || "VibeAssist";
  const closeMenu = () => dialogRef.current?.close();

  useEffect(() => {
    dialogRef.current?.close();
  }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const desktop = window.matchMedia("(min-width: 769px)");
    const closeOnDesktop = () => {
      if (desktop.matches) dialogRef.current?.close();
    };
    desktop.addEventListener("change", closeOnDesktop);
    return () => {
      document.body.style.overflow = previous;
      desktop.removeEventListener("change", closeOnDesktop);
    };
  }, [open]);
  useEffect(() => {
    document.title = `${pageName} · VibeAssist`;
    document.getElementById("main-content")?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [location.pathname, pageName]);

  function trapTab(event) {
    if (event.key !== "Tab") return;
    const items = [
      ...dialogRef.current.querySelectorAll("a[href], button:not(:disabled)"),
    ];
    const first = items[0],
      last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  return (
    <div className="app-container">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar desktop-sidebar">
        <Link className="brand" to="/">
          <Code aria-hidden="true" />
          <span>VibeAssist</span>
        </Link>
        <div className="project-label">
          <span className="muted">{project.platform}</span>
          <strong>{project.name}</strong>
        </div>
        <Navigation />
      </aside>
      <header className="mobile-header">
        <div className="mobile-context">
          <Link className="brand" to="/">
            <Code size={20} aria-hidden="true" />
            VibeAssist
          </Link>
          <span>
            {project.name} · {pageName}
          </span>
        </div>
        <button
          ref={triggerRef}
          className="btn btn-secondary"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls="mobile-navigation"
          onClick={() => {
            dialogRef.current.showModal();
            setOpen(true);
          }}
        >
          <Menu size={20} aria-hidden="true" />
          Menu
        </button>
      </header>
      <dialog
        ref={dialogRef}
        id="mobile-navigation"
        className="navigation-drawer"
        aria-labelledby="navigation-title"
        onKeyDown={trapTab}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeMenu();
        }}
        onClose={() => {
          setOpen(false);
          if (window.matchMedia("(max-width: 768px)").matches)
            triggerRef.current?.focus();
        }}
      >
        <div className="drawer-content">
          <div className="flex-between">
            <h2 id="navigation-title">Navigation</h2>
            <button
              autoFocus
              className="btn btn-secondary icon-button"
              onClick={closeMenu}
              aria-label="Close navigation"
            >
              <X size={20} />
            </button>
          </div>
          <p className="muted drawer-project">{project.name}</p>
          <Navigation onNavigate={closeMenu} />
        </div>
      </dialog>
      <main id="main-content" className="main-content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
