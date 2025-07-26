// src/routes/AppRoutes.jsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import HomePage from '../pages/HomePage';
import WorkspacePage from '../pages/WorkspacePage';
import ProtectedRoute from './ProtectedRoute';

export const AppRoutes = () => {
  return (
    <Routes>
      {/* 路径 "/" 是公开的主页 */}
      <Route path="/" element={<HomePage />} />
      
      {/* 路径 "/workspace" 是受保护的工作区 */}
      <Route 
        path="/workspace" 
        element={
          <ProtectedRoute>
            <WorkspacePage />
          </ProtectedRoute>
        } 
      />
      
      
      {/* 移除 /login 路由，并让所有未匹配的路径都重定向到主页 */}
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
};