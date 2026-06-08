import React from 'react';
import { MessageSquare, PanelLeftClose, Plus } from 'lucide-react';
import IconButton from './ui/IconButton';

const ChatHistorySidebar = ({
  chats,
  activeChatId,
  onNewChat,
  onSelectChat,
  isCollapsed,
  onToggle,
  mobile = false,
}) => {
  const historyItems = chats ? Object.values(chats).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) : [];

  return (
    <div className={`chat-history ${isCollapsed ? 'is-collapsed' : ''} ${mobile ? 'is-mobile' : ''}`}>
      <div className="chat-history__header">
        {!isCollapsed && <h2>聊天记录</h2>}
        <IconButton icon={Plus} label="开始新聊天" onClick={onNewChat} />
      </div>

      <div className="chat-history__scroll">
        {!isCollapsed && <div className="chat-history__label">历史对话</div>}
        <ul className="chat-history__list">
          {historyItems.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={String(item.id) === String(activeChatId) ? 'is-active' : ''}
                onClick={() => onSelectChat(item.id)}
                title={item.title}
              >
                <MessageSquare size={17} aria-hidden="true" />
                {!isCollapsed && <span>{item.title || '未命名对话'}</span>}
              </button>
            </li>
          ))}
        </ul>
        {historyItems.length === 0 && !isCollapsed && (
          <p className="chat-history__empty">还没有历史对话</p>
        )}
      </div>

      {!mobile && (
        <div className="chat-history__footer">
          <button
            type="button"
            onClick={onToggle}
            title={isCollapsed ? '展开侧边栏' : '收起侧边栏'}
            aria-label={isCollapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            <PanelLeftClose size={18} className={isCollapsed ? 'is-flipped' : ''} />
            {!isCollapsed && <span>收起侧边栏</span>}
          </button>
        </div>
      )}
    </div>
  );
};

export default ChatHistorySidebar;
