// src/routes/ProtectedRoute.jsx

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth'; 

const ProtectedRoute = ({ children }) => {
  const { token, isAuthLoading } = useAuth(); // **↓↓↓ 获取加载状态 ↓↓↓**
  const location = useLocation();

  // **↓↓↓ 核心修改：在加载时显示提示，而不是直接渲染 ↓↓↓**
  if (isAuthLoading) {
    // 您可以在这里替换成一个更美观的加载动画组件
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <h2>正在加载用户信息...</h2>
      </div>
    );
  }

  // 加载完成后，再判断是否已登录
  if (!token) {
    // 如果未登录，重定向到登录页，并记录下用户原本想去的页面
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // 如果已登录，则渲染子组件 (如 WorkspacePage)
  return children;
};

export default ProtectedRoute;
