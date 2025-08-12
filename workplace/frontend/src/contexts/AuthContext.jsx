// src/contexts/AuthContext.jsx

import React, { createContext, useState, useEffect } from 'react';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem('authToken'));
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null); // <-- 新增: 存储用户角色

  useEffect(() => {
    if (token) {
      try {
        const decodedUser = jwtDecode(token);
        if (decodedUser.exp * 1000 < Date.now()) {
          throw new Error("Token expired");
        }
        setUser(decodedUser);
        setUserRole(decodedUser.role); // <-- 新增: 解码并设置角色
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      } catch (error) {
        console.error("Invalid or expired token:", error);
        localStorage.removeItem('authToken');
        setToken(null);
        setUser(null);
        setUserRole(null); // <-- 新增: 清空角色
        delete axios.defaults.headers.common['Authorization'];
      }
    }
  }, [token]);
  
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      response => response,
      error => {
        if (error.response && error.response.status === 401) {
          console.log("Caught 401 Error. Logging out.");
          logoutAction();
        }
        return Promise.reject(error);
      }
    );
    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, []); 

  const loginAction = async (data) => {
    try {
      const response = await axios.post('http://localhost:8080/api/auth/login', data);
      const newToken = response.data.token;
      if (newToken) {
        localStorage.setItem('authToken', newToken);
        setToken(newToken);
        // 手动解码以立即更新角色
        const decodedUser = jwtDecode(newToken);
        setUser(decodedUser);
        setUserRole(decodedUser.role);
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
    setUser(null);
    setUserRole(null); // <-- 新增: 登出时清空角色
    delete axios.defaults.headers.common['Authorization'];
  };

  const value = {
    token,
    user,
    userRole, // <-- 新增: 将角色暴露出去
    loginAction,
    registerAction,
    logoutAction,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};