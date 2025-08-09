import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useAuth } from '../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import FileUploadButton from '../components/FileUploadButton'; 
import './GradingPage.css';

const GradingPage = () => {
  const [problemText, setProblemText] = useState('');
  const [solutionText, setSolutionText] = useState('');
  const [solutionFile, setSolutionFile] = useState(null);
  
  const [history, setHistory] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOcrLoading, setIsOcrLoading] = useState({ problem: false, solution: false });
  const [error, setError] = useState('');
  const [selectedResult, setSelectedResult] = useState(null);

  const { token } = useAuth();
  const navigate = useNavigate();

  const fetchHistory = useCallback(async () => {
    try {
      const response = await axios.get('http://localhost:8080/api/grading/history', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setHistory(response.data || []);
      if(response.data && response.data.length > 0 && !selectedResult) {
        setSelectedResult(response.data[0]);
      }
    } catch (err) {
      setError('无法加载批改历史');
    }
  }, [token, selectedResult]);
  
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleFileOcr = async (file, type) => {
    if (!file) return;

    setIsOcrLoading(prev => ({ ...prev, [type]: true }));
    setError('');
    const formData = new FormData();
    formData.append('file', file);
    
    try {
        const response = await axios.post('http://localhost:8080/api/grading/ocr', formData, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (type === 'problem') {
            setProblemText(response.data.text || '');
        } else {
            setSolutionText(response.data.text || '');
            setSolutionFile(file);
        }
    } catch (err) {
        setError(err.response?.data?.error || `${type === 'problem' ? '题目' : '解答'}识别失败`);
    } finally {
        setIsOcrLoading(prev => ({ ...prev, [type]: false }));
    }
  };

  const handleGrade = async () => {
    if (!problemText.trim()) { setError('请先提供题目内容'); return; }
    if (!solutionText.trim()) { setError('请提供并确认解答内容'); return; }

    setIsLoading(true);
    setError('');
    const formData = new FormData();
    formData.append('problemText', problemText);
    formData.append('solutionText', solutionText);
    formData.append('solutionFilename', solutionFile ? solutionFile.name : 'Typed Solution');

    try {
      const response = await axios.post('http://localhost:8080/api/grading/upload', formData, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      setProblemText('');
      setSolutionText('');
      setSolutionFile(null);
      document.getElementById('problem-file-input').value = null;
      document.getElementById('solution-file-input').value = null;
      
      await fetchHistory();
      setSelectedResult(response.data);
    } catch (err) {
      setError(err.response?.data?.error || '批改失败，请稍后再试');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('您确定要删除这条批改记录吗？')) {
        try {
          await axios.delete(`http://localhost:8080/api/grading/${id}`, {
            headers: { 'Authorization': `Bearer ${token}` }
          });
          const newHistory = history.filter(h => h.id !== id);
          setHistory(newHistory);
          if (selectedResult && selectedResult.id === id) {
              setSelectedResult(newHistory.length > 0 ? newHistory[0] : null);
          }
        } catch (err) {
          setError('删除失败');
        }
      }
  };

  return (
    <div className="grading-container">
      <div className="grading-sidebar">
        <div className="sidebar-header">
          <button className="back-button" onClick={() => navigate('/workspace')}>← 返回工作区</button>
          <h3>批改历史</h3>
        </div>
        <div className="history-list">
          {history.map(item => (
            <div 
              key={item.id} 
              className={`history-item ${selectedResult?.id === item.id ? 'active' : ''}`}
              onClick={() => setSelectedResult(item)}
            >
              <span className="filename">{item.filename}</span>
              <span className="timestamp">{new Date(item.createdAt).toLocaleString()}</span>
              <button className="delete-btn" onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}>×</button>
            </div>
          ))}
        </div>
      </div>
      
      <div className="grading-main">
        <div className="grading-workflow">
            <div className="workflow-step">
                <div className="step-header">
                    <span className="step-number">1</span>
                    <h2>提供题目</h2>
                </div>
                <p>在下方输入或上传图片/PDF识别题目，并进行编辑确认。</p>
                <textarea 
                    value={problemText}
                    onChange={(e) => setProblemText(e.target.value)}
                    placeholder="在此处手动输入或编辑识别后的题目..."
                    rows="8"
                    className="problem-textarea"
                />
                <div>
                    <FileUploadButton
                        id="problem-file-input"
                        onChange={(e) => handleFileOcr(e.target.files[0], 'problem')}
                        isLoading={isOcrLoading.problem}
                        accept=".pdf,.jpg,.jpeg,.png"
                    >
                        上传文件识别
                    </FileUploadButton>
                </div>
            </div>

            <div className="workflow-step">
                <div className="step-header">
                    <span className="step-number">2</span>
                    <h2>提供解答</h2>
                </div>
                <p>上传您的解答图片或PDF，系统将自动识别，您可以在下方进行编辑确认。</p>
                <textarea 
                    value={solutionText}
                    onChange={(e) => setSolutionText(e.target.value)}
                    placeholder="解答识别结果将显示在此处，请编辑确认..."
                    rows="8"
                    className="problem-textarea"
                />
                <FileUploadButton
                    id="solution-file-input"
                    onChange={(e) => handleFileOcr(e.target.files[0], 'solution')}
                    isLoading={isOcrLoading.solution}
                    accept=".pdf,.jpg,.jpeg,.png"
                >
                    上传解答文件
                </FileUploadButton>
            </div>
        </div>

        <div className="submit-section">
            <button onClick={handleGrade} disabled={isLoading || isOcrLoading.problem || isOcrLoading.solution}>
                {isLoading ? '批改中...' : '提交批改'}
            </button>
            {error && <p className="error-message">{error}</p>}
        </div>

        <div className="results-section">
          {selectedResult ? (
            <>
              <h3>批改结果: {selectedResult.filename}</h3>
              <div className="correction-content" dangerouslySetInnerHTML={{ __html: selectedResult.correction }}></div>
            </>
          ) : (
            <div className="no-result">
              <p>提交作业后，将在此处显示批改结果</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GradingPage;