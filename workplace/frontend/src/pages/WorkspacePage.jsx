// src/pages/WorkspacePage.jsx

import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './WorkspacePage.css';

// ... (图标组件保持不变)
const ChatIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>;
const GradeIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 11 12 14 22 4"></polyline><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"></path></svg>;
const AssignmentIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>;
const CreateAssignmentIcon = () => <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>;


const WorkspacePage = () => {
    const navigate = useNavigate();
    const { user, userRole, logoutAction, isAuthLoading } = useAuth(); // <-- **获取 isAuthLoading 状态**

    // 学生的功能模块
    const studentModules = [
        { title: 'AI 助教', icon: <ChatIcon />, path: '/chat/new', description: '随时提问，获取即时帮助，支持公式和矩阵可视化。' },
        { title: '课程作业', icon: <AssignmentIcon />, path: '/assignments', description: '查看和提交老师发布的作业，并获得AI的即时批改。' },
        { title: '自主批改', icon: <GradeIcon />, path: '/grading', description: '上传题目和你的解答，检验自己的学习效果。' }
    ];

    // 老师的功能模块
    const teacherModules = [
        { title: '发布作业', icon: <CreateAssignmentIcon />, path: '/assignments/new', description: '为您的班级创建和发布新作业。' },
        { title: '查看提交', icon: <GradeIcon />, path: '/assignments', description: '跟踪学生的作业提交情况，查看AI的自动批改结果。' },
		{ title: 'AI 助教', icon: <ChatIcon />, path: '/chat/new', description: '随时提问，获取即时帮助，支持公式和矩阵可视化。' },
    ];

    const modules = userRole === 'teacher' ? teacherModules : studentModules;

    const UserDisplay = () => (
        <div className="user-display">
             <span>你好, {user?.displayName || user?.name}</span>
             {userRole === 'teacher' && <span className="user-role-tag">老师</span>}
        </div>
    );
    
    // **↓↓↓ 关键改动：在加载时或角色未普及时显示加载状态 ↓↓↓**
    if (isAuthLoading || !userRole) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: '1.5rem' }}>
                正在加载工作区...
            </div>
        );
    }

    return (
        <div className="workspace-container">
            <header className="workspace-header">
                <h1>智能助教工作台</h1>
                <div className="user-info">
                    <UserDisplay />
                    <button onClick={logoutAction}>退出登录</button>
                </div>
            </header>
            <main className="workspace-main">
                {modules.map(module => (
                    <section key={module.title} className="workspace-card" onClick={() => navigate(module.path)}>
                        <div className="card-header">
                            <div className="card-icon">{module.icon}</div>
                            <h2>{module.title}</h2>
                        </div>
                        <div className="card-content">
                            <p>{module.description}</p>
                        </div>
                        <div className="card-footer">
                            <span>进入 →</span>
                        </div>
                    </section>
                ))}
            </main>
        </div>
    );
};

export default WorkspacePage;