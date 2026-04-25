// src/pages/GradingPage.jsx

import React, { useState } from 'react';
import axios from 'axios';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import AiResponse from '../components/AiResponse';
import GradingWorkflow from '../components/GradingWorkflow';
import './GradingPage.css';

const API_BASE_URL = 'http://localhost:8080';

const BackArrowIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>;
const ChatIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>;

const GradingPage = () => {
    const [problemText, setProblemText] = useState('');
    const [solutionText, setSolutionText] = useState('');
    const [problemFiles, setProblemFiles] = useState([]);
    const [solutionFiles, setSolutionFiles] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [ocrLoading, setOcrLoading] = useState({ problem: null, solution: null });
    const [error, setError] = useState('');
    const [gradeResult, setGradeResult] = useState(null);
    const [followUpQuestion, setFollowUpQuestion] = useState('');

    const { token } = useAuth();
    const navigate = useNavigate();

    // handleFileOcr 和 handleGrade 函数保持不变
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
            const response = await axios.post(`/api/grading/ocr`, formData, {
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
            const response = await axios.post(`/api/grading/upload`, formData, { headers: { 'Authorization': `Bearer ${token}` } });
            setGradeResult(response.data);
        } catch (err) {
            setError(err.response?.data?.error || '批改失败');
        } finally {
            setIsLoading(false);
        }
    };
    
    // **↓↓↓ 修复后的答疑流程 ↓↓↓**
    const startFollowUpChat = async (e) => {
        e.preventDefault();
        if (!gradeResult || !followUpQuestion.trim()) {
            setError('请输入您的问题后再开始对话。');
            return;
        }
        setIsLoading(true);
        setError('');
        try {
            const formData = new FormData();
            formData.append('problemText', gradeResult.problemText);
            formData.append('solutionText', gradeResult.solutionText);
            formData.append('correctionText', gradeResult.correction);
            formData.append('newQuestion', followUpQuestion);

            // 只调用一个API，后端会处理所有逻辑
            const response = await axios.post(`/api/grading/followup`, formData, {
                 headers: { 'Authorization': `Bearer ${token}` }
            });

            const { chatSessionId } = response.data;
            if (chatSessionId) {
                // 拿到会话ID后直接跳转
                navigate(`/chat/${chatSessionId}`);
            } else {
                throw new Error("未能从后端获取有效的chatSessionId");
            }
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.error ||'开启答疑会话失败，请稍后重试。');
        } finally {
            setIsLoading(false);
        }
    };

    const removeFile = (id, type) => {
        const setFiles = type === 'problem' ? setProblemFiles : setSolutionFiles;
        setFiles(prev => prev.filter(f => f.id !== id));
    };


    return (
        <div className="grading-container">
            <div className="grading-content-wrapper">
                <div className="grading-header">
                    <button className="back-button" onClick={() => navigate('/workspace')}>
                        <BackArrowIcon /><span>返回工作区</span>
                    </button>
                    <h1>自主批改练习</h1>
                    <p>上传您的题目和解答，AI助教将为您提供详细的批改意见。</p>
                </div>
                <main className="grading-main">
                    <GradingWorkflow {...{ problemText, setProblemText, solutionText, setSolutionText, handleFileOcr, problemFiles, solutionFiles, ocrLoading, removeFile }} />
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
                                <div className="correction-content"><AiResponse content={gradeResult.correction} /></div>
                                <div className="follow-up-chat-container">
                                    <p>对批改结果有疑问？在这里提出你的问题：</p>
                                    <form onSubmit={startFollowUpChat} className="follow-up-form">
                                        <textarea value={followUpQuestion} onChange={(e) => setFollowUpQuestion(e.target.value)} placeholder="例如：为什么第二题的这个步骤是错的？" rows="3" disabled={isLoading} />
                                        <button type="submit" disabled={isLoading || !followUpQuestion.trim()}>
                                            <ChatIcon /><span>{isLoading ? '正在开启...' : '开始答疑对话'}</span>
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