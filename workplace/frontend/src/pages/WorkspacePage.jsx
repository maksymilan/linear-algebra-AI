// src/pages/WorkspacePage.jsx
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import MessageList from '../components/MessageList';
import MessageInput from '../components/MessageInput';
import ChatHistorySidebar from '../components/ChatHistorySidebar';
import './WorkspacePage.css';

// --- Icon Components ---
const LogoutIcon = () => <svg className="control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>;
const PanelCollapseIcon = () => <svg className="control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>;
const PanelExpandIcon = () => <svg className="control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 15v6h6M21 9V3h-6M3 9l7-7M21 15l-7 7"/></svg>;

// --- V V V 核心修改 1: 移除初始消息 V V V ---
const initialChatId = `chat-${Date.now()}`;
const initialChats = {
  [initialChatId]: {
    id: initialChatId,
    title: "新的聊天",
    messages: [] // messages 数组现在为空
  }
};
// --- ^ ^ ^ 核心修改 1 ^ ^ ^ ---

const WorkspacePage = () => {
  const { logoutAction, token, user } = useAuth();
  const navigate = useNavigate();

  const [chats, setChats] = useState(initialChats);
  const [activeChatId, setActiveChatId] = useState(initialChatId);
  const [input, setInput] = useState('');
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(true);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [sidebarHover, setSidebarHover] = useState(false);
  
  const activeMessages = chats[activeChatId]?.messages || [];

  // --- V V V 核心修改 3: 调整标题生成逻辑 V V V ---
  useEffect(() => {
    const activeChat = chats[activeChatId];
    // 当消息数量为1（即用户发送了第一条消息后）且标题仍为默认值时
    if (activeChat && activeChat.messages.length === 1 && activeChat.title === "新的聊天") {
      const firstUserMessage = activeChat.messages[0].text;
      const newTitle = firstUserMessage.substring(0, 30) + (firstUserMessage.length > 30 ? '...' : '');
      setChats(prevChats => ({
        ...prevChats,
        [activeChatId]: { ...prevChats[activeChatId], title: newTitle }
      }));
    }
  }, [chats, activeChatId]);
  // --- ^ ^ ^ 核心修改 3 ^ ^ ^ ---

  const handleSend = async () => {
    if ((input.trim() === '' && files.length === 0) || isLoading) return;
    const filesWithUrls = files.map(file => ({ file: file, name: file.name, url: URL.createObjectURL(file) }));
    const userMessage = { text: input.trim(), sender: 'user', files: filesWithUrls };
    setChats(prevChats => ({ ...prevChats, [activeChatId]: { ...prevChats[activeChatId], messages: [...prevChats[activeChatId].messages, userMessage] } }));
    const formData = new FormData();
    formData.append('prompt', input);
    filesWithUrls.forEach(fileWrapper => { formData.append('files', fileWrapper.file); });
    setInput('');
    setFiles([]);
    setIsLoading(true);
    try {
      const response = await axios.post('http://localhost:8080/api/chat/send', formData, { headers: { 'Content-Type': 'multipart/form-data', 'Authorization': `Bearer ${token}` } });
      const aiResponseData = response.data;
      setChats(prevChats => {
          let aiMessageText;
          if (aiResponseData.response) aiMessageText = aiResponseData.response;
          else if (aiResponseData.text_explanation) aiMessageText = aiResponseData.text_explanation;
          else aiMessageText = "收到了无法解析的回复格式。";
          const aiMessage = { text: aiMessageText, sender: 'ai' };
          const currentMessages = prevChats[activeChatId].messages;
          const lastUserMessage = currentMessages[currentMessages.length - 1];
          if (lastUserMessage && lastUserMessage.files) { lastUserMessage.files.forEach(f => URL.revokeObjectURL(f.url)); }
          return { ...prevChats, [activeChatId]: { ...prevChats[activeChatId], messages: [...currentMessages, aiMessage] } };
      });
    } catch (error) {
      console.error("Error fetching AI response:", error);
      const errorText = error.response?.data?.error || error.response?.data?.detail || "哎呀，出错了，请稍后再试。";
      const errorMessage = { text: errorText, sender: 'ai' };
      setChats(prevChats => ({ ...prevChats, [activeChatId]: { ...prevChats[activeChatId], messages: [...prevChats[activeChatId].messages, errorMessage] } }));
    } finally {
      setIsLoading(false);
    }
  };

  // --- V V V 核心修改 2: 新对话不包含初始消息 V V V ---
  const handleNewChat = () => {
      const newChatId = `chat-${Date.now()}`;
      setChats(prevChats => ({
          ...prevChats,
          [newChatId]: {
              id: newChatId,
              title: "新的聊天",
              messages: [] // 新对话的消息列表也为空
          }
      }));
      setActiveChatId(newChatId);
      setInput('');
      setFiles([]);
  };
  // --- ^ ^ ^ 核心修改 2 ^ ^ ^ ---
  
  const handleSelectChat = (chatId) => {
      setActiveChatId(chatId);
  };
  
  const toggleSidebar = () => {
    setIsSidebarCollapsed(prev => !prev);
  };

  const handleLogout = () => {
    logoutAction();
    navigate("/");
  };

  return (
    <div className="workspace-container">
      <div 
        className={`sidebar-wrapper ${isSidebarCollapsed && !sidebarHover ? 'collapsed' : ''}`}
        onMouseEnter={() => { if (isSidebarCollapsed) setSidebarHover(true); }}
        onMouseLeave={() => { if (isSidebarCollapsed) setSidebarHover(false); }}
      >
        <ChatHistorySidebar
          chats={chats}
          activeChatId={activeChatId}
          onNewChat={handleNewChat}
          onSelectChat={handleSelectChat}
          isCollapsed={isSidebarCollapsed && !sidebarHover}
          onToggle={toggleSidebar}
        />
      </div>

      <div className="qa-panel">
        <div className="chat-window">
          {/* --- V V V 核心修改 4: 调整欢迎界面显示条件 V V V --- */}
          {activeMessages.length === 0 ? (
            <div className="welcome-screen">
              <div className="welcome-gradient-text">你好, {user?.displayName || user?.name || '用户'}</div>
              <p className="welcome-subtitle">今天有什么可以帮您的吗？</p>
            </div>
          ) : (
            <MessageList messages={activeMessages} isLoading={isLoading} user={user} />
          )}
          {/* --- ^ ^ ^ 核心修改 4 ^ ^ ^ --- */}
          
          <MessageInput
            input={input}
            setInput={setInput}
            files={files}
            setFiles={setFiles}
            onSend={handleSend}
            isLoading={isLoading}
          />
        </div>
      </div>
      
      <div className={`visualization-panel ${isPanelCollapsed ? 'collapsed' : ''}`}>
        <div className="panel-controls">
            <button onClick={() => setIsPanelCollapsed(!isPanelCollapsed)} className="control-button" title={isPanelCollapsed ? "展开面板" : "收起面板"}>
                {isPanelCollapsed ? <PanelExpandIcon /> : <PanelCollapseIcon />}
            </button>
            <button onClick={handleLogout} className="control-button" title="退出登录">
                <LogoutIcon />
            </button>
        </div>
        <div className="placeholder-text">
            {isPanelCollapsed ? '' : '可视化区域'}
        </div>
      </div>
    </div>
  );
};

export default WorkspacePage;