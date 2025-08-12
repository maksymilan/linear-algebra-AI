import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../hooks/useAuth';
import { useNavigate, useParams } from 'react-router-dom';
import MessageList from '../components/MessageList';
import MessageInput from '../components/MessageInput';
import ChatHistorySidebar from '../components/ChatHistorySidebar';
import VisualizationCanvas from '../components/VisualizationCanvas';
import './ChatPage.css';

const API_BASE_URL = 'http://localhost:8080';

// --- 图标 ---
const AiIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 8V4H8"/><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M2 14h2"/><path d="M20 14h2"/><path d="M15 2v2"/><path d="M9 2v2"/></svg>;
const VisIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>;

const ChatPage = () => {
    const { user, token } = useAuth();
    const navigate = useNavigate();
    const { sessionId } = useParams();

    const [chats, setChats] = useState({});
    const [input, setInput] = useState('');
    const [files, setFiles] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(false);
    
    // 为2D和3D分别维护状态，确保用户编辑不丢失
    const [isVisPanelCollapsed, setIsVisPanelCollapsed] = useState(true);
    const [dimension, setDimension] = useState(2);
    const [matrix2d, setMatrix2d] = useState([[1, 0], [0, 1]]);
    const [matrix3d, setMatrix3d] = useState([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);

    const activeChat = useMemo(() => chats[sessionId] || null, [chats, sessionId]);
    const activeMessages = useMemo(() => activeChat?.messages || [], [activeChat]);

    // 根据当前维度选择正确的矩阵和设置函数
    const currentMatrix = dimension === 2 ? matrix2d : matrix3d;
    const setCurrentMatrix = dimension === 2 ? setMatrix2d : setMatrix3d;

    useEffect(() => {
        if (token) axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }, [token]);
    
    useEffect(() => {
        axios.get(`${API_BASE_URL}/api/chat/sessions`)
            .then(res => {
                const sessions = Array.isArray(res.data) ? res.data : [];
                setChats(sessions.reduce((acc, session) => {
                    acc[session.id] = { ...session, messages: [] };
                    return acc;
                }, {}));
            })
            .catch(error => console.error("Failed to fetch sessions:", error));
    }, []);

    useEffect(() => {
        const isValidSessionId = sessionId && !isNaN(sessionId) && sessionId !== 'new';
        if (isValidSessionId && (!chats[sessionId] || chats[sessionId].messages.length === 0)) {
            setIsLoading(true);
            axios.get(`${API_BASE_URL}/api/chat/messages/${sessionId}`)
                .then(res => setChats(prev => ({
                    ...prev,
                    [sessionId]: { ...prev[sessionId], messages: Array.isArray(res.data) ? res.data : [] },
                })))
                .catch(error => console.error(`Failed to fetch messages for session ${sessionId}:`, error))
                .finally(() => setIsLoading(false));
        }
    }, [sessionId, Object.keys(chats).length]);

    const handleSend = async () => {
        if ((input.trim() === '' && files.length === 0) || isLoading) return;
    
        const isNewChat = sessionId === 'new' || sessionId.startsWith('temp-');
        const tempChatId = isNewChat ? (sessionId.startsWith('temp-') ? sessionId : `temp-${Date.now()}`) : sessionId;
    
        const userMessage = { 
            id: `msg-${Date.now()}`,
            text: input.trim(), 
            sender: 'user', 
            files: files.map(f => ({ name: f.name, url: URL.createObjectURL(f) }))
        };
    
        if (isNewChat && !sessionId.startsWith('temp-')) {
            navigate(`/chat/${tempChatId}`, { replace: true });
        }
    
        setChats(prev => ({
            ...prev,
            [tempChatId]: {
                ...(prev[tempChatId] || { id: tempChatId, title: '新会话...' }),
                messages: [...(prev[tempChatId]?.messages || []), userMessage],
            },
        }));
    
        const formData = new FormData();
        formData.append('prompt', input);
        files.forEach(file => formData.append('files', file));
        formData.append('is_first_message', String(isNewChat));
        if (!isNewChat) formData.append('chat_session_id', sessionId);
    
        setInput('');
        setFiles([]);
        setIsLoading(true);
    
        try {
            const res = await axios.post(`${API_BASE_URL}/api/chat/send`, formData);
            const { session: newSessionData, ai_response: aiResponseData } = res.data;
    
            setChats(prev => {
                const newChats = { ...prev };
                if (isNewChat) delete newChats[tempChatId];
                newChats[newSessionData.id] = newSessionData;
                return newChats;
            });
    
            if (isNewChat) {
                navigate(`/chat/${newSessionData.id}`, { replace: true });
            }
    
            // **最终修复：采用最稳健的逻辑处理AI响应**
            if (aiResponseData && aiResponseData.visualizations) {
                const viz = aiResponseData.visualizations;
                let hasVizUpdate = false;
                
                let nextDimension = dimension;
                let nextMatrix2d = matrix2d;
                let nextMatrix3d = matrix3d;

                if (viz['2d']?.matrix) {
                    nextMatrix2d = viz['2d'].matrix;
                    nextDimension = 2; // 优先展示2D视图
                    hasVizUpdate = true;
                }
                if (viz['3d']?.matrix) {
                    nextMatrix3d = viz['3d'].matrix;
                    if (!hasVizUpdate) { // 只有在没有2D数据时，才将默认展示维度设为3D
                        nextDimension = 3;
                    }
                    hasVizUpdate = true;
                }
                
                if (hasVizUpdate) {
                    // 一次性应用所有状态更新
                    setMatrix2d(nextMatrix2d);
                    setMatrix3d(nextMatrix3d);
                    setDimension(nextDimension);
                    // 强制打开面板
                    setIsVisPanelCollapsed(false);
                }
            }
    
        } catch (error) {
            console.error("Error sending message:", error);
        } finally {
            setIsLoading(false);
        }
    };
    
    return (
        <div className="chat-page-container">
            <aside className={`chat-history-panel ${isHistoryCollapsed ? 'collapsed' : ''}`}>
                <ChatHistorySidebar 
                    chats={chats} 
                    activeChatId={sessionId} 
                    onNewChat={() => navigate('/chat/new')} 
                    onSelectChat={(id) => navigate(`/chat/${id}`)}
                    isCollapsed={isHistoryCollapsed}
                    onToggle={() => setIsHistoryCollapsed(!isHistoryCollapsed)}
                />
            </aside>

            <main className="qa-panel">
                <div className="chat-window">
                    <div className="chat-window-header">
                        <h2>{activeChat?.title || (sessionId.startsWith('temp-') ? '新会话...' : '开始新对话')}</h2>
                        <div className="actions">
                            <button 
                                className="vis-toggle-button" 
                                onClick={() => setIsVisPanelCollapsed(!isVisPanelCollapsed)}
                                title="显示/隐藏可视化面板"
                            >
                                <VisIcon />
                                {isVisPanelCollapsed ? '显示可视化' : '隐藏可视化'}
                            </button>
                        </div>
                    </div>

                    {sessionId === 'new' && activeMessages.length === 0 && !isLoading ? (
                        <div className="welcome-screen">
                            <div className="welcome-logo"><AiIcon /></div>
                            <h1>AI 助教</h1>
                            <p>你好, {user?.displayName || user?.name}！有什么线性代数的问题吗？</p>
                        </div>
                    ) : (
                        <MessageList messages={activeMessages} isLoading={isLoading} user={user} />
                    )}
                    <div className="message-form-container">
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
            </main>
            
            <aside className={`visualization-panel ${isVisPanelCollapsed ? 'collapsed' : ''}`}>
                <VisualizationCanvas 
                    key={dimension}
                    dimension={dimension}
                    matrix={currentMatrix}
                    onDimensionChange={setDimension}
                    onMatrixChange={setCurrentMatrix}
                />
            </aside>
        </div>
    );
};

export default ChatPage;
