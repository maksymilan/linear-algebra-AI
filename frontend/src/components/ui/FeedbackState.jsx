import React from 'react';
import { Inbox, Loader2 } from 'lucide-react';

export const EmptyState = ({ title, description, icon: Icon = Inbox, action }) => (
  <div className="ui-empty-state">
    {React.createElement(Icon, { size: 22, 'aria-hidden': true })}
    <h3>{title}</h3>
    {description && <p>{description}</p>}
    {action}
  </div>
);

export const LoadingState = ({ label = '加载中...' }) => (
  <div className="ui-loading-state" role="status">
    <Loader2 size={18} className="ui-spin" aria-hidden="true" />
    <span>{label}</span>
  </div>
);

export const InlineAlert = ({ tone = 'error', children }) => (
  <div className={`ui-inline-alert ui-inline-alert--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
    {children}
  </div>
);
