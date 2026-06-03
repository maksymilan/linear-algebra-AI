// src/pages/HomePage.jsx

import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Modal from '../components/Modal';
import LoginForm from '../components/LoginForm';
import RegisterForm from '../components/RegisterForm'; 
import ResetPasswordForm from '../components/ResetPasswordForm';
import './HomePage.css';

function HomePage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [view, setView] = useState('login'); 
  const navigate = useNavigate();
  const { token } = useAuth();

  // 核心修改：如果已登录，重定向到 /workspace
  useEffect(() => {
    if (token) {
      navigate('/workspace', { replace: true });
    }
  }, [token, navigate]);

  const handleLoginSuccess = () => {
    setIsModalOpen(false);
    navigate('/workspace', { replace: true }); // 登录成功后也重定向到 /workspace
  };
  
  const openModal = () => {
    setView('login');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
  };
  
  // 如果已登录，不渲染任何东西，等待useEffect重定向
  if (token) {
    return null; 
  }

  return (
    <div className="home-page">
      <nav className="home-nav" aria-label="主导航">
        <div className="home-brand">
          <img src="/logo.svg" alt="" className="home-logo" />
          <span>智能助教平台</span>
        </div>
        <button className="home-nav-button" onClick={openModal}>登录/注册</button>
      </nav>
      
      <main className="home-main">
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-hero-copy">
            <p className="home-kicker">线性代数 AI 助教</p>
            <h1 id="home-title">智能助教平台</h1>
            <p className="home-lead">
              面向课堂和自学的学习工作台，集成 AI 问答、可视化教学、作业提交与智能批改。
            </p>
            <div className="home-actions">
              <button className="home-primary-button" onClick={openModal}>开始使用</button>
              <a className="home-secondary-link" href="#home-capabilities">查看能力</a>
            </div>
          </div>

          <div className="home-preview" aria-label="平台能力预览">
            <div className="home-preview-header">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <div className="home-preview-body">
              <div className="home-preview-row">
                <strong>AI 问答</strong>
                <p>围绕概念、证明和解题步骤给出针对性引导。</p>
              </div>
              <div className="home-preview-row is-accent">
                <strong>可视化教学</strong>
                <p>用图形和交互帮助理解矩阵、向量空间与线性变换。</p>
              </div>
              <div className="home-preview-row">
                <strong>智能批改</strong>
                <p>上传作业后获得结构化反馈，教师可继续追踪提交情况。</p>
              </div>
            </div>
          </div>
        </section>

        <section id="home-capabilities" className="home-capabilities" aria-label="核心能力">
          <article>
            <span>01</span>
            <h2>学生学习</h2>
            <p>快速进入聊天、作业和班级页面，把问题、材料和反馈放在同一条学习路径里。</p>
          </article>
          <article>
            <span>02</span>
            <h2>教师管理</h2>
            <p>管理班级、教材和作业，减少重复性批阅，把时间留给更有价值的讲解。</p>
          </article>
          <article>
            <span>03</span>
            <h2>数学可视化</h2>
            <p>用可交互画布辅助抽象概念讲解，降低线性代数入门阶段的理解成本。</p>
          </article>
        </section>
      </main>

      <Modal isOpen={isModalOpen} onClose={closeModal}>
        {view === 'login' ? (
          <LoginForm 
            onLoginSuccess={handleLoginSuccess}
            onSwitchToRegister={(mode) => setView(mode === 'reset' ? 'reset' : 'register')} 
          />
        ) : view === 'register' ? (
          <RegisterForm
            onRegisterSuccess={() => {
              alert('注册成功，请登录！');
              setView('login'); 
            }}
            onSwitchToLogin={() => setView('login')} 
          />
        ) : (
          <ResetPasswordForm
            onResetSuccess={() => {
              setView('login');
            }}
            onSwitchToLogin={() => setView('login')}
          />
        )}
      </Modal>
    </div>
  );
}

export default HomePage;
