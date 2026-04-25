import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import AiResponse from './AiResponse';
import { ThumbsUp, ThumbsDown, FileText, BookOpen, ChevronDown, ChevronUp } from 'lucide-react';
import autoWrapMath from '../utils/autoWrapMath';

const Avatar = ({ sender, user }) => {
    const aiAvatar = (
        <div className="w-8 h-8 rounded-full bg-black flex items-center justify-center text-white shrink-0 shadow-sm">
            <span className="font-bold text-xs">AI</span>
        </div>
    );

    const userAvatar = user?.avatarUrl ? (
        <img src={user.avatarUrl} alt={user.displayName || user.name} className="w-8 h-8 rounded-full shrink-0 shadow-sm object-cover" />
    ) : (
        <div className="w-8 h-8 rounded-full bg-gray-300 flex items-center justify-center text-gray-700 shrink-0 shadow-sm">
            <span className="font-bold text-xs">{(user?.displayName || user?.name || 'U').charAt(0).toUpperCase()}</span>
        </div>
    );
    
    return sender === 'user' ? userAvatar : aiAvatar;
};

const UserMessageContent = ({ text }) => {
    return (
        <div className="text-[15px] leading-relaxed">
            {String(text).split('\n').map((line, index, arr) => (
                <React.Fragment key={index}>
                    {line}
                    {index < arr.length - 1 && <br />}
                </React.Fragment>
            ))}
        </div>
    );
};

// 参考教材折叠卡片：展示 RAG 检索到的片段出处
const CitationCard = ({ citations }) => {
    const [open, setOpen] = useState(false);
    if (!Array.isArray(citations) || citations.length === 0) return null;

    const uniqueBooks = Array.from(new Set(citations.map(c => c?.textbook_name).filter(Boolean)));

    return (
        <div className="mt-2 border border-[#DEE2E6] bg-white rounded-lg overflow-hidden">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs text-[#495057] hover:bg-[#F8F9FA] transition-colors"
            >
                <span className="inline-flex items-center gap-1.5">
                    <BookOpen size={14} className="text-[#212529]" />
                    <span className="font-medium">
                        参考教材 · {citations.length} 条
                    </span>
                    {uniqueBooks.length > 0 && (
                        <span className="text-[#868E96] truncate max-w-[260px]">
                            （{uniqueBooks.slice(0, 2).join('、')}
                            {uniqueBooks.length > 2 ? ` 等 ${uniqueBooks.length} 本` : ''}）
                        </span>
                    )}
                </span>
                {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>

            {open && (
                <ul className="divide-y divide-[#E9ECEF]">
                    {citations.map((c, i) => {
                        const loc = [
                            c?.week_num != null ? `第 ${c.week_num} 周` : null,
                            c?.page_num != null ? `第 ${c.page_num} 页` : null,
                        ].filter(Boolean).join(' · ');
                        return (
                            <li key={i} className="px-3 py-2.5 text-xs">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="font-medium text-[#212529] truncate">
                                        [{c?.index ?? i + 1}] 《{c?.textbook_name || '未知教材'}》
                                    </div>
                                    {typeof c?.distance === 'number' && (
                                        <span className="shrink-0 font-mono text-[10px] text-[#868E96]">
                                            距离 {c.distance.toFixed(3)}
                                        </span>
                                    )}
                                </div>
                                {loc && (
                                    <div className="text-[#868E96] mt-0.5">{loc}</div>
                                )}
                                {c?.snippet && (
                                    <div className="mt-1.5 text-[#495057] leading-relaxed text-xs">
                                        <AiResponse content={autoWrapMath(c.snippet)} />
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
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

  const visibleMessages = messages.filter(msg => msg.sender !== 'system');

  const handleFeedback = async (messageId, score) => {
      try {
          await axios.post(`http://localhost:8080/api/chat/messages/${messageId}/feedback`, { score });
          // In a real app, you would update the local state to show it was submitted
          // For now, we just rely on visual feedback or state management in parent if needed
      } catch (err) {
          console.error("Failed to submit feedback:", err);
      }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-6 bg-[#FFFFFF]">
      {visibleMessages.map((msg, index) => (
        <div key={msg.id || `msg-${index}`} className={`flex gap-4 ${msg.sender === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
            <Avatar sender={msg.sender} user={user} />
            <div className={`max-w-[80%] flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                <div 
                    className={`px-5 py-3.5 rounded-2xl shadow-sm ${
                        msg.sender === 'user' 
                            ? 'bg-[#000000] text-white rounded-tr-sm' 
                            : 'bg-[#F1F3F5] text-[#212529] rounded-tl-sm'
                    }`}
                >
                    {(msg.text || msg.content) && (
                        msg.sender === 'ai' 
                            ? <AiResponse content={autoWrapMath(msg.text || msg.content)} /> 
                            : <UserMessageContent text={msg.text || msg.content} />
                    )}

                    {msg.files && msg.files.length > 0 && (
                        <div className="mt-3 space-y-2">
                        {msg.files.map((file, fileIndex) => (
                            <a 
                                key={fileIndex} 
                                href={file.url} 
                                target="_blank" 
                                rel="noopener noreferrer" 
                                className={`flex items-center gap-2 p-2 rounded border text-sm transition-colors ${
                                    msg.sender === 'user' 
                                        ? 'bg-gray-800 border-gray-700 hover:bg-gray-700 text-gray-200' 
                                        : 'bg-white border-gray-200 hover:bg-gray-50 text-gray-600'
                                }`}
                                title={`在新标签页中打开 ${file.name}`}
                            >
                                <FileText size={16} />
                                <span className="truncate max-w-[200px]">{file.name}</span>
                            </a>
                        ))}
                        </div>
                    )}
                </div>

                {/* AI 消息的教材引用卡片 */}
                {msg.sender === 'ai' && <CitationCard citations={msg.citations} />}

                {/* AI 反馈按钮 */}
                {msg.sender === 'ai' && msg.id && !String(msg.id).startsWith('msg-') && (
                    <div className="flex gap-2 mt-1.5 ml-2 text-gray-400">
                        <button 
                            onClick={() => handleFeedback(msg.id, 1)}
                            className="p-1 hover:text-black hover:bg-gray-100 rounded transition-colors"
                            title="有帮助"
                        >
                            <ThumbsUp size={14} />
                        </button>
                        <button 
                            onClick={() => handleFeedback(msg.id, -1)}
                            className="p-1 hover:text-black hover:bg-gray-100 rounded transition-colors"
                            title="没看懂"
                        >
                            <ThumbsDown size={14} />
                        </button>
                    </div>
                )}
            </div>
        </div>
      ))}
      
      {isLoading && (
          <div className="flex gap-4 flex-row">
            <Avatar sender="ai" user={user} />
            <div className="max-w-[80%] flex flex-col items-start">
                <div className="px-5 py-4 rounded-2xl rounded-tl-sm bg-[#F1F3F5] shadow-sm flex items-center gap-1.5">
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }}></div>
                </div>
            </div>
        </div>
      )}
      <div ref={messagesEndRef} className="h-4" />
    </div>
  );
};

export default MessageList;
