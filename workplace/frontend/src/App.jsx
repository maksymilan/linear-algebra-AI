// frontend/src/App.jsx
import React, { useState } from 'react';
import axios from 'axios';
import reactLogo from './assets/react.svg'; // Vite 的 logo 导入方式
import './App.css';

function App() {
  const [message, setMessage] = useState('Click the button to get a message from the backend.');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchData = async () => {
    setLoading(true);
    setError('');
    try {
      // 调用 Go 服务的 API 端点，这部分逻辑不变
      const response = await axios.get('http://localhost:8080/api/ping');

      const pythonMessage = response.data.message;
      // 使用 toLocaleString() 格式化时间，更友好
      const timestamp = new Date(response.data.timestamp * 1000).toLocaleString();
      setMessage(`From Python (via Go): "${pythonMessage}" at ${timestamp}`);

    } catch (err) {
      setError('Failed to fetch data. Are the backend services running and CORS configured?');
      console.error(err);
    }
    setLoading(false);
  };

  return (
    <div className="App">
      <div>
        <a href="https://vitejs.dev" target="_blank">
          <img src="/vite.svg" className="logo" alt="Vite logo" />
        </a>
        <a href="https://reactjs.org" target="_blank">
          <img src={reactLogo} className="logo react" alt="React logo" />
        </a>
      </div>
      <h1>Vite + React + Go + Python</h1>
      <div className="card">
        <p>{message}</p>
        <button onClick={fetchData} disabled={loading}>
          {loading ? 'Loading...' : 'Ping Backend'}
        </button>
        {error && <p className="error">{error}</p>}
      </div>
    </div>
  );
}

export default App;