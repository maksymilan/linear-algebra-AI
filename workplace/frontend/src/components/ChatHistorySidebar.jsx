// src/components/ChatHistorySidebar.jsx
import React from 'react';
import './ChatHistorySidebar.css';

// --- Icon Components ---
const PlusIcon = () => ( <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"> <line x1="12" y1="5" x2="12" y2="19"></line> <line x1="5" y1="12" x2="19" y2="12"></line> </svg> );
const MessageSquareIcon = () => ( <svg className="history-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"> <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path> </svg> );
const SidebarCollapseIcon = () => (
    <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="9" y1="3" x2="9" y2="21"></line>
    </svg>
);

const ChatHistorySidebar = ({ chats, activeChatId, onNewChat, onSelectChat, isCollapsed, onToggle }) => {
  const historyItems = Object.values(chats).sort((a, b) => {
    const timeA = parseInt(a.id.split('-')[1] || '0');
    const timeB = parseInt(b.id.split('-')[1] || '0');
    return timeB - timeA;
  });

  return (
    <div className="sidebar-container">
      <div className="sidebar-header">
        <button className="sidebar-toggle-button" onClick={onToggle} title={isCollapsed ? "展开侧边栏" : "收起侧边栏"}>
            <SidebarCollapseIcon />
        </button>
        
        <h2 className="sidebar-title">{!isCollapsed && "聊天记录"}</h2>
        
        {/* --- V V V 添加条件渲染 V V V --- */}
        {!isCollapsed && (
          <button className="new-chat-button" onClick={onNewChat} title="开始新聊天">
            <PlusIcon />
          </button>
        )}
        {/* --- ^ ^ ^ 添加条件渲染 ^ ^ ^ --- */}
      </div>
      <div className="sidebar-content">
        <ul className="history-list">
          {historyItems.map((item) => (
            <li 
              key={item.id} 
              className={`history-item ${item.id === activeChatId ? 'active' : ''}`}
              onClick={() => onSelectChat(item.id)}
              title={item.title}
            >
               <MessageSquareIcon />
               {!isCollapsed && <span className="history-title">{item.title}</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default ChatHistorySidebar;