import React, { createContext, useState } from 'react';
import axios from 'axios';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  // 从 localStorage 初始化 token，这样刷新页面后登录状态不会丢失
  const [token, setToken] = useState(localStorage.getItem('authToken'));

  const loginAction = async (data) => {
    try {
      const response = await axios.post('http://localhost:8080/api/auth/login', data);
      const newToken = response.data.token;
      if (newToken) {
        localStorage.setItem('authToken', newToken);
        setToken(newToken);
        axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
        return { success: true };
      }
    } catch (error) {
      console.error("Login failed:", error);
      return { success: false, error: error.response?.data?.error || "Login failed" };
    }
  };
  
  const registerAction = async (data) => {
      try {
        await axios.post('http://localhost:8080/api/auth/register', data);
        return { success: true };
      } catch (error) {
        console.error("Registration failed:", error);
        return { success: false, error: error.response?.data?.error || "Registration failed" };
      }
  };

  const logoutAction = () => {
    localStorage.removeItem('authToken');
    setToken(null);
    delete axios.defaults.headers.common['Authorization'];
  };

  const value = {
    token,
    loginAction,
    registerAction,
    logoutAction,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};