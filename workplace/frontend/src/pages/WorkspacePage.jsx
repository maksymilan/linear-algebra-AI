// src/pages/WorkspacePage.jsx
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import MessageList from '../components/MessageList';
import MessageInput from '../components/MessageInput';
import ChatHistorySidebar from '../components/ChatHistorySidebar';
import VisualizationCanvas from '../components/VisualizationCanvas';
import './WorkspacePage.css';

// ... (Icon Components and initialChats remain the same) ...
const LogoutIcon = () => <svg className="control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>;
const PanelCollapseIcon = () => <svg className="control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>;
const PanelExpandIcon = () => <svg className="control-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 15v6h6M21 9V3h-6M3 9l7-7M21 15l-7 7"/></svg>;

const initialChatId = `chat-${Date.now()}`;
const initialChats = {
  [initialChatId]: {
    id: initialChatId,
    title: "新的聊天",
    messages: []
  }
};

const WorkspacePage = () => {
  const { logoutAction, token, user } = useAuth();
  const navigate = useNavigate();

  const [chats, setChats] = useState(initialChats);
  const [activeChatId, setActiveChatId] = useState(initialChatId);
  const [input, setInput] = useState('');
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [sidebarHover, setSidebarHover] = useState(false);
  
  const [isPanelCollapsed, setIsPanelCollapsed] = useState(true);
  const [dimension, setDimension] = useState(3);
  const [matrix, setMatrix] = useState([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
  const [selectedVector, setSelectedVector] = useState(null);

  const activeMessages = chats[activeChatId]?.messages || [];

  useEffect(() => {
    const activeChat = chats[activeChatId];
    if (activeChat && activeChat.messages.length === 1 && activeChat.title === "新的聊天") {
      const firstUserMessage = activeChat.messages[0].text;
      const newTitle = firstUserMessage.substring(0, 30) + (firstUserMessage.length > 30 ? '...' : '');
      setChats(prevChats => ({
        ...prevChats,
        [activeChatId]: { ...prevChats[activeChatId], title: newTitle }
      }));
    }
  }, [chats, activeChatId]);

  const handleMatrixChange = (newMatrix) => {
    setMatrix(newMatrix);
  };

  const handleDimensionChange = (dim) => {
    setDimension(dim);
    setMatrix(dim === 2 ? [[1, 0], [0, 1]] : [[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
    setSelectedVector(null); 
  };
  
  const handleVectorSelect = (vectorName) => {
      setSelectedVector(prev => prev === vectorName ? null : vectorName);
  };

  const handleSend = async () => {
    if ((input.trim() === '' && files.length === 0) || isLoading) return;
    setSelectedVector(null);
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
      const aiMessageText = aiResponseData.text_explanation || aiResponseData.response || "收到了无法解析的回复格式。";
      const aiMessage = { text: aiMessageText, sender: 'ai' };

      setChats(prevChats => {
          const currentMessages = prevChats[activeChatId].messages;
          const lastUserMessage = currentMessages[currentMessages.length - 1];
          if (lastUserMessage && lastUserMessage.files) { lastUserMessage.files.forEach(f => URL.revokeObjectURL(f.url)); }
          return { ...prevChats, [activeChatId]: { ...prevChats[activeChatId], messages: [...currentMessages, aiMessage] } };
      });

      if (aiResponseData.visualization_matrix) {
          const viz = aiResponseData.visualization_matrix;
          setDimension(viz.dimension);
          setMatrix(viz.matrix);
          setIsPanelCollapsed(false); 
      }

    } catch (error) {
      console.error("Error fetching AI response:", error);
      const errorText = error.response?.data?.error || error.response?.data?.detail || "哎呀，出错了，请稍后再试。";
      const errorMessage = { text: errorText, sender: 'ai' };

      // --- 核心修正点 ---
      setChats(prevChats => ({
        ...prevChats,
        [activeChatId]: {
          ...prevChats[activeChatId], // 1. 展开旧的聊天对象
          messages: [...prevChats[activeChatId].messages, errorMessage] // 2. 覆盖messages属性
        }
      }));
      // --- 修正结束 ---

    } finally {
      setIsLoading(false);
    }
  };

  const handleNewChat = () => {
      const newChatId = `chat-${Date.now()}`;
      setChats(prevChats => ({
          ...prevChats,
          [newChatId]: { id: newChatId, title: "新的聊天", messages: [] }
      }));
      setActiveChatId(newChatId);
      setInput('');
      setFiles([]);
  };
  
  const handleSelectChat = (chatId) => { setActiveChatId(chatId); };
  const toggleSidebar = () => { setIsSidebarCollapsed(prev => !prev); };
  const handleLogout = () => { logoutAction(); navigate("/"); };

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
          {activeMessages.length === 0 ? (
            <div className="welcome-screen">
              <div className="welcome-gradient-text">你好, {user?.displayName || user?.name || '用户'}</div>
              <p className="welcome-subtitle">今天有什么可以帮您的吗？</p>
            </div>
          ) : (
            <MessageList messages={activeMessages} isLoading={isLoading} user={user} />
          )}
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
        {!isPanelCollapsed && (
          <VisualizationCanvas
            dimension={dimension}
            matrix={matrix}
            onDimensionChange={handleDimensionChange}
            onMatrixChange={handleMatrixChange}
            selectedVector={selectedVector}
            onVectorSelect={handleVectorSelect}
          />
        )}
      </div>
    </div>
  );
};

export default WorkspacePage;