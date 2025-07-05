// src/pages/LoginPage.jsx
import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import FormInput from '../components/FormInput';     // 引入新组件
import PasswordInput from '../components/PasswordInput'; // 引入新组件

function LoginPage() {
  const [isLoginView, setIsLoginView] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [userIdNo, setUserIdNo] = useState(''); // **错误修复：userIfNo -> userIdNo**

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { loginAction, registerAction } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from?.pathname || "/";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    let result;
    if (isLoginView) {
      result = await loginAction({ username, password });
      if (result.success) {
        navigate(from, { replace: true });
      } else {
        setError(result.error);
      }
    } else {
      // **错误修复：使用正确的变量名 userIdNo**
      result = await registerAction({ username, email, password, user_id_no: userIdNo });
      if (result.success) {
        alert('注册成功！请登录。');
        setIsLoginView(true);
        setPassword('');
      } else {
        setError(result.error);
      }
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '400px', margin: 'auto', textAlign: 'center' }}>
      <h1>{isLoginView ? '登录' : '注册'}</h1>
      <form onSubmit={handleSubmit}>
        <FormInput 
          label="用户名"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="请输入用户名"
          required
        />
        
        {!isLoginView && (
          <>
            <FormInput 
              label="学工号"
              value={userIdNo}
              onChange={(e) => setUserIdNo(e.target.value)}
              placeholder="请输入学工号"
              required
            />
            <FormInput 
              label="邮箱"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="请输入邮箱"
              required
            />
          </>
        )}
        
        <PasswordInput
          label="密码 (最少6位)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="请输入密码"
          required
        />

        <button type="submit" disabled={loading} style={{ padding: '0.8rem 1.5rem', width: '100%', cursor: 'pointer', marginTop: '1rem' }}>
          {loading ? '处理中...' : (isLoginView ? '登录' : '注册')}
        </button>
      </form>
      {error && <p style={{ color: 'red', marginTop: '1rem' }}>{error}</p>}
      <button onClick={() => setIsLoginView(!isLoginView)} style={{ marginTop: '1rem', background: 'none', border: 'none', color: '#646cff', cursor: 'pointer', padding: 0 }}>
        {isLoginView ? '还没有账户？去注册' : '已有账户？去登录'}
      </button>
    </div>
  );
}

export default LoginPage;