import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import FormInput from './FormInput';
import PasswordInput from './PasswordInput';

// 接收两个回调函数：注册成功后做什么，切换回登录时做什么
const RegisterForm = ({ onRegisterSuccess, onSwitchToLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [userIdNo, setUserIdNo] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { registerAction } = useAuth();

  const handleRegister = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    const result = await registerAction({
      username,
      email,
      password,
      user_id_no: userIdNo
    });

    if (result.success) {
      onRegisterSuccess(); 
    } else {
      setError(result.error);
    }
    setLoading(false);
  };

  return (
    <div style={{ textAlign: 'center' }}>
      <h2>注册新账户</h2>
      <p>欢迎加入！</p>
      <form onSubmit={handleRegister} style={{ marginTop: '2rem' }}>
        <FormInput 
          label="用户名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <FormInput 
          label="学工号"
          value={userIdNo}
          onChange={(e) => setUserIdNo(e.target.value)}
          required
        />
        <FormInput 
          label="邮箱"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <PasswordInput
          label="密码 (最少6位)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" disabled={loading} style={{ padding: '0.8rem 1.5rem', width: '100%', cursor: 'pointer', marginTop: '1rem' }}>
          {loading ? '注册中...' : '创建账户'}
        </button>
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </form>
      <p style={{ marginTop: '1rem' }}>
        已有账户？ <button onClick={onSwitchToLogin} style={{ background: 'none', border: 'none', color: '#646cff', cursor: 'pointer', padding: 0 }}>去登录</button>
      </p>
    </div>
  );
};

export default RegisterForm;