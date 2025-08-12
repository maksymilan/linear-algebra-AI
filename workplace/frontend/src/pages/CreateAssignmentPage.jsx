import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import './FormPage.css'; // 我们将为所有表单页创建一个通用样式

const CreateAssignmentPage = () => {
    const [title, setTitle] = useState('');
    const [problemText, setProblemText] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        try {
            await axios.post('/api/assignments', { title, problemText });
            alert('作业发布成功!');
            navigate('/workspace');
        } catch (err) {
            setError(err.response?.data?.error || '发布失败');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="form-page-container">
            <button className="back-button" onClick={() => navigate(-1)}>← 返回</button>
            <div className="form-container">
                <h1>发布新作业</h1>
                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label htmlFor="title">作业标题</label>
                        <input
                            id="title"
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            required
                        />
                    </div>
                    <div className="form-group">
                        <label htmlFor="problemText">题目内容 (支持Markdown)</label>
                        <textarea
                            id="problemText"
                            value={problemText}
                            onChange={(e) => setProblemText(e.target.value)}
                            rows="15"
                            required
                        />
                    </div>
                    <button type="submit" disabled={isLoading}>
                        {isLoading ? '发布中...' : '确认发布'}
                    </button>
                    {error && <p className="error-message">{error}</p>}
                </form>
            </div>
        </div>
    );
};

export default CreateAssignmentPage;