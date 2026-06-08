import React, { useEffect, useRef, useState } from 'react';
import { Menu } from 'lucide-react';
import { Outlet } from 'react-router-dom';
import AppNavigation from './AppNavigation';
import IconButton from '../ui/IconButton';

const AppShell = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [transitioningToChat, setTransitioningToChat] = useState(false);
  const transitionTimerRef = useRef(null);

  useEffect(() => () => {
    if (transitionTimerRef.current) {
      window.clearTimeout(transitionTimerRef.current);
    }
  }, []);

  const handleRouteTransitionStart = (target) => {
    if (target !== 'chat') return;
    setTransitioningToChat(true);
    if (transitionTimerRef.current) {
      window.clearTimeout(transitionTimerRef.current);
    }
    transitionTimerRef.current = window.setTimeout(() => {
      setTransitioningToChat(false);
    }, 420);
  };

  return (
    <div className={`app-shell ${transitioningToChat ? 'is-routing-chat' : ''}`}>
      <aside className="app-shell__sidebar">
        <AppNavigation onRouteTransitionStart={handleRouteTransitionStart} />
      </aside>

      <div className="app-shell__body">
        <header className="app-shell__mobile-header">
          <IconButton icon={Menu} label="打开导航" onClick={() => setMobileOpen(true)} />
          <div className="app-shell__mobile-brand">
            <img src="/logo.svg" alt="" />
            <strong>智能助教</strong>
          </div>
          <span className="app-shell__mobile-spacer" />
        </header>
        <main className="app-shell__main">
          <Outlet />
        </main>
      </div>

      {mobileOpen && (
        <div className="app-shell__drawer-backdrop" onMouseDown={() => setMobileOpen(false)}>
          <div className="app-shell__drawer" onMouseDown={(event) => event.stopPropagation()}>
            <AppNavigation mobile onClose={() => setMobileOpen(false)} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
};

export default AppShell;
