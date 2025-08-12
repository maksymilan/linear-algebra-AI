// src/pages/SubmitAssignmentPage.jsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import AiResponse from '../components/AiResponse';
import './FormPage.css'; // 复用通用表单样式
import { useAuth } from '../hooks/useAuth'; // 导入 useAuth 以获取 token

// --- 图标 ---
const BackArrowIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>;
const ChatIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>;


const SubmitAssignmentPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { token } = useAuth(); // 获取 token
    const [assignment, setAssignment] = useState(null);
    const [solutionText, setSolutionText] = useState('');
    const [submissionResult, setSubmissionResult] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchAssignment = async () => {
            setIsLoading(true);
            try {
                const response = await axios.get(`/api/assignments/${id}`);
                setAssignment(response.data);
            } catch (err) {
                setError('无法加载作业详情');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchAssignment();
    }, [id]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!solutionText.trim()) {
            setError('解答内容不能为空');
            return;
        }
        setIsSubmitting(true);
        setError('');
        try {
            const response = await axios.post('/api/assignments/submit', {
                assignmentId: parseInt(id),
                solutionText
            });
            setSubmissionResult(response.data);
        } catch (err) {
            setError(err.response?.data?.error || '提交失败，请稍后重试');
        } finally {
            setIsSubmitting(false);
        }
    };
    
    // --- 完整实现的 startFollowUpChat 函数 ---
    const startFollowUpChat = async () => {
        if (!submissionResult || !assignment) return;
        
        setIsSubmitting(true); // 复用提交按钮的loading状态
        setError('');

        try {
            const formData = new FormData();
            formData.append('problemText', assignment.problemText);
            formData.append('solutionText', submissionResult.solutionText);
            formData.append('correction', submissionResult.correction);
            
            const response = await axios.post('/api/grading/start_follow_up_chat', formData, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            const { chatSessionId } = response.data;
            if (chatSessionId) {
                // 跳转到新创建的、带有完整上下文的聊天会话
                navigate(`/chat/${chatSessionId}`);
            }
        } catch (err) {
            setError('开启答疑会话失败');
        } finally {
            setIsSubmitting(false);
        }
    };


    if (isLoading) return <div className="form-page-container"><p>加载作业中...</p></div>;
    if (error && !assignment) return <div className="form-page-container"><p className="error-message">{error}</p></div>;

    return (
        <div className="form-page-container">
            <button className="back-button" onClick={() => navigate('/assignments')}>
                <BackArrowIcon />
                <span>返回作业列表</span>
            </button>
            <div className="form-container">
                <h1>{assignment.title}</h1>
                <div className="problem-display">
                    <h2>题目要求</h2>
                    {/* 使用AiResponse组件来正确渲染Markdown格式的题目 */}
                    <AiResponse content={assignment.problemText} />
                </div>

                {!submissionResult ? (
                    <form onSubmit={handleSubmit}>
                        <div className="form-group">
                            <label htmlFor="solutionText">你的解答</label>
                            <textarea
                                id="solutionText"
                                value={solutionText}
                                onChange={(e) => setSolutionText(e.target.value)}
                                rows="15"
                                required
                                placeholder="请在此处输入你的解题过程..."
                            />
                        </div>
                        <button type="submit" disabled={isSubmitting} className="submit-button">
                            {isSubmitting ? 'AI批改中...' : '提交并获取AI反馈'}
                        </button>
                        {error && <p className="error-message">{error}</p>}
                    </form>
                ) : (
                    <div className="results-display">
                        <h2>AI 批改反馈</h2>
                        <AiResponse content={submissionResult.correction} />
                        <button onClick={startFollowUpChat} disabled={isSubmitting} className="discuss-button">
                            <ChatIcon />
                            <span>对反馈有疑问？与AI讨论</span>
                        </button>
                        {error && <p className="error-message">{error}</p>}
                    </div>
                )}
            </div>
        </div>
    );
};

export default SubmitAssignmentPage;