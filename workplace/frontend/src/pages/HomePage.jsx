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
    <div>
      <nav style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', borderBottom: '1px solid #eee' }}>
        <h3>智能助教平台</h3>
        <button onClick={openModal}>登录/注册</button>
      </nav>
      
      <main style={{ padding: '2rem', textAlign: 'center' }}>
        <h1>欢迎使用智能助教平台</h1>
        <p>一个集成了AI问答、可视化教学和智能批改的学习伙伴。</p>
      </main>

      <Modal isOpen={isModalOpen} onClose={closeModal}>
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