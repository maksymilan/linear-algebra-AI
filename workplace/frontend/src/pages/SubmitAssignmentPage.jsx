// src/pages/SubmitAssignmentPage.jsx

import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import AiResponse from '../components/AiResponse';
import './SubmitAssignmentPage.css'; // 使用新的专用CSS文件

// --- 图标 ---
const UploadIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>;
const FileIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>;
const CheckCircleIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'green' }}><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>;

const SubmitAssignmentPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [assignment, setAssignment] = useState(null);
    const [selectedFile, setSelectedFile] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchAssignment = async () => {
            try {
                const response = await axios.get(`/api/student/assignments/${id}`);
                setAssignment(response.data);
            } catch (err) {
                setError('无法加载作业详情');
            }
        };
        fetchAssignment();
    }, [id]);

    const handleFileChange = (e) => {
        setError('');
        const file = e.target.files[0];
        if (file && file.type === "application/pdf") {
            setSelectedFile(file);
        } else {
            setError("请上传PDF格式的文件。");
            setSelectedFile(null);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!selectedFile) return;
        setIsSubmitting(true);
        setError('');
        
        const formData = new FormData();
        formData.append('assignmentId', id);
        formData.append('solutionFile', selectedFile);

        try {
            await axios.post('/api/student/assignments/submit', formData);
            setIsSubmitted(true);
        } catch (err) {
            setError(err.response?.data?.error || '提交失败，请稍后重试');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="submit-page-container">
            <div className="submit-page-card">
                <button className="back-button" onClick={() => navigate('/assignments')}>← 返回作业列表</button>
                <header className="submit-page-header">
                    <h1>{assignment?.title}</h1>
                    <div className="problem-panel">
                        <p><strong>题目要求:</strong></p>
                        <AiResponse content={assignment?.problemText || "加载中..."} />
                    </div>
                </header>

                <main className="submit-page-main">
                    {isSubmitted ? (
                        <div className="submission-success-view">
                            <CheckCircleIcon />
                            <h2>提交成功!</h2>
                            <p>你的作业 "{selectedFile.name}" 已成功提交，请等待教师批阅。</p>
                        </div>
                    ) : (
                        <form onSubmit={handleSubmit} className="upload-form">
                            <label htmlFor="file-upload" className="file-upload-area">
                                <div className="upload-icon-wrapper"><UploadIcon /></div>
                                {selectedFile ? (
                                    <>
                                        <p>已选择文件:</p>
                                        <div className="selected-file-info">
                                            <FileIcon />
                                            <span>{selectedFile.name}</span>
                                        </div>
                                    </>
                                ) : (
                                    <p>点击此处或拖拽文件到这里上传 (仅限PDF)</p>
                                )}
                            </label>
                            <input id="file-upload" type="file" onChange={handleFileChange} accept=".pdf" />
                            
                            {error && <p className="error-message">{error}</p>}
                            
                            <button type="submit" disabled={isSubmitting || !selectedFile} className="submit-button">
                                {isSubmitting ? '上传中...' : '确认提交作业'}
                            </button>
                        </form>
                    )}
                </main>
            </div>
        </div>
    );
};

export default SubmitAssignmentPage;