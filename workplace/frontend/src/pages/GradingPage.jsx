// src/pages/GradingPage.jsx

import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import AiResponse from '../components/AiResponse';
import GradingWorkflow from '../components/GradingWorkflow';
import './GradingPage.css';

// 定义后端的基地址
const API_BASE_URL = 'http://localhost:8080';

// 图标组件
const BackArrowIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>;
const ChatIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>;

const GradingPage = () => {
    // 状态管理
    const [problemText, setProblemText] = useState('');
    const [solutionText, setSolutionText] = useState('');
    const [problemFiles, setProblemFiles] = useState([]);
    const [solutionFiles, setSolutionFiles] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [ocrLoading, setOcrLoading] = useState({ problem: null, solution: null });
    const [error, setError] = useState('');
    const [gradeResult, setGradeResult] = useState(null);
    
    // 新增状态，用于后续提问
    const [followUpQuestion, setFollowUpQuestion] = useState('');

    const { token } = useAuth();
    const navigate = useNavigate();

    // 处理文件OCR识别
    const handleFileOcr = async (file, type) => {
        if (!file) return;
        const fileId = `${type}-${file.name}-${Date.now()}`;
        const newFile = { id: fileId, name: file.name, isLoading: true };

        const setFiles = type === 'problem' ? setProblemFiles : setSolutionFiles;
        const setLoading = (loading) => setOcrLoading(prev => ({ ...prev, [type]: loading }));
        const setText = type === 'problem' ? setProblemText : setSolutionText;

        setFiles(prev => [...prev, newFile]);
        setLoading(fileId);
        setError('');
        
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await axios.post(`${API_BASE_URL}/api/grading/ocr`, formData, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const newText = response.data.text || '';
            setText(prev => prev ? `${prev}\n\n--- ${file.name} ---\n${newText}` : newText);
            setFiles(prev => prev.map(f => f.id === fileId ? { ...f, isLoading: false } : f));
        } catch (err) {
            setError(err.response?.data?.error || `${type === 'problem' ? '题目' : '解答'}文件识别失败`);
            setFiles(prev => prev.map(f => f.id === fileId ? { ...f, isLoading: false, error: true } : f));
        } finally {
            setLoading(null);
        }
    };
    
    // 处理提交批改
    const handleGrade = async () => {
        if (!problemText.trim() || !solutionText.trim()) {
            setError('请提供题目和解答内容');
            return;
        }
        setIsLoading(true);
        setError('');
        setGradeResult(null);
        const formData = new FormData();
        formData.append('problemText', problemText);
        formData.append('solutionText', solutionText);

        try {
            const response = await axios.post(`${API_BASE_URL}/api/grading/upload`, formData, { headers: { 'Authorization': `Bearer ${token}` } });
            setGradeResult(response.data);
        } catch (err) {
            setError(err.response?.data?.error || '批改失败');
        } finally {
            setIsLoading(false);
        }
    };
    
    // 处理开始答疑对话
    const startFollowUpChat = async (e) => {
        e.preventDefault(); // 阻止表单默认提交行为
        if (!gradeResult || !followUpQuestion.trim()) {
            setError('请输入您的问题后再开始对话。');
            return;
        }
        setIsLoading(true);
        setError('');
        try {
            // 第1步：创建带有上下文的会话
            const contextFormData = new FormData();
            contextFormData.append('problemText', gradeResult.problemText);
            contextFormData.append('solutionText', gradeResult.solutionText);
            contextFormData.append('correction', gradeResult.correction);
            
            const contextResponse = await axios.post(`${API_BASE_URL}/api/grading/start_follow_up_chat`, contextFormData, { headers: { 'Authorization': `Bearer ${token}` } });
            const { chatSessionId } = contextResponse.data;

            if (chatSessionId) {
                // 第2步：在新会话中发送用户的第一个问题
                const messageFormData = new FormData();
                messageFormData.append('prompt', followUpQuestion);
                messageFormData.append('chat_session_id', String(chatSessionId));
                messageFormData.append('is_first_message', 'false'); // 因为系统消息是第一条

                await axios.post(`${API_BASE_URL}/api/chat/send`, messageFormData, { headers: { 'Authorization': `Bearer ${token}` } });

                // 第3步：跳转到新的聊天页面
                navigate(`/chat/${chatSessionId}`);
            } else {
                throw new Error("未能从后端获取 chatSessionId");
            }
        } catch (err) {
            setError('开启答疑会话失败，请稍后重试。');
            console.error("开启答疑会话失败:", err);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="grading-container">
             <div className="grading-content-wrapper">
                <div className="grading-header">
                    <button className="back-button" onClick={() => navigate('/workspace')}>
                        <BackArrowIcon />
                        <span>返回工作区</span>
                    </button>
                    <h1>自主批改练习</h1>
                    <p>上传您的题目和解答，AI助教将为您提供详细的批改意见。</p>
                </div>
                <main className="grading-main">
                    <GradingWorkflow
                        problemText={problemText}
                        setProblemText={setProblemText}
                        solutionText={solutionText}
                        setSolutionText={setSolutionText}
                        handleFileOcr={handleFileOcr}
                        problemFiles={problemFiles}
                        solutionFiles={solutionFiles}
                        ocrLoading={ocrLoading}
                        removeFile={(id, type) => type === 'problem' ? setProblemFiles(p => p.filter(f => f.id !== id)) : setSolutionFiles(s => s.filter(f => f.id !== id))}
                    />
                    <AnimatePresence>
                        {!gradeResult && (
                             <motion.div className="submit-section" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
                                <button onClick={handleGrade} disabled={isLoading || ocrLoading.problem || ocrLoading.solution}>
                                    {isLoading ? 'AI批改中...' : '提交批改'}
                                </button>
                                {error && <p className="error-message">{error}</p>}
                            </motion.div>
                        )}
                    </AnimatePresence>
                    
                    <AnimatePresence>
                        {gradeResult && (
                            <motion.div className="results-section" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                                <h3>批改结果</h3>
                                <div className="correction-content">
                                    <AiResponse content={gradeResult.correction} />
                                </div>
                                
                                {/* 将按钮替换为提问表单 */}
                                <div className="follow-up-chat-container">
                                    <p>对批改结果有疑问？在这里提出你的问题：</p>
                                    <form onSubmit={startFollowUpChat} className="follow-up-form">
                                        <textarea
                                            value={followUpQuestion}
                                            onChange={(e) => setFollowUpQuestion(e.target.value)}
                                            placeholder="例如：为什么第二题的这个步骤是错的？"
                                            rows="3"
                                            disabled={isLoading}
                                        />
                                        <button type="submit" disabled={isLoading || !followUpQuestion.trim()}>
                                            <ChatIcon />
                                            <span>{isLoading ? '正在开启...' : '开始答疑对话'}</span>
                                        </button>
                                    </form>
                                </div>
                                {error && <p className="error-message" style={{textAlign: 'center', marginTop: '1rem'}}>{error}</p>}
                            </motion.div>
                        )}
                    </AnimatePresence>
                </main>
            </div>
        </div>
    );
};

export default GradingPage;
