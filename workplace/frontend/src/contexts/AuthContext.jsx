// src/contexts/AuthContext.jsx
import React, { createContext, useState, useEffect } from 'react';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode'; // 引入jwt-decode

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem('authToken'));
  // --- V V V 新增 user 状态 V V V ---
  const [user, setUser] = useState(null);
  // --- ^ ^ ^ 新增 user 状态 ^ ^ ^ ---

  useEffect(() => {
    // 当组件加载或token变化时，尝试解析token并设置用户信息
    if (token) {
      try {
        const decodedUser = jwtDecode(token);
        setUser(decodedUser);
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      } catch (error) {
        console.error("Invalid token:", error);
        // 如果token无效，则清理状态
        localStorage.removeItem('authToken');
        setToken(null);
        setUser(null);
      }
    }
  }, [token]);

  const loginAction = async (data) => {
    try {
      const response = await axios.post('http://localhost:8080/api/auth/login', data);
      const newToken = response.data.token;
      if (newToken) {
        localStorage.setItem('authToken', newToken);
        setToken(newToken); // 更新token会触发useEffect来设置user
        return { success: true };
      }
      return { success: false, error: "Token not found in response" };
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
    setUser(null); // 退出时清空用户信息
    delete axios.defaults.headers.common['Authorization'];
  };

  const value = {
    token,
    user, // 将user对象提供给所有子组件
    loginAction,
    registerAction,
    logoutAction,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};