// src/pages/HomePage.jsx
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import Modal from '../components/Modal';
import LoginForm from '../components/LoginForm';
import RegisterForm from '../components/RegisterForm'; 

function HomePage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [view, setView] = useState('login'); 
  const navigate = useNavigate();
  const { token } = useAuth();

  useEffect(() => {
    if (token) {
      navigate('/workspace', { replace: true });
    }
  }, [token, navigate]);

  const handleLoginSuccess = () => {
    setIsModalOpen(false);
    navigate('/workspace', { replace: true });
  };
  
  const openModal = () => {
    setView('login'); // 每次打开模态框时，都默认显示登录视图
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
    <div>
      <nav style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', borderBottom: '1px solid #eee' }}>
        <h3>AI 助教平台</h3>
        <button onClick={openModal}>登录/注册</button>
      </nav>
      
      <main style={{ padding: '2rem' }}>
        <h1>Think bigger. Build faster.</h1>
        <p>这是您的公开主页。</p>
      </main>

      <Modal isOpen={isModalOpen} onClose={closeModal}>
        {/* --- 关键部分：根据 view 状态条件性渲染组件 --- */}
        {view === 'login' ? (
          <LoginForm 
            onLoginSuccess={handleLoginSuccess}
            onSwitchToRegister={() => setView('register')} 
          />
        ) : (
          <RegisterForm
            onRegisterSuccess={() => {
              alert('注册成功，请登录！');
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