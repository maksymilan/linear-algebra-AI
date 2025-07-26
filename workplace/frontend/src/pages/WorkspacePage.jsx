import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import './WorkspacePage.css';

// --- 图标组件 ---
const PaperclipIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>
);

// 新增：用于“移除文件”按钮的小“X”图标
const CloseIcon = ({ size = 14 }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <line x1="18" y1="6" x2="6" y2="18"></line>
        <line x1="6" y1="6" x2="18" y2="18"></line>
    </svg>
);


const WorkspacePage = () => {
  const { logoutAction } = useAuth();
  const navigate = useNavigate();

  const [messages, setMessages] = useState([{ text: "你好！我是您的线性代数AI助教，请问有什么可以帮助您的吗？", sender: 'ai' }]);
  const [input, setInput] = useState('');
  const [files, setFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(scrollToBottom, [messages]);

  // --- 关键修复点 1: 允许多次选择并累积文件 ---
  const handleFileChange = (event) => {
    // 将新选择的文件追加到现有的文件列表中
    if (event.target.files) {
        setFiles(prevFiles => [...prevFiles, ...Array.from(event.target.files)]);
    }
  };

  // --- 关键修复点 2: 新增移除文件的功能 ---
  const handleRemoveFile = (indexToRemove) => {
    setFiles(prevFiles => prevFiles.filter((_, index) => index !== indexToRemove));
  };

  const handleSend = async (e) => {
    e.preventDefault();
    if ((input.trim() === '' && files.length === 0) || isLoading) return;

    let userMessageContent = `<div>${input}</div>`;
    if (files.length > 0) {
        userMessageContent += "<div><strong>附件:</strong>";
        files.forEach(file => { userMessageContent += ` ${file.name}`; });
        userMessageContent += "</div>";
    }
    const userMessage = { text: userMessageContent, sender: 'user' };
    setMessages(prev => [...prev, userMessage]);

    const formData = new FormData();
    formData.append('prompt', input);
    files.forEach(file => { formData.append('files', file); });

    setInput('');
    setFiles([]);
    setIsLoading(true);

    if (fileInputRef.current) {
      fileInputRef.current.value = null;
    }

    try {
      const response = await axios.post(
        'http://localhost:8080/api/chat/send',
        formData,
        { 
            headers: { 'Content-Type': 'multipart/form-data' } 
        }
      );

      let responseData = response.data;
      if (typeof responseData === 'string') {
          responseData = JSON.parse(responseData);
      }

      const aiMessageText = responseData.response;
      if (aiMessageText) {
        const aiMessage = { text: aiMessageText, sender: 'ai' };
        setMessages(prev => [...prev, aiMessage]);
      } else {
        const errorMessage = { text: "收到了来自AI的意外响应格式。", sender: 'ai' };
        setMessages(prev => [...prev, errorMessage]);
      }

    } catch (error) {
      console.error("Error fetching AI response:", error);
      const errorText = error.response?.data?.detail || "哎呀，出错了，请稍后再试。";
      const errorMessage = { text: errorText, sender: 'ai' };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogout = () => {
    logoutAction();
    navigate("/");
  };

  return (
    <div className="workspace-container">
      <div className="qa-panel">
        <div className="chat-window">
          <div className="messages-list">
            {messages.map((msg, index) => (
              <div key={index} className={`message ${msg.sender === 'user' ? 'user-message' : 'ai-message'}`}>
                <div dangerouslySetInnerHTML={{ __html: msg.text }} />
              </div>
            ))}
            {isLoading && (
              <div className="message ai-message"><i>AI思考中...</i></div>
            )}
            <div ref={messagesEndRef} />
          </div>
          
          {/* --- 关键修复点 3: 更新文件预览UI，使其支持移除 --- */}
          {files.length > 0 && (
              <div className="file-preview-area">
                  {files.map((file, i) => (
                    <div key={i} className="file-tag">
                        <span>{file.name}</span>
                        <button onClick={() => handleRemoveFile(i)} className="remove-file-button">
                            <CloseIcon />
                        </button>
                    </div>
                  ))}
              </div>
          )}

          <form className="message-form" onSubmit={handleSend}>
            <button type="button" className="attach-button" onClick={() => fileInputRef.current.click()}>
              <PaperclipIcon />
            </button>
            <input
              type="file" multiple ref={fileInputRef} onChange={handleFileChange}
              style={{ display: 'none' }} accept=".pdf,.txt,image/*"
            />
            <input
              type="text" className="text-input" value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="输入您的问题，或上传文件..." disabled={isLoading}
            />
            <button type="submit" className="send-button" disabled={isLoading}>
              {isLoading ? '...' : '发送'}
            </button>
          </form>
        </div>
      </div>
      <div id="canvas-container" className="visualization-panel">
        <div className="placeholder-text">可视化区域</div>
      </div>
      <button onClick={handleLogout} className="logout-button">退出登录</button>
    </div>
  );
}

export default WorkspacePage;
