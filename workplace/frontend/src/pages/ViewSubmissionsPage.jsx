import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import AiResponse from '../components/AiResponse';
import './ViewSubmissionsPage.css'; // 引入新的专用CSS文件

/**
 * 单个学生提交卡片组件
 */
const SubmissionCard = ({ sub, onSaveComment }) => {
    // 使用 sub.comment 初始化评语，处理 null 或 undefined 的情况
    const [comment, setComment] = useState(sub.comment || '');
    const [isSaving, setIsSaving] = useState(false);
    const [fileLoading, setFileLoading] = useState(false);

    // 查看文件的逻辑
    const viewFile = async () => {
        setFileLoading(true);
        try {
            const response = await axios.get(
                `/api/teacher/submission/file/${sub.id}`,
                { responseType: 'blob' } // 接收二进制数据
            );
            const fileBlob = new Blob([response.data], { type: 'application/pdf' });
            const fileUrl = URL.createObjectURL(fileBlob);
            window.open(fileUrl, '_blank');
            URL.revokeObjectURL(fileUrl); // 在新标签页打开后可以立即释放
        } catch (error) {
            console.error("Error fetching file:", error);
            alert("无法查看文件，请稍后重试。");
        } finally {
            setFileLoading(false);
        }
    };

    // 保存评语的逻辑
    const handleSave = async () => {
        setIsSaving(true);
        try {
            await onSaveComment(sub.id, comment);
            // 成功后由父组件刷新数据，这里可以给个提示
            alert(`对 ${sub.studentName} 的评语已保存！`);
        } catch (error) {
           // 错误在父组件处理
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="submission-card-item">
            <div className="submission-info">
                <h4>{sub.studentName}</h4>
                <span>提交于 {new Date(sub.createdAt).toLocaleDateString()}</span>
                <span className={`status-tag ${sub.status}`}>
                    {sub.status === 'graded' ? '已批改' : '待批改'}
                </span>
            </div>
            <div className="submission-actions">
                <button onClick={viewFile} disabled={fileLoading} className="view-file-btn">
                    {fileLoading ? '加载中...' : `查看 "${sub.solutionFileName}"`}
                </button>
            </div>
            <div className="submission-comment-area">
                <textarea
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder="在此处输入对该作业的评语..."
                    rows="4"
                />
                <button
                    onClick={handleSave}
                    disabled={isSaving || comment === (sub.comment || '')} // 如果评语未修改，则禁用按钮
                    className="save-comment-btn"
                >
                    {isSaving ? '保存中...' : '保存评语'}
                </button>
            </div>
        </div>
    );
};


/**
 * 教师查看所有提交的主页面组件
 */
const ViewSubmissionsPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [assignment, setAssignment] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    // 使用 useCallback 包装获取数据的函数，避免不必要的重渲染
    const fetchSubmissions = useCallback(async () => {
        setIsLoading(true);
        try {
            const response = await axios.get(`/api/teacher/assignments/${id}`);
            // 对提交按时间倒序排序
            if (response.data && response.data.submissions) {
                response.data.submissions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            }
            setAssignment(response.data);
        } catch (error) {
            console.error("Failed to fetch submissions:", error);
            alert("加载提交列表失败！");
        } finally {
            setIsLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchSubmissions();
    }, [fetchSubmissions]);

    // 处理保存评语的回调函数
    const handleSaveComment = async (submissionId, comment) => {
        try {
            await axios.post(`/api/teacher/submission/${submissionId}/comment`, { comment });
            // 评语保存成功后，重新获取整个列表以更新状态
            await fetchSubmissions();
        } catch (error) {
            console.error("Failed to save comment:", error);
            alert("保存评语失败！");
            // 抛出错误以便子组件可以捕获
            throw error;
        }
    };

    return (
        <div className="view-submissions-container">
            <button className="back-button" onClick={() => navigate('/assignments')}>← 返回作业列表</button>
            
            <header className="view-submissions-header">
                <h1>{assignment?.title || '加载中...'} - 学生提交情况</h1>
                <div className="problem-display-teacher">
                    <strong>原题要求:</strong>
                    <AiResponse content={assignment?.problemText || "正在加载题目内容..."} />
                </div>
            </header>

            {isLoading ? <p>正在加载学生提交列表...</p> : (
                <div className="submissions-grid">
                    {assignment?.submissions?.length > 0 ? (
                        assignment.submissions.map(sub => (
                            <SubmissionCard key={sub.id} sub={sub} onSaveComment={handleSaveComment} />
                        ))
                    ) : <p className="no-submissions-text">暂无学生提交此项作业。</p>}
                </div>
            )}
        </div>
    );
};

export default ViewSubmissionsPage;