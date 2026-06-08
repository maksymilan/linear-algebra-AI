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
import VisualizerPage from '../pages/VisualizerPage';
import TextbookManagerPage from '../pages/TextbookManagerPage';
import QuestionBankPage from '../pages/QuestionBankPage';
import ClassManagementPage from '../pages/ClassManagementPage';
import StudentClassPage from '../pages/StudentClassPage';
import ForgotPasswordPage from '../pages/ForgotPasswordPage';
import AppShell from '../components/layout/AppShell';


export const AppRoutes = () => {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/" element={<HomePage />} />
      
      {/* 普通业务页面共用应用壳 */}
      <Route element={<ProtectedRoute><AppShell /></ProtectedRoute>}>
        <Route path="/workspace" element={<WorkspacePage />} />
        <Route path="/grading" element={<GradingPage />} />
        <Route path="/assignments" element={<AssignmentListPage />} />
        <Route path="/assignments/new" element={<CreateAssignmentPage />} />
        <Route path="/assignments/:id" element={<SubmitAssignmentPage />} />
        <Route path="/assignments/:id/submissions" element={<ViewSubmissionsPage />} />
        <Route path="/textbooks" element={<TextbookManagerPage />} />
        <Route path="/question-bank" element={<QuestionBankPage />} />
        <Route path="/teacher/classes" element={<ClassManagementPage />} />
        <Route path="/student/class" element={<StudentClassPage />} />
      </Route>

      {/* 聊天与可视化使用专用布局 */}
      <Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
      <Route path="/chat/:sessionId" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
      <Route path="/visualizer" element={<ProtectedRoute><VisualizerPage /></ProtectedRoute>} />

      <Route path="*" element={<Navigate to="/workspace" />} />
    </Routes>
  );
};
