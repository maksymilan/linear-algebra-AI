// src/pages/AssignmentListPage.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../hooks/useAuth';
import './ListPage.css'; // 复用通用列表页样式

const AssignmentListPage = () => {
    // 关键修复：将初始状态从 null 或 undefined 改为 []
    const [assignments, setAssignments] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const navigate = useNavigate();
    const { userRole } = useAuth();

    useEffect(() => {
        const fetchAssignments = async () => {
            setIsLoading(true);
            try {
                const response = await axios.get('/api/assignments');
                // 确保即使API返回null或非数组，也不会导致崩溃
                setAssignments(Array.isArray(response.data) ? response.data : []);
            } catch (error) {
                console.error("Failed to fetch assignments:", error);
                setAssignments([]); // 出错时也设置为空数组
            } finally {
                setIsLoading(false);
            }
        };
        fetchAssignments();
    }, []);

    const handleCardClick = (id) => {
        if (userRole === 'teacher') {
            navigate(`/assignments/${id}/submissions`);
        } else {
            navigate(`/assignments/${id}`);
        }
    };

    return (
        <div className="list-page-container">
            <button className="back-button" onClick={() => navigate('/workspace')}>← 返回工作区</button>
            <h1>{userRole === 'teacher' ? '作业列表 (点击查看提交)' : '课程作业'}</h1>
            {isLoading ? <p>加载中...</p> : (
                <div className="list-grid">
                    {assignments.length > 0 ? (
                        assignments.map(assignment => (
                            <div key={assignment.id} className="list-card" onClick={() => handleCardClick(assignment.id)}>
                                <h3>{assignment.title}</h3>
                                <p>发布于: {new Date(assignment.createdAt).toLocaleDateString()}</p>
                            </div>
                        ))
                    ) : (
                        <p>当前没有已发布的作业。</p>
                    )}
                </div>
            )}
        </div>
    );
};

export default AssignmentListPage;