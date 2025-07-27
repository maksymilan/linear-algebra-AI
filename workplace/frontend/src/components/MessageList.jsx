// src/components/MessageList.jsx
import React, { useEffect, useRef } from 'react';

// 文件图标
const FileIcon = () => (
    <svg className="file-link-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path>
        <polyline points="13 2 13 9 20 9"></polyline>
    </svg>
);


// 头像组件
const Avatar = ({ sender, user }) => {
    // AI的头像
    const aiAvatar = (
        <div className="avatar ai-avatar">
            <img src="/logo.svg" alt="AI Avatar" />
        </div>
    );

    // 用户的头像
    const userAvatar = user?.avatarUrl ? (
        <img src={user.avatarUrl} alt={user.displayName || user.name} className="avatar user-avatar" />
    ) : (
        <div className="avatar user-avatar-placeholder">
            {(user?.displayName || user?.name || 'U').charAt(0)}
        </div>
    );
    
    return sender === 'user' ? userAvatar : aiAvatar;
};


const MessageList = ({ messages, isLoading, user }) => {
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages, isLoading]);

  return (
    <div className="messages-list">
      {messages.map((msg, index) => (
        <div key={index} className={`message-container ${msg.sender === 'user' ? 'user' : 'ai'}`}>
            <Avatar sender={msg.sender} user={user} />
            <div className={`message ${msg.sender === 'user' ? 'user-message' : 'ai-message'}`}>
                {/* 渲染消息文本 */}
                {/* 使用 condition to render div only if msg.text is not empty */}
                {msg.text && <div dangerouslySetInnerHTML={{ __html: msg.text }} />}

                {/* --- V V V 这是恢复的关键逻辑 V V V --- */}
                {/* 如果消息包含文件，则渲染文件列表 */}
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
                {/* --- ^ ^ ^ 这是恢复的关键逻辑 ^ ^ ^ --- */}
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