// src/pages/HomePage.jsx
import React, { useState, useEffect } from 'react'; // 引入 useEffect
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth'; // 引入 useAuth
import Modal from '../components/Modal';
import LoginForm from '../components/LoginForm';

function HomePage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
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

  if (token) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <nav style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem', borderBottom: '1px solid #eee' }}>
        <h3>AI 助教平台</h3>
        <button onClick={() => setIsModalOpen(true)}>登录</button>
      </nav>
      
      <main style={{ padding: '2rem' }}>
        <h1>Think bigger. Build faster.</h1>
        <p>这是您的公开主页，灵感来自您提供的 Figma 截图。</p>
      </main>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <LoginForm 
          onLoginSuccess={handleLoginSuccess}
        />
      </Modal>
    </div>
  );
}

export default HomePage;