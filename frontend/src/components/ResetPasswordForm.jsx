import React, { useState } from 'react';
import axios from 'axios';
import FormInput from './FormInput';
import PasswordInput from './PasswordInput';

const ResetPasswordForm = ({ onResetSuccess, onSwitchToLogin }) => {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const handleReset = async (e) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      setError('新密码最少需要6个字符');
      return;
    }
    setLoading(true);
    setError('');
    setSuccessMsg('');

    try {
      const response = await axios.post('http://localhost:8080/api/auth/reset-password', {
        username,
        email,
        new_password: newPassword
      });
      setSuccessMsg(response.data.message);
      setTimeout(() => {
        onResetSuccess();
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.error || "密码重置失败，请检查用户名和邮箱是否匹配");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ textAlign: 'center' }}>
      <h2>找回密码</h2>
      <p>通过用户名和邮箱重置您的密码</p>
      {successMsg ? (
        <p style={{ color: 'green', marginTop: '2rem' }}>{successMsg}</p>
      ) : (
        <form onSubmit={handleReset} style={{ marginTop: '2rem' }}>
          <FormInput 
            label="用户名"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
          <FormInput 
            label="注册邮箱"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <PasswordInput
            label="新密码 (最少6位)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <button type="submit" disabled={loading} style={{ padding: '0.8rem 1.5rem', width: '100%', cursor: 'pointer', marginTop: '1rem' }}>
            {loading ? '提交中...' : '重置密码'}
          </button>
          {error && <p style={{ color: 'red', marginTop: '1rem' }}>{error}</p>}
        </form>
      )}
      <p style={{ marginTop: '1rem' }}>
        记起密码了？ <button onClick={onSwitchToLogin} style={{ background: 'none', border: 'none', color: '#000', textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>返回登录</button>
      </p>
    </div>
  );
};

export default ResetPasswordForm;
