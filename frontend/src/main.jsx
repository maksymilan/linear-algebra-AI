// src/main.jsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext.jsx';
import axios from 'axios'; // 1. 引入 axios

// 2. 为所有 axios 请求设置默认的 baseURL。生产环境走同域 /api，由 Nginx 反代到 Go 服务。
axios.defaults.baseURL = import.meta.env.VITE_API_BASE_URL || '';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
