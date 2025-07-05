// src/pages/WorkspacePage.jsx
import React from 'react';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';

function WorkspacePage() {
  const { logoutAction } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logoutAction();
    navigate("/"); // 退出后回到公开主页
  };

  return (
    <div>
      <h1>我的工作台</h1>
      <p>在这里进行智能问答、作业管理等操作。</p>
      <button onClick={handleLogout}>退出登录</button>
    </div>
  );
}

export default WorkspacePage;