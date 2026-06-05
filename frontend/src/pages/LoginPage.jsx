import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import axios from 'axios';
import { AnimatePresence, motion } from 'framer-motion';
import FormInput from '../components/FormInput';
import PasswordInput from '../components/PasswordInput';
import './LoginPage.css';

// 登录表单组件 (无变化)
const LoginForm = ({ onLogin, loading, error, onSwitch, formValues, handleInputChange }) => (
  <motion.div
    key="login"
    initial={{ opacity: 0, x: -50 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: 50 }}
    transition={{ duration: 0.3 }}
  >
    <h1>欢迎回来</h1>
    <p className="form-subtitle">登录以继续您的学习之旅。</p>
    <form onSubmit={onLogin}>
      <FormInput 
        label="用户名"
        name="username"
        value={formValues.username}
        onChange={handleInputChange}
        placeholder="请输入您的用户名"
        required
      />
      <PasswordInput
        label="密码"
        name="password"
        value={formValues.password}
        onChange={handleInputChange}
        placeholder="请输入您的密码"
        required
      />
      <button type="submit" disabled={loading} className="main-button">
        {loading ? '登录中...' : '登录'}
      </button>
      {error && <p className="error-message">{error}</p>}
    </form>
    <div className="toggle-link" style={{ marginBottom: '0.5rem' }}>
      <Link to="/forgot-password" style={{ color: '#495057', textDecoration: 'underline' }}>忘记密码？</Link>
    </div>
    <div className="toggle-link">
      还没有账户？ <button type="button" onClick={onSwitch}>立即注册</button>
    </div>
  </motion.div>
);

// 注册表单组件 (使用您提供的UI结构)
const RegisterForm = ({
  onRegister,
  loading,
  error,
  onSwitch,
  formValues,
  handleInputChange,
  onRequestCode,
  codeLoading,
  codeCooldown,
  info,
}) => (
  <motion.div
    key="register"
    initial={{ opacity: 0, x: 50 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: -50 }}
    transition={{ duration: 0.3 }}
  >
    <h1>创建新账户</h1>
    <p className="form-subtitle">加入我们，开启智能学习新篇章。</p>
    <form onSubmit={onRegister}>
      {/* --- 角色选择 --- */}
      <div className="form-group role-selection">
        <label>您的身份是？</label>
        <div className="role-options">
            <label>
                <input 
                    type="radio" 
                    name="role" 
                    value="student" 
                    checked={formValues.role === 'student'} 
                    onChange={handleInputChange} 
                />
                <span>学生</span>
            </label>
            <label>
                <input 
                    type="radio" 
                    name="role" 
                    value="teacher" 
                    checked={formValues.role === 'teacher'} 
                    onChange={handleInputChange}
                />
                <span>教师</span>
            </label>
        </div>
      </div>

      <FormInput 
        label="用户名"
        name="username"
        value={formValues.username}
        onChange={handleInputChange}
        placeholder="设置您的用户名"
        required
      />
      <FormInput 
        label="学工号"
        name="userIdNo"
        value={formValues.userIdNo}
        onChange={handleInputChange}
        placeholder="请输入您的学工号"
        required
      />
      <FormInput 
        label="邮箱"
        type="email"
        name="email"
        value={formValues.email}
        onChange={handleInputChange}
        placeholder="请输入您的邮箱"
        required
      />
      <div className="verification-row">
        <div className="verification-input">
          <FormInput
            label="邮箱验证码"
            name="code"
            value={formValues.code}
            onChange={handleInputChange}
            placeholder="请输入 6 位验证码"
            required
          />
        </div>
        <button
          type="button"
          className="secondary-button verification-button"
          onClick={onRequestCode}
          disabled={codeLoading || codeCooldown > 0 || !formValues.email.trim()}
        >
          {codeLoading ? '发送中...' : codeCooldown > 0 ? `${codeCooldown}s` : '发送验证码'}
        </button>
      </div>
      {info && <p className="info-message">{info}</p>}
      <PasswordInput
        label="密码 (最少6位)"
        name="password"
        value={formValues.password}
        onChange={handleInputChange}
        placeholder="设置您的密码"
        required
      />
      {formValues.role === 'student' && (
        <FormInput
          label="班级邀请码（可选）"
          name="inviteCode"
          value={formValues.inviteCode}
          onChange={handleInputChange}
          placeholder="6 位字母数字，留空可稍后加入"
        />
      )}
      <button type="submit" disabled={loading} className="main-button">
        {loading ? '注册中...' : '创建账户'}
      </button>
      {error && <p className="error-message">{error}</p>}
    </form>
    <div className="toggle-link">
      已有账户？ <button type="button" onClick={onSwitch}>返回登录</button>
    </div>
  </motion.div>
);


