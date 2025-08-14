import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import AiResponse from '../components/AiResponse';
import './CreateAssignmentPage.css'; // <-- 导入最终修正版的CSS

// --- 图标组件 ---
const ArrowLeftIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>;
const SendIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
const PaperclipIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>;
const CloseIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>;

const CreateAssignmentPage = () => {
    const [title, setTitle] = useState('');
    const [problemText, setProblemText] = useState('');
    const [problemFile, setProblemFile] = useState(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleFileChange = (e) => {
        setProblemFile(e.target.files[0] || null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');

        if (!title.trim()) {
            setError('请输入作业标题。');
            setIsLoading(false);
            return;
        }

        const formData = new FormData();
        formData.append('title', title);
        formData.append('problemText', problemText);
        if (problemFile) {
            formData.append('problemFile', problemFile);
        }

        try {
            await axios.post('/api/teacher/assignments', formData);
            alert('作业发布成功!');
            navigate('/workspace');
        } catch (err) {
            setError(err.response?.data?.error || '发布失败，请联系管理员');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        // 使用唯一的父类名来隔离样式
        <div className="page-assignment-creator">
            <div className="creator-card">
                <header className="creator-header">
                    <div className="creator-header-left">
                        {/* --- 恢复的返回按钮 --- */}
                        <button type="button" className="creator-btn btn-secondary" onClick={() => navigate('/workspace')}>
                            <ArrowLeftIcon />
                            <span>返回工作区</span>
                        </button>
                        <h1>发布新作业</h1>
                    </div>
                    <button onClick={handleSubmit} className="creator-btn btn-publish" disabled={isLoading}>
                        <SendIcon />
                        <span>{isLoading ? '发布中...' : '确认发布'}</span>
                    </button>
                </header>

                <div className="creator-grid">
                    {/* --- 左侧输入区 --- */}
                    <div className="input-panel">
                        <div className="form-group">
                            <label htmlFor="title">作业标题</label>
                            <input
                                id="title"
                                type="text"
                                className="form-input"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="例如：线性代数第一章练习"
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="problemText">题目详情 (支持 Markdown)</label>
                            <textarea
                                id="problemText"
                                className="form-textarea"
                                value={problemText}
                                onChange={(e) => setProblemText(e.target.value)}
                                placeholder="在这里输入题目、要求、提示等..."
                            />
                        </div>
                        <div className="form-group">
                            <label htmlFor="file-upload">附件 (可选)</label>
                            <input
                                type="file"
                                id="file-upload"
                                onChange={handleFileChange}
                                accept=".pdf,.png,.jpg,.jpeg"
                                style={{ display: 'none' }}
                            />
                            <button type="button" className="creator-btn file-upload-label" onClick={() => document.getElementById('file-upload').click()}>
                                <PaperclipIcon />
                                <span>{problemFile ? '更改文件' : '选择文件'}</span>
                            </button>
                            {problemFile && (
                                <div className="file-info">
                                    <span>{problemFile.name}</span>
                                    <button type="button" className="remove-file-button" onClick={() => setProblemFile(null)}>
                                        <CloseIcon />
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* --- 右侧预览区 --- */}
                    <div className="preview-panel">
                        <label>实时预览</label>
                        <div className="preview-box">
                            <AiResponse content={problemText || "*在此输入内容后可实时预览...*"} />
                        </div>
                    </div>
                </div>
                {error && (
                    <div style={{ padding: '0 2rem 2rem 2rem' }}>
                        <p className="creator-error">{error}</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CreateAssignmentPage;