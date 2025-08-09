// src/routes/AppRoutes.jsx
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import HomePage from '../pages/HomePage';
import WorkspacePage from '../pages/WorkspacePage';
import GradingPage from '../pages/GradingPage'; // 1. 导入新页面
import ProtectedRoute from './ProtectedRoute';

export const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      
      <Route 
        path="/workspace" 
        element={
          <ProtectedRoute>
            <WorkspacePage />
          </ProtectedRoute>
        } 
      />

      {/* 2. 为作业批改页面添加新路由 */}
      <Route 
        path="/grading" 
        element={
          <ProtectedRoute>
            <GradingPage />
          </ProtectedRoute>
        } 
      />
      
      <Route path="*" element={<Navigate to="/" />} />
    </Routes>
  );
};