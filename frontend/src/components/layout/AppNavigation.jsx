import React, { useEffect, useRef } from 'react';
import { LogOut, X } from 'lucide-react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { getNavigation, isNavigationActive } from './navigation';
import IconButton from '../ui/IconButton';
import { getAvatarInitial } from '../../utils/avatarInitial';

const CHAT_ROUTE_TRANSITION_MS = 210;

const UserMark = ({ name, role }) => (
  <span className="app-nav__avatar" aria-hidden="true">
    {getAvatarInitial(name, role)}
  </span>
);

const AppNavigation = ({ compact = false, mobile = false, onNavigate, onClose, onRouteTransitionStart }) => {
  const { user, userRole, logoutAction } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const chatTransitionTimerRef = useRef(null);
  const name = user?.displayName || user?.name || user?.username || '用户';
  const items = getNavigation(userRole);

  useEffect(() => () => {
    if (chatTransitionTimerRef.current) {
      window.clearTimeout(chatTransitionTimerRef.current);
    }
  }, []);

  const handleItemClick = (event, path) => {
    if (
      path !== '/chat'
      || compact
      || mobile
      || location.pathname.startsWith('/chat')
      || event.defaultPrevented
      || event.button !== 0
      || event.metaKey
      || event.altKey
      || event.ctrlKey
      || event.shiftKey
    ) {
      onNavigate?.();
      return;
    }

    event.preventDefault();
    onRouteTransitionStart?.('chat');
    chatTransitionTimerRef.current = window.setTimeout(() => {
      onNavigate?.();
      navigate(path);
    }, CHAT_ROUTE_TRANSITION_MS);
  };

  return (
    <nav className={`app-nav ${compact ? 'app-nav--compact' : ''} ${mobile ? 'app-nav--mobile' : ''}`} aria-label="应用导航">
      <div className="app-nav__brand">
        <img src="/logo.svg" alt="" />
        {!compact && (
          <div>
            <strong>智能助教</strong>
            <span>线性代数工作台</span>
          </div>
        )}
        {mobile && <IconButton icon={X} label="关闭导航" onClick={onClose} />}
      </div>

      <div className="app-nav__items">
        {items.map(({ label, path, icon: Icon }) => {
          const active = isNavigationActive(location.pathname, path);
          return (
            <NavLink
              key={path}
              to={path}
              title={compact ? label : undefined}
              className={`app-nav__item ${active ? 'is-active' : ''}`}
              onClick={(event) => handleItemClick(event, path)}
            >
              {React.createElement(Icon, { size: 19, 'aria-hidden': true })}
              {!compact && <span>{label}</span>}
            </NavLink>
          );
        })}
      </div>

      <div className="app-nav__account">
        <div className="app-nav__user" title={compact ? name : undefined}>
          <UserMark name={name} role={userRole} />
          {!compact && (
            <div>
              <strong>{name}</strong>
              <span>{userRole === 'teacher' ? '教师' : '学生'}</span>
            </div>
          )}
        </div>
        <button className="app-nav__logout" type="button" onClick={logoutAction} title="退出登录">
          <LogOut size={18} aria-hidden="true" />
          {!compact && <span>退出登录</span>}
        </button>
      </div>
    </nav>
  );
};

export default AppNavigation;
