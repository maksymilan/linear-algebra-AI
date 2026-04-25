import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, MessageSquare, PanelLeftClose, LayoutDashboard } from 'lucide-react';

const ChatHistorySidebar = ({ chats, activeChatId, onNewChat, onSelectChat, isCollapsed, onToggle }) => {
  const navigate = useNavigate(); 
  
  const historyItems = chats ? Object.values(chats).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) : [];

  return (
    <div className={`flex flex-col h-full bg-[#F8F9FA] text-[#212529] overflow-hidden ${isCollapsed ? 'w-[72px]' : 'w-[280px]'}`}>
      <div className="flex items-center justify-between p-4 border-b border-[#DEE2E6] shrink-0">
        {!isCollapsed && <h2 className="text-sm font-semibold m-0 text-[#212529]">聊天记录</h2>}
        <button 
            className="p-1.5 rounded-md hover:bg-[#DEE2E6] transition-colors text-[#212529] ml-auto" 
            onClick={onNewChat} 
            title="开始新聊天"
        >
            <Plus size={20} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        <button 
            className={`w-full flex items-center gap-3 p-2 rounded-lg text-sm transition-colors hover:bg-[#DEE2E6] text-[#212529] ${isCollapsed ? 'justify-center' : 'justify-start'}`}
            onClick={() => navigate('/workspace')} 
            title="返回工作区"
        >
            <LayoutDashboard size={20} className="shrink-0" />
            {!isCollapsed && <span>返回工作区</span>}
        </button>
        
        {!isCollapsed && <div className="pt-4 pb-2 px-2 text-xs font-medium text-[#868E96]">历史对话</div>}
        
        <ul className="space-y-1 m-0 p-0 list-none">
          {historyItems.map((item) => (
            <li 
              key={item.id} 
              className={`flex items-center gap-3 p-2 rounded-lg text-sm cursor-pointer transition-colors ${String(item.id) === String(activeChatId) ? 'bg-[#DEE2E6] font-medium' : 'hover:bg-[#DEE2E6] text-[#868E96] hover:text-[#212529]'} ${isCollapsed ? 'justify-center' : 'justify-start'}`}
              onClick={() => onSelectChat(item.id)}
              title={item.title}
            >
               <MessageSquare size={18} className="shrink-0" />
               {!isCollapsed && <span className="truncate">{item.title}</span>}
            </li>
          ))}
        </ul>
      </div>

       <div className="p-3 border-t border-[#DEE2E6] shrink-0">
         <button 
            className={`w-full flex items-center gap-3 p-2 rounded-lg text-sm transition-colors hover:bg-[#DEE2E6] text-[#868E96] hover:text-[#212529] ${isCollapsed ? 'justify-center' : 'justify-start'}`}
            onClick={onToggle} 
            title={isCollapsed ? "展开侧边栏" : "收起侧边栏"}
        >
            <PanelLeftClose size={20} className={`shrink-0 transition-transform ${isCollapsed ? 'rotate-180' : ''}`} />
            {!isCollapsed && <span>收起侧边栏</span>}
        </button>
      </div>
    </div>
  );
};

export default ChatHistorySidebar;