function LoginPage() {
  const [isLoginView, setIsLoginView] = useState(true);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeCooldown, setCodeCooldown] = useState(0);
  
  // 在表单状态中加入 role，并设置默认值为 'student'
  const [formValues, setFormValues] = useState({
    username: '',
    password: '',
    email: '',
    userIdNo: '',
    role: 'student', // 默认角色
    inviteCode: '',
    code: ''
  });

  const { loginAction, registerAction } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  
  const from = location.state?.from?.pathname || "/workspace";

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    const nextValue = name === 'code' ? value.replace(/\D/g, '').slice(0, 6) : value;
    setFormValues(prev => ({ ...prev, [name]: nextValue }));
  };

  const startCodeCooldown = () => {
    setCodeCooldown(60);
    const timer = setInterval(() => {
      setCodeCooldown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const requestRegisterCode = async () => {
    const email = formValues.email.trim();
    if (!email) {
      setError('请先填写邮箱');
      return;
    }
    setError('');
    setInfo('');
    setCodeLoading(true);
    try {
      const resp = await axios.post('/api/auth/request-code', {
        email,
        purpose: 'register',
      });
      setInfo(resp.data?.message || '验证码已发送，请查收邮箱');
      startCodeCooldown();
    } catch (e) {
      setError(e.response?.data?.error || '验证码发送失败');
    } finally {
      setCodeLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setInfo('');

    let result;
    if (isLoginView) {
      result = await loginAction({ 
        username: formValues.username, 
        password: formValues.password 
      });
      if (result.success) {
        navigate(from, { replace: true });
      } else {
        setError(result.error);
      }
    } else {
      // 注册时，传递整个 formValues 对象
      result = await registerAction({ 
        username: formValues.username, 
        email: formValues.email, 
        password: formValues.password, 
        user_id_no: formValues.userIdNo,
        role: formValues.role, // 传递角色
        invite_code: formValues.role === 'student' ? (formValues.inviteCode || '').trim().toUpperCase() : '', // 仅学生传邀请码
        code: formValues.code.trim()
      });
      if (result.success) {
        alert('注册成功！请登录。');
        setIsLoginView(true);
        setFormValues(prev => ({ ...prev, password: '', email: '', userIdNo: '', role: 'student', inviteCode: '', code: '' }));
      } else {
        setError(result.error);
      }
    }
    setLoading(false);
  };

  return (
    <div className="login-page-container">
      <div className="login-promo-panel">
        <img src="/logo.svg" alt="App Logo" />
        <h2>智能助教平台</h2>
        <p>您的AI学习伙伴，集成了可视化教学、智能问答与自动批改。</p>
      </div>
      <div className="login-form-wrapper">
        <div className="form-container">
          <AnimatePresence mode="wait">
            {isLoginView ? (
              <LoginForm 
                onLogin={handleSubmit}
                loading={loading}
                error={error}
                onSwitch={() => setIsLoginView(false)}
                formValues={formValues}
                handleInputChange={handleInputChange}
              />
            ) : (
              <RegisterForm 
                onRegister={handleSubmit}
                loading={loading}
                error={error}
                onSwitch={() => setIsLoginView(true)}
                formValues={formValues}
                handleInputChange={handleInputChange}
                onRequestCode={requestRegisterCode}
                codeLoading={codeLoading}
                codeCooldown={codeCooldown}
                info={info}
              />
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

export default LoginPage;
