// src/routes/AppRoutes.jsx

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import HomePage from '../pages/HomePage';
import WorkspacePage from '../pages/WorkspacePage';
import GradingPage from '../pages/GradingPage';
import ChatPage from '../pages/ChatPage';
import ProtectedRoute from './ProtectedRoute';
import LoginPage from '../pages/LoginPage';

// --- 新增页面 ---
import AssignmentListPage from '../pages/AssignmentListPage';
import SubmitAssignmentPage from '../pages/SubmitAssignmentPage';
import CreateAssignmentPage from '../pages/CreateAssignmentPage';
import ViewSubmissionsPage from '../pages/ViewSubmissionsPage';


export const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<HomePage />} />
      
      {/* 核心页面 */}
      <Route path="/workspace" element={<ProtectedRoute><WorkspacePage /></ProtectedRoute>} />
      <Route path="/chat/:sessionId" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
      <Route path="/grading" element={<ProtectedRoute><GradingPage /></ProtectedRoute>} />

      {/* 新增的作业系统页面 */}
      <Route path="/assignments" element={<ProtectedRoute><AssignmentListPage /></ProtectedRoute>} />
      <Route path="/assignments/new" element={<ProtectedRoute><CreateAssignmentPage /></ProtectedRoute>} />
      <Route path="/assignments/:id" element={<ProtectedRoute><SubmitAssignmentPage /></ProtectedRoute>} />
      <Route path="/assignments/:id/submissions" element={<ProtectedRoute><ViewSubmissionsPage /></ProtectedRoute>} />
      
      <Route path="*" element={<Navigate to="/workspace" />} />
    </Routes>
  );
};