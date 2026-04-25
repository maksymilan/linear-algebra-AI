import React, { useState, useEffect, useMemo, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../hooks/useAuth';
import { useNavigate, useParams } from 'react-router-dom';
import MessageList from '../components/MessageList';
import MessageInput from '../components/MessageInput';
import ChatHistorySidebar from '../components/ChatHistorySidebar';
import MathCalculator from '../components/MathCalculator';
import { Calculator } from 'lucide-react';

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
    const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);

    const activeChat = useMemo(() => chats[sessionId] || null, [chats, sessionId]);
    const activeMessages = useMemo(() => activeChat?.messages || [], [activeChat]);

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
                
                let nextDimension = 2;
                let nextMatrix2d = null;
                let nextMatrix3d = null;

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
                    const matrixStr = nextDimension === 2 ? nextMatrix2d.flat().join(',') : nextMatrix3d.flat().join(',');
                    // 不再展开侧边栏，而是可以通过消息中的链接跳转到独立页面
                    // (此处可以选择自动跳转或让用户自己点链接)
                }
            }
    
        } catch (error) {
            console.error("Error sending message:", error);
        } finally {
            setIsLoading(false);
        }
    };
    
    return (
        <div className="flex h-screen w-screen fixed top-0 left-0 bg-[#FFFFFF] text-[#212529]">
            <aside className={`flex flex-col h-full bg-[#F8F9FA] border-r border-[#DEE2E6] shrink-0 transition-all duration-300 ${isHistoryCollapsed ? 'w-[72px] min-w-[72px]' : 'w-[280px]'}`}>
                <ChatHistorySidebar 
                    chats={chats} 
                    activeChatId={sessionId} 
                    onNewChat={() => navigate('/chat/new')} 
                    onSelectChat={(id) => navigate(`/chat/${id}`)}
                    isCollapsed={isHistoryCollapsed}
                    onToggle={() => setIsHistoryCollapsed(!isHistoryCollapsed)}
                />
            </aside>

            <main className="flex-1 h-full flex flex-col overflow-hidden">
                <div className="w-full max-w-[1000px] h-full mx-auto flex flex-col px-4 box-border">
                    <div className="flex justify-between items-center py-4 border-b border-[#DEE2E6] shrink-0">
                        <h2 className="m-0 text-lg font-semibold overflow-hidden text-ellipsis whitespace-nowrap">
                            {activeChat?.title || (sessionId.startsWith('temp-') ? '新会话...' : '开始新对话')}
                        </h2>
                        <div className="flex gap-2">
                            <button 
                                className="flex items-center gap-2 px-4 py-2 border border-[#DEE2E6] rounded-md text-[#868E96] bg-transparent cursor-pointer transition-colors hover:bg-[#F1F3F5] hover:text-[#000000] hover:border-[#000000]"
                                onClick={() => navigate('/visualizer')}
                                title="打开独立的可视化引擎"
                            >
                                <VisIcon />
                                打开可视化工具
                            </button>
                        </div>
                    </div>

                    {sessionId === 'new' && activeMessages.length === 0 && !isLoading ? (
                        <div className="flex-1 flex flex-col justify-center items-center text-center pb-[20vh]">
                            <div className="w-16 h-16 rounded-full bg-[#F1F3F5] flex items-center justify-center mb-6 text-[#212529]">
                                <AiIcon />
                            </div>
                            <h1 className="text-3xl font-bold mb-4">AI 助教</h1>
                            <p className="text-[#868E96] text-lg">你好, {user?.displayName || user?.name}！有什么线性代数的问题吗？</p>
                        </div>
                    ) : (
                        <MessageList messages={activeMessages} isLoading={isLoading} user={user} />
                    )}

                    <div className="shrink-0 w-full bg-[#FFFFFF] pb-6 pt-2">
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

            {/* 悬浮计算器 */}
            <MathCalculator isOpen={isCalculatorOpen} onClose={() => setIsCalculatorOpen(false)} />
            
            {/* 悬浮计算器唤出按钮 (FAB) */}
            {!isCalculatorOpen && (
                <button 
                    onClick={() => setIsCalculatorOpen(true)}
                    className="fixed bottom-8 right-8 w-14 h-14 bg-black text-white rounded-full shadow-lg hover:bg-gray-800 transition-all flex items-center justify-center z-40 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black"
                    title="打开矩阵计算器"
                >
                    <Calculator size={24} />
                </button>
            )}
        </div>
    );
};

export default ChatPage;
