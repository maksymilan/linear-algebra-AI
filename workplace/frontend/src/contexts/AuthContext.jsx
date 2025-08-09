import React, { createContext, useState, useEffect } from 'react';
import axios from 'axios';
import { jwtDecode } from 'jwt-decode';

export const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem('authToken'));
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (token) {
      try {
        const decodedUser = jwtDecode(token);
        // 检查token是否过期
        if (decodedUser.exp * 1000 < Date.now()) {
          throw new Error("Token expired");
        }
        setUser(decodedUser);
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      } catch (error) {
        console.error("Invalid or expired token:", error);
        localStorage.removeItem('authToken');
        setToken(null);
        setUser(null);
        delete axios.defaults.headers.common['Authorization'];
      }
    }
  }, [token]);
  
  // --- V V V 新增：Axios响应拦截器 V V V ---
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      response => response,
      error => {
        // 如果错误是401，则自动登出
        if (error.response && error.response.status === 401) {
          console.log("Caught 401 Error. Logging out.");
          logoutAction();
        }
        return Promise.reject(error);
      }
    );
    // 组件卸载时移除拦截器
    return () => {
      axios.interceptors.response.eject(interceptor);
    };
  }, []); // 空依赖数组确保只在挂载和卸载时运行
  // --- ^ ^ ^ 新增结束 ^ ^ ^ ---

  const loginAction = async (data) => {
    try {
      const response = await axios.post('http://localhost:8080/api/auth/login', data);
      const newToken = response.data.token;
      if (newToken) {
        localStorage.setItem('authToken', newToken);
        setToken(newToken);
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
    delete axios.defaults.headers.common['Authorization'];
  };

  const value = {
    token,
    user,
    loginAction,
    registerAction,
    logoutAction,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};