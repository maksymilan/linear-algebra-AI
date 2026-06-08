import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import axios from 'axios';
import { useAuth } from '../hooks/useAuth';
import { useNavigate, useParams } from 'react-router-dom';
import MessageList from '../components/MessageList';
import MessageInput from '../components/MessageInput';
import ChatHistorySidebar from '../components/ChatHistorySidebar';
import MathCalculator from '../components/MathCalculator';
import ChatNavigationRail from '../components/layout/ChatNavigationRail';
import Button from '../components/ui/Button';
import IconButton from '../components/ui/IconButton';
import { useToast } from '../contexts/ToastContext';
import { Blocks, Bot, Calculator, PanelLeft, X } from 'lucide-react';
import './ChatPage.css';

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

const ChatPage = () => {
    const { user, token } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();
    const { sessionId } = useParams();

    const [chats, setChats] = useState({});
    const [input, setInput] = useState('');
    const [files, setFiles] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isSending, setIsSending] = useState(false);
    const [isHistoryCollapsed, setIsHistoryCollapsed] = useState(false);
    const [isMobileHistoryOpen, setIsMobileHistoryOpen] = useState(false);
    const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
    const [fetchedMessageSessionIds, setFetchedMessageSessionIds] = useState(() => new Set());
    const [modelConfig, setModelConfig] = useState(null);
    const [selectedModelId, setSelectedModelId] = useState('default');
    const chatPageRef = useRef(null);
    const activeRequestRef = useRef(null);
    const sendingRef = useRef(false);

    const activeChat = useMemo(() => chats[sessionId] || null, [chats, sessionId]);
    const activeMessages = useMemo(() => activeChat?.messages || [], [activeChat]);
    const lastChatStorageKey = useMemo(() => getLastChatStorageKey(user), [user]);

    useLayoutEffect(() => {
        const previousBodyOverflow = document.body.style.overflow;
        const previousHtmlOverflow = document.documentElement.style.overflow;
        const previousScrollRestoration = window.history.scrollRestoration;
        const resetScrollPositions = () => {
            window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
            document.documentElement.scrollTop = 0;
            document.body.scrollTop = 0;

            const root = chatPageRef.current;
            if (!root) return;
            [
                root,
                ...root.querySelectorAll([
                    '.chat-global-rail',
                    '.chat-page__history',
                    '.chat-page__main',
                    '.chat-page__content',
                    '.chat-history',
                ].join(',')),
            ].forEach((element) => {
                element.scrollTop = 0;
                element.scrollLeft = 0;
            });
        };

        window.history.scrollRestoration = 'manual';
        document.body.style.overflow = 'hidden';
        document.documentElement.style.overflow = 'hidden';
        resetScrollPositions();

        const frameId = window.requestAnimationFrame(resetScrollPositions);
        const timerId = window.setTimeout(resetScrollPositions, 120);

        return () => {
            window.cancelAnimationFrame(frameId);
            window.clearTimeout(timerId);
            document.body.style.overflow = previousBodyOverflow;
            document.documentElement.style.overflow = previousHtmlOverflow;
            window.history.scrollRestoration = previousScrollRestoration;
        };
    }, []);

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
            const { session: newSessionData } = res.data;
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
            showToast(errorMessage, 'error');
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
        showToast('已取消本次生成，草稿已恢复', 'info');
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
        <div ref={chatPageRef} className={`chat-page ${isHistoryCollapsed ? 'is-history-collapsed' : ''}`}>
            <ChatNavigationRail />

            <aside className="chat-page__history">
                <ChatHistorySidebar 
                    chats={chats} 
                    activeChatId={sessionId} 
                    onNewChat={() => navigate('/chat/new')} 
                    onSelectChat={(id) => navigate(`/chat/${id}`)}
                    isCollapsed={isHistoryCollapsed}
                    onToggle={() => setIsHistoryCollapsed(!isHistoryCollapsed)}
                />
            </aside>

            <main className="chat-page__main">
                <div className="chat-page__content">
                    <header className="chat-page__header">
                        <IconButton
                            className="chat-page__mobile-history-button"
                            icon={PanelLeft}
                            label="打开聊天记录"
                            onClick={() => setIsMobileHistoryOpen(true)}
                        />
                        <div className="chat-page__heading">
                            <h1>
                                {activeChat?.title || (String(sessionId || '').startsWith('temp-') ? '新会话...' : '开始新对话')}
                            </h1>
                            {premiumUsage && (
                                <p>
                                    高级模型额度：{premiumUsage.remaining}/{premiumUsage.limit}
                                </p>
                            )}
                        </div>
                        <Button icon={Blocks} onClick={handleOpenVisualizer} className="chat-page__visualizer-button">
                            可视化工具
                        </Button>
                    </header>

                    {chatModels.length > 0 && (
                        <div className="chat-models" aria-label="选择对话模型">
                            <span className="chat-models__label">模型</span>
                            <div className="chat-models__scroll">
                            {chatModels.map(model => {
                                const disabled = isPremiumModelExhausted(model, modelConfig);
                                const selected = selectedModelId === model.id;
                                return (
                                    <button
                                        key={model.id}
                                        type="button"
                                        disabled={disabled || isSending}
                                        onClick={() => setSelectedModelId(model.id)}
                                        className={selected ? 'is-selected' : ''}
                                        title={disabled ? '今日高级模型额度已用完，明天自动恢复' : model.model}
                                    >
                                        {model.label || model.id}
                                        {model.daily_limited && (
                                            <span>限额</span>
                                        )}
                                    </button>
                                );
                            })}
                            </div>
                        </div>
                    )}

                    {sessionId === 'new' && activeMessages.length === 0 && !isLoading && !isSending ? (
                        <div className="chat-empty">
                            <div className="chat-empty__icon">
                                <Bot size={26} aria-hidden="true" />
                            </div>
                            <h2>从一个问题开始</h2>
                            <p>你好，{user?.displayName || user?.name}。我可以解释概念、检索教材，也可以陪你逐步解题。</p>
                        </div>
                    ) : (
                        <MessageList messages={activeMessages} isLoading={isSending} user={user} />
                    )}

                    <div className="chat-page__composer">
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

            {isMobileHistoryOpen && (
                <div className="chat-history-drawer__backdrop" onMouseDown={() => setIsMobileHistoryOpen(false)}>
                    <aside className="chat-history-drawer" onMouseDown={(event) => event.stopPropagation()}>
                        <div className="chat-history-drawer__top">
                            <strong>聊天记录</strong>
                            <IconButton icon={X} label="关闭聊天记录" onClick={() => setIsMobileHistoryOpen(false)} />
                        </div>
                        <ChatHistorySidebar
                            chats={chats}
                            activeChatId={sessionId}
                            onNewChat={() => {
                                setIsMobileHistoryOpen(false);
                                navigate('/chat/new');
                            }}
                            onSelectChat={(id) => {
                                setIsMobileHistoryOpen(false);
                                navigate(`/chat/${id}`);
                            }}
                            mobile
                        />
                    </aside>
                </div>
            )}

            <MathCalculator isOpen={isCalculatorOpen} onClose={() => setIsCalculatorOpen(false)} />

            {!isCalculatorOpen && (
                <button
                    onClick={() => setIsCalculatorOpen(true)}
                    className="chat-calculator-button"
                    title="打开矩阵计算器"
                    aria-label="打开矩阵计算器"
                >
                    <Calculator size={21} />
                </button>
            )}
        </div>
    );
};

export default ChatPage;
