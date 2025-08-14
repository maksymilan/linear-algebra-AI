// src/pages/AssignmentListPage.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../hooks/useAuth';
import './ListPage.css';

const AssignmentListPage = () => {
    const [assignments, setAssignments] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const navigate = useNavigate();
    const { userRole } = useAuth();

    useEffect(() => {
        const fetchAssignments = async () => {
            if (!userRole) return; // 确保在userRole加载后再执行

            // **↓↓↓ 核心修改：根据角色确定API路径 ↓↓↓**
            const apiUrl = userRole === 'teacher' ? '/api/teacher/assignments' : '/api/student/assignments';

            setIsLoading(true);
            try {
                const response = await axios.get(apiUrl);
                setAssignments(Array.isArray(response.data) ? response.data : []);
            } catch (error) {
                console.error("Failed to fetch assignments:", error);
                setAssignments([]);
            } finally {
                setIsLoading(false);
            }
        };
        fetchAssignments();
    }, [userRole]); // **依赖于userRole**

    const handleCardClick = (id) => {
        // **↓↓↓ 核心修改：根据角色确定跳转路径 ↓↓↓**
        const detailPath = userRole === 'teacher' ? `/assignments/${id}/submissions` : `/assignments/${id}`;
        navigate(detailPath);
    };

    return (
        <div className="list-page-container">
            <button className="back-button" onClick={() => navigate('/workspace')}>← 返回工作区</button>
            <h1>{userRole === 'teacher' ? '作业管理 (点击查看提交)' : '课程作业'}</h1>
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