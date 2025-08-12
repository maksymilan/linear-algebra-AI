import React from 'react';
import { useNavigate } from 'react-router-dom';
import './ChatHistorySidebar.css';

// --- 图标组件 ---
const PlusIcon = () => ( <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"> <line x1="12" y1="5" x2="12" y2="19"></line> <line x1="5" y1="12" x2="19" y2="12"></line> </svg> );
const MessageSquareIcon = () => ( <svg className="history-item-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"> <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path> </svg> );
const SidebarCollapseIcon = () => (
    <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="9" y1="3" x2="9" y2="21"></line>
    </svg>
);
const WorkspaceIcon = () => ( <svg className="sidebar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg> );


const ChatHistorySidebar = ({ chats, activeChatId, onNewChat, onSelectChat, isCollapsed, onToggle }) => {
  const navigate = useNavigate(); 
  
  const historyItems = chats ? Object.values(chats).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) : [];

  return (
    <div className={`sidebar-container ${isCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-header">
        <h2 className="sidebar-title">聊天记录</h2>
        <button className="new-chat-button" onClick={onNewChat} title="开始新聊天">
            <PlusIcon />
        </button>
      </div>

      <div className="sidebar-content">
        <button className="sidebar-nav-button" onClick={() => navigate('/workspace')} title="返回工作区">
            <WorkspaceIcon />
            <span>返回工作区</span>
        </button>
        <ul className="history-list">
          {historyItems.map((item) => (
            // **关键修复：添加了 item.id 作为 key**
            <li 
              key={item.id} 
              className={`history-item ${String(item.id) === String(activeChatId) ? 'active' : ''}`}
              onClick={() => onSelectChat(item.id)}
              title={item.title}
            >
               <MessageSquareIcon />
               <span className="history-title">{item.title}</span>
            </li>
          ))}
        </ul>
      </div>

       <div className="sidebar-footer">
         <button className="sidebar-toggle-button" onClick={onToggle} title={isCollapsed ? "展开侧边栏" : "收起侧边栏"}>
            <SidebarCollapseIcon />
            <span>收起侧边栏</span>
        </button>
      </div>
    </div>
  );
};

export default ChatHistorySidebar;