import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../hooks/useAuth';
import { useNavigate, useParams } from 'react-router-dom';
import MessageList from '../components/MessageList';
import MessageInput from '../components/MessageInput';
import ChatHistorySidebar from '../components/ChatHistorySidebar';
import MathCalculator from '../components/MathCalculator';
import { Calculator } from 'lucide-react';

const API_BASE_URL = '';
const LAST_CHAT_ID_PREFIX = 'la-ai:last-chat-id';

const getLastChatStorageKey = (user) => `${LAST_CHAT_ID_PREFIX}:${user?.sub || user?.name || 'anonymous'}`;
const isRealSessionId = (id) => Boolean(id && id !== 'new' && !String(id).startsWith('temp-') && !Number.isNaN(Number(id)));
const normalizeMessages = (messages) => Array.isArray(messages) ? messages : [];
const isPremiumModelExhausted = (model, modelConfig) => {
    const limitedIds = modelConfig?.features?.limited_chat_model_ids || [];
    const remaining = modelConfig?.usage?.premium_chat?.remaining;
    return limitedIds.includes(model?.id) && typeof remaining === 'number' && remaining <= 0;
};

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
    const [isSending, setIsSending] = useState(false);
    const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(false);
    const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
    const [fetchedMessageSessionIds, setFetchedMessageSessionIds] = useState(() => new Set());
    const [modelConfig, setModelConfig] = useState(null);
    const [selectedModelId, setSelectedModelId] = useState('default');
    const activeRequestRef = useRef(null);
    const sendingRef = useRef(false);

    const activeChat = useMemo(() => chats[sessionId] || null, [chats, sessionId]);
    const activeMessages = useMemo(() => activeChat?.messages || [], [activeChat]);
    const lastChatStorageKey = useMemo(() => getLastChatStorageKey(user), [user]);

    useEffect(() => {
        if (token) axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
    }, [token]);

    const refreshModelConfig = useCallback(async () => {
        if (!token) return;
        try {
            const res = await axios.get(`${API_BASE_URL}/api/chat/models`);
            setModelConfig(res.data);
        } catch (error) {
            console.error("Failed to fetch model options:", error);
        }
    }, [token]);

    useEffect(() => {
        refreshModelConfig();
    }, [refreshModelConfig]);

    useEffect(() => {
        const models = modelConfig?.chat_models || [];
        if (models.length === 0) return;

        const selected = models.find(model => model.id === selectedModelId);
        if (!selected || isPremiumModelExhausted(selected, modelConfig)) {
            const fallback = models.find(model => !isPremiumModelExhausted(model, modelConfig)) || models[0];
            setSelectedModelId(fallback.id);
        }
    }, [modelConfig, selectedModelId]);
    
    useEffect(() => {
        if (!token) return;
        axios.get(`${API_BASE_URL}/api/chat/sessions`)
            .then(res => {
                const sessions = Array.isArray(res.data) ? res.data : [];
                setChats(prev => {
                    const next = {};
                    Object.entries(prev).forEach(([id, chat]) => {
                        if (String(id).startsWith('temp-')) next[id] = chat;
                    });
                    sessions.forEach(session => {
                        const existing = prev[session.id] || prev[String(session.id)];
                        next[session.id] = {
                            ...session,
                            messages: normalizeMessages(existing?.messages || session.messages),
                        };
                    });
                    return next;
                });

                if (!sessionId) {
                    const lastChatId = localStorage.getItem(lastChatStorageKey);
                    const hasLastChat = lastChatId && sessions.some(session => String(session.id) === String(lastChatId));
                    if (hasLastChat) {
                        navigate(`/chat/${lastChatId}`, { replace: true });
                    } else if (sessions.length > 0) {
                        navigate(`/chat/${sessions[0].id}`, { replace: true });
                    } else {
                        navigate('/chat/new', { replace: true });
                    }
                }
            })
            .catch(error => console.error("Failed to fetch sessions:", error));
    }, [token, sessionId, navigate, lastChatStorageKey]);

    useEffect(() => {
        if (isRealSessionId(sessionId)) {
            localStorage.setItem(lastChatStorageKey, String(sessionId));
        }
    }, [sessionId, lastChatStorageKey]);

    useEffect(() => {
        const isValidSessionId = isRealSessionId(sessionId);
        const hasLoadedMessages = normalizeMessages(chats[sessionId]?.messages).length > 0;
        const hasFetchedMessages = fetchedMessageSessionIds.has(String(sessionId));
        if (isValidSessionId && !hasLoadedMessages && !hasFetchedMessages) {
            setIsLoading(true);
            axios.get(`${API_BASE_URL}/api/chat/messages/${sessionId}`)
                .then(res => setChats(prev => ({
                    ...prev,
                    [sessionId]: {
                        ...(prev[sessionId] || { id: sessionId, title: '对话记录' }),
                        messages: normalizeMessages(res.data),
                    },
                })))
                .catch(error => console.error(`Failed to fetch messages for session ${sessionId}:`, error))
                .finally(() => {
                    setFetchedMessageSessionIds(prev => new Set(prev).add(String(sessionId)));
                    setIsLoading(false);
                });
        }
    }, [sessionId, chats, fetchedMessageSessionIds]);

    const removePendingRequestMessages = useCallback((request) => {
        setChats(prev => {
            const fallbackChatId = sessionId;
            const chatId = request?.chatId || fallbackChatId;
            const chat = prev[chatId];
            if (!chat) return prev;
            if (request?.isNewChat) {
                const next = { ...prev };
                delete next[chatId];
                return next;
            }
            return {
                ...prev,
                [chatId]: {
                    ...chat,
                    messages: normalizeMessages(chat.messages).filter(msg => (
                        request?.requestId ? msg.pendingRequestId !== request.requestId : !msg.pendingRequestId
                    )),
                },
            };
        });
    }, [sessionId]);

    const handleSend = async () => {
        if ((input.trim() === '' && files.length === 0) || isSending || sendingRef.current) return;
        sendingRef.current = true;
    
        const isTempSession = String(sessionId || '').startsWith('temp-');
        const isNewChat = !isRealSessionId(sessionId);
        const tempChatId = isNewChat ? (isTempSession ? sessionId : `temp-${Date.now()}`) : sessionId;
        const draftInput = input;
        const draftFiles = files;
        const requestId = `req-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    
        const userMessage = { 
            id: `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            text: draftInput.trim(), 
            sender: 'user', 
            files: draftFiles.map(f => ({ name: f.name, url: URL.createObjectURL(f) })),
            pendingRequestId: requestId,
        };
        const requestStartedAt = performance.now();
        const controller = new AbortController();
        const request = {
            controller,
            chatId: tempChatId,
            requestId,
            isNewChat,
            draftInput,
            draftFiles,
        };
        activeRequestRef.current = request;
    
        if (isNewChat && !isTempSession) {
            navigate(`/chat/${tempChatId}`, { replace: true });
        }
    
        setChats(prev => ({
            ...prev,
            [tempChatId]: {
                ...(prev[tempChatId] || { id: tempChatId, title: '正在生成标题...' }),
                messages: [...(prev[tempChatId]?.messages || []), userMessage],
            },
        }));
    
        const formData = new FormData();
        formData.append('prompt', draftInput);
        draftFiles.forEach(file => formData.append('files', file));
        formData.append('is_first_message', String(isNewChat));
        formData.append('model_id', selectedModelId);
        if (!isNewChat) formData.append('chat_session_id', sessionId);
    
        setInput('');
        setFiles([]);
        setIsSending(true);
    
        try {
            const res = await axios.post(`${API_BASE_URL}/api/chat/send`, formData, {
                signal: controller.signal,
            });
            const { session: newSessionData, ai_response: aiResponseData } = res.data;
            const elapsedMs = Math.max(0, Math.round(performance.now() - requestStartedAt));
    
            setChats(prev => {
                const newChats = { ...prev };
                if (isNewChat) delete newChats[tempChatId];
                const sessionMessages = normalizeMessages(newSessionData.messages);
                const lastAiIndex = [...sessionMessages].map(msg => msg.sender).lastIndexOf('ai');
                if (lastAiIndex >= 0 && sessionMessages[lastAiIndex].responseDurationMs == null) {
                    sessionMessages[lastAiIndex] = {
                        ...sessionMessages[lastAiIndex],
                        responseDurationMs: elapsedMs,
                    };
                }
                newChats[newSessionData.id] = {
                    ...newSessionData,
                    messages: sessionMessages,
                };
                return newChats;
            });
    
            if (isNewChat) {
                navigate(`/chat/${newSessionData.id}`, { replace: true });
            }
            if (newSessionData?.id) {
                localStorage.setItem(lastChatStorageKey, String(newSessionData.id));
            }
            refreshModelConfig();
    
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
            if (axios.isCancel(error) || error?.code === 'ERR_CANCELED') {
                if (!request.cancelHandled) {
                    removePendingRequestMessages(request);
                    setInput(draftInput);
                    setFiles(draftFiles);
                    if (isNewChat) {
                        navigate('/chat/new', { replace: true });
                    }
                }
                return;
            }
            console.error("Error sending message:", error);
            const errorMessage = error?.response?.data?.error || '发送失败，请稍后重试。';
            window.alert(errorMessage);
            refreshModelConfig();
        } finally {
            if (activeRequestRef.current?.requestId === requestId) {
                activeRequestRef.current = null;
                sendingRef.current = false;
                setIsSending(false);
            }
        }
    };

    const handleCancelSend = () => {
        const request = activeRequestRef.current;
        if (request) {
            request.cancelHandled = true;
            request.controller.abort();
        }
        removePendingRequestMessages(request);
        setInput(request?.draftInput || input);
        setFiles(request?.draftFiles || files);
        if (request?.isNewChat) {
            navigate('/chat/new', { replace: true });
        }
        activeRequestRef.current = null;
        sendingRef.current = false;
        setIsSending(false);
    };

    const handleOpenVisualizer = () => {
        const returnTo = isRealSessionId(sessionId) ? `/chat/${sessionId}` : '/chat/new';
        if (isRealSessionId(sessionId)) {
            localStorage.setItem(lastChatStorageKey, String(sessionId));
        }
        navigate(`/visualizer?returnTo=${encodeURIComponent(returnTo)}`);
    };

    const premiumUsage = modelConfig?.usage?.premium_chat;
    const chatModels = modelConfig?.chat_models || [];
    
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
                        <div className="min-w-0 flex-1">
                            <h2 className="m-0 text-lg font-semibold overflow-hidden text-ellipsis whitespace-nowrap">
                                {activeChat?.title || (String(sessionId || '').startsWith('temp-') ? '新会话...' : '开始新对话')}
                            </h2>
                            {premiumUsage && (
                                <p className="m-0 mt-1 text-xs text-[#868E96]">
                                    高级模型额度：{premiumUsage.remaining}/{premiumUsage.limit}
                                </p>
                            )}
                        </div>
                        <div className="flex gap-2 shrink-0">
                            <button 
                                className="flex items-center gap-2 px-4 py-2 border border-[#DEE2E6] rounded-md text-[#868E96] bg-transparent cursor-pointer transition-colors hover:bg-[#F1F3F5] hover:text-[#000000] hover:border-[#000000]"
                                onClick={handleOpenVisualizer}
                                title="打开独立的可视化引擎"
                            >
                                <VisIcon />
                                打开可视化工具
                            </button>
                        </div>
                    </div>

                    {chatModels.length > 0 && (
                        <div className="flex flex-wrap items-center gap-2 py-3 border-b border-[#E9ECEF] shrink-0">
                            <span className="text-xs text-[#868E96] mr-1">模型</span>
                            {chatModels.map(model => {
                                const disabled = isPremiumModelExhausted(model, modelConfig);
                                const selected = selectedModelId === model.id;
                                return (
                                    <button
                                        key={model.id}
                                        type="button"
                                        disabled={disabled || isSending}
                                        onClick={() => setSelectedModelId(model.id)}
                                        className={`px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                                            selected
                                                ? 'bg-black text-white border-black'
                                                : disabled
                                                    ? 'bg-[#F1F3F5] text-[#ADB5BD] border-[#DEE2E6] cursor-not-allowed'
                                                    : 'bg-white text-[#495057] border-[#DEE2E6] hover:border-black hover:text-black'
                                        }`}
                                        title={disabled ? '今日高级模型额度已用完，明天自动恢复' : model.model}
                                    >
                                        {model.label || model.id}
                                        {model.daily_limited && (
                                            <span className={`ml-1 ${selected ? 'text-white/75' : disabled ? 'text-[#ADB5BD]' : 'text-[#868E96]'}`}>
                                                限额
                                            </span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {sessionId === 'new' && activeMessages.length === 0 && !isLoading && !isSending ? (
                        <div className="flex-1 flex flex-col justify-center items-center text-center pb-[20vh]">
                            <div className="w-16 h-16 rounded-full bg-[#F1F3F5] flex items-center justify-center mb-6 text-[#212529]">
                                <AiIcon />
                            </div>
                            <h1 className="text-3xl font-bold mb-4">AI 助教</h1>
                            <p className="text-[#868E96] text-lg">你好, {user?.displayName || user?.name}！有什么线性代数的问题吗？</p>
                        </div>
                    ) : (
                        <MessageList messages={activeMessages} isLoading={isSending} user={user} />
                    )}

                    <div className="shrink-0 w-full bg-[#FFFFFF] pb-6 pt-2">
                        <MessageInput 
                            input={input} 
                            setInput={setInput} 
                            files={files} 
                            setFiles={setFiles} 
                            onSend={handleSend} 
                            onCancel={handleCancelSend}
                            isLoading={isSending} 
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
