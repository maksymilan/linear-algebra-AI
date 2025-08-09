import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import GradingWorkflow from '../components/GradingWorkflow';
import GradingResults from '../components/GradingResults';
import './GradingPage.css';

const GradingPage = () => {
    const [problemText, setProblemText] = useState('');
    const [solutionText, setSolutionText] = useState('');
    const [problemFiles, setProblemFiles] = useState([]);
    const [solutionFiles, setSolutionFiles] = useState([]);
    const [history, setHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [ocrLoading, setOcrLoading] = useState({ problem: null, solution: null });
    const [error, setError] = useState('');
    const [selectedResult, setSelectedResult] = useState(null);
    const { token } = useAuth();
    const navigate = useNavigate();

    const fetchHistory = useCallback(async () => {
        try {
            const response = await axios.get('http://localhost:8080/api/grading/history', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const data = response.data || [];
            setHistory(data);
            if (data.length > 0 && !selectedResult) {
                setSelectedResult(data.slice(-1)[0]);
            }
        } catch (err) {
            setError('无法加载批改历史');
        }
    }, [token, selectedResult]);

    useEffect(() => {
        fetchHistory();
    }, [fetchHistory]);

    const handleFileOcr = async (file, type) => {
        if (!file) return;

        const fileId = `${type}-${file.name}-${Date.now()}`;
        const newFile = { id: fileId, name: file.name, isLoading: true };

        if (type === 'problem') {
            setProblemFiles(prev => [...prev, newFile]);
            setOcrLoading(prev => ({ ...prev, problem: fileId }));
        } else {
            setSolutionFiles(prev => [...prev, newFile]);
            setOcrLoading(prev => ({ ...prev, solution: fileId }));
        }

        setError('');
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await axios.post('http://localhost:8080/api/grading/ocr', formData, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            const newText = response.data.text || '';

            if (type === 'problem') {
                setProblemText(prev => prev ? `${prev}\n\n--- ${file.name} ---\n${newText}` : newText);
                setProblemFiles(prev => prev.map(f => f.id === fileId ? { ...f, isLoading: false } : f));
                setOcrLoading(prev => ({ ...prev, problem: null }));
            } else {
                setSolutionText(prev => prev ? `${prev}\n\n--- ${file.name} ---\n${newText}` : newText);
                setSolutionFiles(prev => prev.map(f => f.id === fileId ? { ...f, isLoading: false } : f));
                setOcrLoading(prev => ({ ...prev, solution: null }));
            }
        } catch (err) {
            setError(err.response?.data?.error || `${type === 'problem' ? '题目' : '解答'}识别失败`);
            if (type === 'problem') {
                setProblemFiles(prev => prev.map(f => f.id === fileId ? { ...f, isLoading: false, error: true } : f));
                setOcrLoading(prev => ({ ...prev, problem: null }));
            } else {
                setSolutionFiles(prev => prev.map(f => f.id === fileId ? { ...f, isLoading: false, error: true } : f));
                setOcrLoading(prev => ({ ...prev, solution: null }));
            }
        }
    };

    const handleGrade = async () => {
        if (!problemText.trim()) { setError('请先提供题目内容'); return; }
        if (!solutionText.trim()) { setError('请提供并确认解答内容'); return; }

        setIsLoading(true);
        setError('');
        const formData = new FormData();
        formData.append('problemText', problemText);
        formData.append('solutionText', solutionText);
        const solutionFilename = solutionFiles.length > 0 ? solutionFiles.map(f => f.name).join(', ') : 'Typed Solution';
        formData.append('solutionFilename', solutionFilename);

        try {
            const response = await axios.post('http://localhost:8080/api/grading/upload', formData, {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            setProblemText('');
            setSolutionText('');
            setProblemFiles([]);
            setSolutionFiles([]);
            document.getElementById('problem-file-input').value = null;
            document.getElementById('solution-file-input').value = null;
            await fetchHistory();
            setSelectedResult(response.data);
        } catch (err) {
            setError(err.response?.data?.error || '批改失败，请稍后再试');
        } finally {
            setIsLoading(false);
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm('您确定要删除这条批改记录吗？')) {
            try {
                await axios.delete(`http://localhost:8080/api/grading/${id}`, {
                    headers: { 'Authorization': `Bearer ${token}` }
                });
                const newHistory = history.filter(h => h.id !== id);
                setHistory(newHistory);
                if (selectedResult && selectedResult.id === id) {
                    setSelectedResult(newHistory.length > 0 ? newHistory.slice(-1)[0] : null);
                }
            } catch (err) {
                setError('删除失败');
            }
        }
    };
    
    const removeFile = (id, type) => {
        if (type === 'problem') {
            setProblemFiles(prev => prev.filter(file => file.id !== id));
        } else if (type === 'solution') {
            setSolutionFiles(prev => prev.filter(file => file.id !== id));
        }
    };

    const isAnyOcrLoading = ocrLoading.problem !== null || ocrLoading.solution !== null;

    return (
        <div className="grading-container">
            <div className="grading-sidebar">
                <div className="sidebar-header">
                    <button className="back-button" onClick={() => navigate('/workspace')}>← 返回工作区</button>
                    <h3>批改历史</h3>
                </div>
                <div className="history-list">
                    {history.map(item => (
                        <div
                            key={item.id}
                            className={`history-item ${selectedResult?.id === item.id ? 'active' : ''}`}
                            onClick={() => setSelectedResult(item)}
                        >
                            <span className="filename">{item.filename}</span>
                            <span className="timestamp">{new Date(item.createdAt).toLocaleString()}</span>
                            <button className="delete-btn" onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}>×</button>
                        </div>
                    ))}
                </div>
            </div>

            <div className="grading-main">
                <GradingWorkflow
                    problemText={problemText}
                    setProblemText={setProblemText}
                    solutionText={solutionText}
                    setSolutionText={setSolutionText}
                    handleFileOcr={handleFileOcr}
                    problemFiles={problemFiles}
                    solutionFiles={solutionFiles}
                    ocrLoading={ocrLoading}
                    removeFile={removeFile}
                />
                <div className="submit-section">
                    <motion.button
                        onClick={handleGrade}
                        disabled={isLoading || isAnyOcrLoading}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                    >
                        {isLoading ? '批改中...' : '提交批改'}
                    </motion.button>
                    {error && <p className="error-message">{error}</p>}
                </div>
                <GradingResults selectedResult={selectedResult} />
            </div>
        </div>
    );
};

export default GradingPage;