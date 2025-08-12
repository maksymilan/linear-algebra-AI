// src/components/MessageList.jsx

import React, { useEffect, useRef } from 'react';
import AiResponse from './AiResponse';

const FileIcon = () => (
    <svg className="file-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
        <polyline points="13 2 13 9 20 9"></polyline>
    </svg>
);

const Avatar = ({ sender, user }) => {
    const aiAvatar = (
        <div className="avatar ai-avatar">
            <img src="/logo.svg" alt="AI Avatar" />
        </div>
    );

    const userAvatar = user?.avatarUrl ? (
        <img src={user.avatarUrl} alt={user.displayName || user.name} className="avatar user-avatar" />
    ) : (
        <div className="avatar user-avatar-placeholder">
            {(user?.displayName || user?.name || 'U').charAt(0).toUpperCase()}
        </div>
    );
    
    return sender === 'user' ? userAvatar : aiAvatar;
};

// 安全地将纯文本转换为可以显示的HTML（仅处理换行）
const UserMessageContent = ({ text }) => {
    return (
        <div>
            {String(text).split('\n').map((line, index, arr) => (
                <React.Fragment key={index}>
                    {line}
                    {index < arr.length - 1 && <br />}
                </React.Fragment>
            ))}
        </div>
    );
};

const MessageList = ({ messages, isLoading, user }) => {
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading]);

  // **关键修复：在渲染前过滤掉所有来自 "system" 的消息**
  const visibleMessages = messages.filter(msg => msg.sender !== 'system');

  return (
    <div className="messages-list">
      {visibleMessages.map((msg) => (
        <div key={msg.id} className={`message-container ${msg.sender === 'user' ? 'user' : 'ai'}`}>
            <Avatar sender={msg.sender} user={user} />
            <div className={`message ${msg.sender === 'user' ? 'user-message' : 'ai-message'}`}>
                {msg.text && (
                    msg.sender === 'ai' 
                        ? <AiResponse content={msg.text} /> 
                        : <UserMessageContent text={msg.text} />
                )}

                {msg.files && msg.files.length > 0 && (
                    <div className="message-files-container">
                    {msg.files.map((file, fileIndex) => (
                        <a 
                        key={fileIndex} 
                        href={file.url} 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="file-link"
                        title={`在新标签页中打开 ${file.name}`}
                        >
                        <FileIcon />
                        <span className="file-link-name">{file.name}</span>
                        </a>
                    ))}
                    </div>
                )}
            </div>
        </div>
      ))}
      {isLoading && (
          <div className="message-container ai">
            <Avatar sender="ai" user={user} />
            <div className="message ai-message">
                <div className="typing-indicator">
                    <span></span><span></span><span></span>
                </div>
            </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
};

export default MessageList;
