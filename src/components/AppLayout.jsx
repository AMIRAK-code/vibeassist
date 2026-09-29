import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Code, Menu, X, LayoutDashboard, ShieldAlert, Newspaper, TrendingUp, Cpu, Megaphone, ShieldCheck, Lock } from 'lucide-react';

const links = [
  { to: '/dashboard', label: 'Overall Income', icon: LayoutDashboard },
  { to: '/publishing', label: 'Legal & Publishing', icon: ShieldAlert },
  { to: '/newsletter', label: 'News & Newsletter', icon: Newspaper },
  { to: '/integrations', label: 'Integrations', icon: TrendingUp, premium: true },
  { to: '/ai-analyzer', label: 'AI Business Analyzer', icon: Cpu, premium: true },
  { to: '/ads', label: 'Ad Manager', icon: Megaphone, premium: true },
  { to: '/orchestrator', label: 'Anti-Fragile Engine', icon: ShieldCheck, premium: true },
];

function Navigation({ hasPremium, onNavigate }) {
  return <>
    <nav className="sidebar-nav" aria-label="Main navigation">
      {links.map(({ to, label, icon: Icon, premium }) => <NavLink key={to} to={to} className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`} onClick={onNavigate}>
        <Icon size={20} aria-hidden="true" /><span>{label}</span>{premium && !hasPremium && <Lock size={14} aria-label="Premium feature" />}
      </NavLink>)}
    </nav>
    <div className="nav-footer"><Link className="btn btn-secondary w-full" to="/premium" onClick={onNavigate}>{hasPremium ? 'View plan' : 'View plans'}</Link></div>
  </>;
}

export default function AppLayout({ hasPremium, project }) {
  const location = useLocation();
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);
  const [open, setOpen] = useState(false);
  const pageName = links.find(link => link.to === location.pathname)?.label || 'VibeAssist';
  const closeMenu = () => dialogRef.current?.close();

  useEffect(() => { dialogRef.current?.close(); }, [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const desktop = window.matchMedia('(min-width: 769px)');
    const closeOnDesktop = () => { if (desktop.matches) dialogRef.current?.close(); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => { document.body.style.overflow = previous; desktop.removeEventListener('change', closeOnDesktop); };
  }, [open]);
  useEffect(() => {
    document.title = `${pageName} · VibeAssist`;
    document.getElementById('main-content')?.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }, [location.pathname, pageName]);

  function trapTab(event) {
    if (event.key !== 'Tab') return;
    const items = [...dialogRef.current.querySelectorAll('a[href], button:not(:disabled)')];
    const first = items[0], last = items.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  return <div className="app-container">
    <a className="skip-link" href="#main-content">Skip to content</a>
    <aside className="sidebar desktop-sidebar">
      <Link className="brand" to="/"><Code aria-hidden="true" /><span>VibeAssist</span></Link>
      {project && <div className="project-label"><span className="muted">Project</span><strong>{project.name}</strong></div>}
      <Navigation hasPremium={hasPremium} />
    </aside>
    <header className="mobile-header">
      <div className="mobile-context"><Link className="brand" to="/"><Code size={20} aria-hidden="true" />VibeAssist</Link><span>{project?.name || pageName}</span></div>
      <button ref={triggerRef} className="btn btn-secondary" aria-haspopup="dialog" aria-expanded={open} aria-controls="mobile-navigation" onClick={() => { dialogRef.current.showModal(); setOpen(true); }}><Menu size={20} aria-hidden="true" />Menu</button>
    </header>
    <dialog ref={dialogRef} id="mobile-navigation" className="navigation-drawer" aria-labelledby="navigation-title" onKeyDown={trapTab} onClick={event => { if (event.target === event.currentTarget) closeMenu(); }} onClose={() => { setOpen(false); if (window.matchMedia('(max-width: 768px)').matches) triggerRef.current?.focus(); }}>
      <div className="drawer-content">
        <div className="flex-between"><h2 id="navigation-title">Navigation</h2><button autoFocus className="btn btn-secondary icon-button" onClick={closeMenu} aria-label="Close navigation"><X size={20} /></button></div>
        {project && <p className="muted">{project.name}</p>}
        <Navigation hasPremium={hasPremium} onNavigate={closeMenu} />
      </div>
    </dialog>
    <main id="main-content" className="main-content" tabIndex={-1}><Outlet /></main>
  </div>;
}
