import React, { useState } from 'react';
import { Menu } from 'lucide-react';
import AppNavigation from './AppNavigation';
import IconButton from '../ui/IconButton';

const ChatNavigationRail = () => {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <aside className="chat-global-rail">
        <AppNavigation compact />
      </aside>
      <div className="chat-mobile-nav">
        <IconButton icon={Menu} label="打开应用导航" onClick={() => setMobileOpen(true)} />
        <img src="/logo.svg" alt="" />
        <strong>智能助教</strong>
      </div>
      {mobileOpen && (
        <div className="app-shell__drawer-backdrop" onMouseDown={() => setMobileOpen(false)}>
          <div className="app-shell__drawer" onMouseDown={(event) => event.stopPropagation()}>
            <AppNavigation mobile onClose={() => setMobileOpen(false)} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
    </>
  );
};

export default ChatNavigationRail;
