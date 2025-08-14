// src/contexts/AuthContext.jsx

import React, { createContext, useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';
import { useNavigate } from 'react-router-dom';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(() => localStorage.getItem('authToken'));
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true); 
  const navigate = useNavigate();

  const logoutAction = useCallback(() => {
    localStorage.removeItem('authToken');
    setToken(null);
    setUser(null);
    setUserRole(null);
    delete axios.defaults.headers.common['Authorization'];
    navigate('/login');
  }, [navigate]);

  useEffect(() => {
    const initializeAuth = () => {
      const storedToken = localStorage.getItem('authToken');
      if (storedToken) {
        try {
          const decodedUser = jwtDecode(storedToken);
          if (decodedUser.exp * 1000 < Date.now()) {
            throw new Error("Token expired");
          }
          axios.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
          setToken(storedToken);
          setUser(decodedUser);
          setUserRole(decodedUser.role);
        } catch (error) {
          console.error("Initialization failed with invalid token:", error);
          logoutAction(); // Token无效或过期，直接登出
        }
      }
      setIsAuthLoading(false);
    };

    initializeAuth();
  }, [logoutAction]);
  
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      response => response,
      error => {
        if (error.response && error.response.status === 401 && !error.config.url.endsWith('/api/auth/login')) {
          console.log("Caught 401 Error on a protected route. Logging out.");
          logoutAction();
        }
        return Promise.reject(error);
      }
    );
    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, [logoutAction]);

  const loginAction = async (data) => {
    setIsAuthLoading(true); // <-- **关键改动：开始登录时，设置加载状态**
    try {
      const response = await axios.post('http://localhost:8080/api/auth/login', data);
      const newToken = response.data.token;
      if (newToken) {
        localStorage.setItem('authToken', newToken);
        const decodedUser = jwtDecode(newToken);
        axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
        setUser(decodedUser);
        setUserRole(decodedUser.role);
        setToken(newToken);
        return { success: true };
      }
      return { success: false, error: "Token not found in response" };
    } catch (error) {
      console.error("Login failed:", error);
      return { success: false, error: error.response?.data?.error || "登录失败" };
    } finally {
      setIsAuthLoading(false); // <-- **关键改动：登录结束后，取消加载状态**
    }
  };
  
  const registerAction = async (data) => {
      try {
        await axios.post('http://localhost:8080/api/auth/register', data);
        return { success: true };
      } catch (error) {
        console.error("Registration failed:", error);
        return { success: false, error: error.response?.data?.error || "注册失败" };
      }
  };

  const value = {
    token,
    user,
    userRole,
    isAuthLoading,
    loginAction,
    registerAction,
    logoutAction,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};