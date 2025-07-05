// src/components/LoginForm.jsx
import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import FormInput from './FormInput';
import PasswordInput from './PasswordInput';

// 我们传入一个 onLoginSuccess 回调函数，在登录成功后执行
const LoginForm = ({ onLoginSuccess, onSwitchToRegister }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { loginAction } = useAuth();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const result = await loginAction({ username, password });
    if (result.success) {
      onLoginSuccess(); // 调用父组件传入的成功回调
    } else {
      setError(result.error);
    }
    setLoading(false);
  };

  return (
    <div style={{ textAlign: 'center' }}>
      <h2>登录</h2>
      <p>欢迎回来！</p>
      <form onSubmit={handleLogin} style={{ marginTop: '2rem' }}>
        <FormInput 
          label="用户名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <PasswordInput
          label="密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <button type="submit" disabled={loading} style={{ /* ...样式... */ }}>
          {loading ? '登录中...' : '登录'}
        </button>
        {error && <p style={{ color: 'red' }}>{error}</p>}
      </form>
      <p style={{ marginTop: '1rem' }}>
        还没有账户？ <button onClick={onSwitchToRegister}>去注册</button>
      </p>
    </div>
  );
};

export default LoginForm;
// (您可以按照同样的方式创建一个 RegisterForm.jsx 组件)