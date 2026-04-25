import React, { useState, useEffect, useRef, useCallback } from 'react';
import axios from 'axios';
import { Upload, Book, CheckCircle, Clock, AlertCircle, RefreshCw, XCircle, Trash2 } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

const API_BASE_URL = 'http://localhost:8080';
const POLL_INTERVAL_MS = 3000;

const TextbookManager = () => {
  const { token } = useAuth();
  const [textbooks, setTextbooks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState(null);
  const [name, setName] = useState('');
  const [message, setMessage] = useState('');
  const pollTimerRef = useRef(null);

  const fetchTextbooks = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setIsLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/teacher/textbooks`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTextbooks(response.data || []);
    } catch (err) {
      console.error("获取教材列表失败:", err);
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchTextbooks();
  }, [fetchTextbooks]);

  // 自动轮询：只要存在 processing 状态的教材，就每 3s 刷新一次进度
  useEffect(() => {
    const hasProcessing = textbooks.some((tb) => tb.status === 'processing');
    if (hasProcessing) {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = setInterval(() => {
        fetchTextbooks({ silent: true });
      }, POLL_INTERVAL_MS);
    } else if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    return () => {
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [textbooks, fetchTextbooks]);

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file || !name.trim()) return;

    setUploading(true);
    setMessage('');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name);

    try {
      await axios.post(`${API_BASE_URL}/api/teacher/textbooks`, formData, {
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      });
      setMessage('✅ 教材已成功上传！后台大模型正在进行多模态 OCR 提取与向量化，此过程可能需要几十分钟。请稍后刷新状态。');
      setName('');
      setFile(null);
      fetchTextbooks(); // 刷新列表
    } catch (err) {
      setMessage(`❌ 上传失败: ${err.response?.data?.error || err.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleCancel = async (id) => {
    if (!window.confirm('确定要取消该教材的解析任务吗？')) return;
    try {
      await axios.post(`${API_BASE_URL}/api/teacher/textbooks/${id}/cancel`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessage('✅ 已发送取消指令，后台正在停止任务。');
      fetchTextbooks();
    } catch (err) {
      setMessage(`❌ 取消失败: ${err.response?.data?.error || err.message}`);
    }
  };

  const handleDelete = async (tb) => {
    const warn = tb.status === 'completed'
      ? `确定要删除教材《${tb.name}》吗？\n\n注意：此操作会**永久**移除该教材在向量库中的所有切片，删除后 AI 助教将不再从这本书里检索内容。`
      : `确定要删除《${tb.name}》吗？此操作将同时清理它在向量库中可能残留的切片与本地上传文件。`;
    if (!window.confirm(warn)) return;
    try {
      await axios.delete(`${API_BASE_URL}/api/teacher/textbooks/${tb.id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setMessage('✅ 已删除该教材及其向量库数据。');
      fetchTextbooks();
    } catch (err) {
      setMessage(`❌ 删除失败: ${err.response?.data?.error || err.message}`);
    }
  };

  return (
    <div className="bg-white p-6 rounded-xl border border-[#DEE2E6] shadow-sm max-w-4xl mx-auto font-sans text-[#212529]">
      <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
        <Book className="text-[#868E96]" />
        知识库教材管理 (全量RAG底座)
      </h2>

      {/* 上传区域 */}
      <div className="bg-[#F8F9FA] p-6 rounded-lg mb-8 border border-[#DEE2E6]">
        <h3 className="font-semibold mb-4 text-[#212529]">上传新教材 (PDF)</h3>
        <form onSubmit={handleUpload} className="flex flex-col gap-4">
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-[#868E96] mb-1">教材名称</label>
              <input 
                type="text" 
                value={name} 
                onChange={(e) => setName(e.target.value)} 
                placeholder="例如：同济版线性代数第七版"
                className="w-full h-10 px-4 border border-[#DEE2E6] rounded-md focus:border-black focus:ring-1 focus:ring-black outline-none transition-colors text-sm bg-white box-border"
                required
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-[#868E96] mb-1">PDF 文件</label>
              <input 
                type="file" 
                accept=".pdf"
                onChange={(e) => {
                  const picked = e.target.files[0];
                  setFile(picked);
                  // 用户尚未填写教材名称时，默认用 PDF 文件名（去掉扩展名）自动填入
                  if (picked && !name.trim()) {
                    const base = picked.name.replace(/\.pdf$/i, '').trim();
                    if (base) setName(base);
                  }
                }} 
                className="w-full h-10 pr-3 leading-10 border border-[#DEE2E6] bg-white rounded-md text-sm overflow-hidden file:mr-3 file:h-10 file:px-3 file:border-0 file:bg-[#F8F9FA] file:text-sm file:text-[#212529] file:cursor-pointer hover:file:bg-[#DEE2E6] box-border"
                required
              />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-4 gap-4">
            <span className="text-sm text-[#868E96] flex-1">
              * 提示：系统将使用大模型视觉能力逐页进行 OCR 解析并提取数学公式，70MB 的课本可能需要 1 小时左右完成。上传后请耐心等待进度条更新。
            </span>
            <button 
              type="submit" 
              disabled={uploading || !file || !name}
              className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-md font-medium transition-colors whitespace-nowrap min-w-[160px] ${
                uploading || !file || !name ? 'bg-[#DEE2E6] text-[#868E96] cursor-not-allowed' : 'bg-black text-white hover:bg-gray-800'
              }`}
            >
              {uploading ? <RefreshCw className="animate-spin" size={18} /> : <Upload size={18} />}
              {uploading ? '上传并开始解析...' : '上传教材'}
            </button>
          </div>
          {message && <div className={`text-sm mt-2 p-3 rounded-md ${message.includes('✅') ? 'bg-[#e9f5ec] text-[#218838]' : 'bg-[#fdf3f4] text-[#dc3545]'}`}>{message}</div>}
        </form>
      </div>

      {/* 列表区域 */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold text-[#212529]">已上传的教材库</h3>
        <button 
          onClick={fetchTextbooks} 
          className="flex items-center gap-1.5 text-sm text-[#868E96] hover:text-black transition-colors"
        >
          <RefreshCw size={14} /> 刷新状态
        </button>
      </div>
      
      {isLoading ? (
        <div className="text-center py-8 text-[#868E96]">加载中...</div>
      ) : textbooks.length === 0 ? (
        <div className="text-center py-12 border border-dashed border-[#DEE2E6] rounded-lg text-[#868E96]">
          暂无教材，请在上方上传
        </div>
      ) : (
        <div className="border border-[#DEE2E6] rounded-lg overflow-hidden">
          <table className="w-full text-left border-collapse">
            <thead className="bg-[#F8F9FA] border-b border-[#DEE2E6] text-[#868E96] text-sm">
              <tr>
                <th className="px-6 py-3 font-medium">教材名称</th>
                <th className="px-6 py-3 font-medium">上传时间</th>
                <th className="px-6 py-3 font-medium">处理状态</th>
                <th className="px-6 py-3 font-medium text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {textbooks.map((tb) => (
                <tr key={tb.id} className="border-b border-[#DEE2E6] last:border-0 hover:bg-[#F8F9FA] transition-colors">
                  <td className="px-6 py-4 font-medium text-[#212529]">{tb.name}</td>
                  <td className="px-6 py-4 text-sm text-[#868E96]">{new Date(tb.created_at).toLocaleString()}</td>
                  <td className="px-6 py-4">
                    {tb.status === 'completed' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#e9f5ec] text-[#218838]">
                        <CheckCircle size={14} /> 解析完成 (可供检索)
                      </span>
                    )}
                    {tb.status === 'processing' && (
                      <div className="flex items-center gap-3">
                        <div className="flex flex-col gap-1.5 min-w-[180px]">
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#fff8e6] text-[#d39e00] w-fit">
                            <Clock size={14} className="animate-pulse" /> 
                            {tb.total_pages > 0 
                              ? `AI 解析中 (${tb.processed_pages}/${tb.total_pages} · ${Math.min(100, Math.floor((tb.processed_pages / tb.total_pages) * 100))}%)`
                              : 'AI 正在准备解析（读取页数中...）'}
                          </span>
                          <div className="w-full bg-[#DEE2E6] rounded-full h-1.5 overflow-hidden relative">
                            {tb.total_pages > 0 ? (
                              <div 
                                className="bg-[#d39e00] h-1.5 rounded-full transition-all duration-500 ease-out" 
                                style={{ width: `${Math.min(100, Math.max(0, (tb.processed_pages / tb.total_pages) * 100))}%` }}
                              ></div>
                            ) : (
                              <div className="absolute inset-y-0 bg-[#d39e00] h-1.5 rounded-full textbook-progress-indeterminate"></div>
                            )}
                          </div>
                        </div>
                        <button 
                          onClick={() => handleCancel(tb.id)}
                          className="text-xs text-[#868E96] hover:text-[#dc3545] transition-colors flex items-center gap-1"
                          title="取消解析任务"
                        >
                          <XCircle size={16} /> 取消
                        </button>
                      </div>
                    )}
                    {tb.status === 'failed' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#fdf3f4] text-[#dc3545]">
                        <AlertCircle size={14} /> 解析失败
                      </span>
                    )}
                    {tb.status === 'canceled' && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#f8f9fa] text-[#868E96] border border-[#DEE2E6]">
                        <XCircle size={14} /> 已取消
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleDelete(tb)}
                      disabled={tb.status === 'processing'}
                      title={tb.status === 'processing' ? '请先取消解析任务再删除' : '删除该教材及其向量库数据'}
                      className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-md border transition-colors ${
                        tb.status === 'processing'
                          ? 'text-[#ADB5BD] border-[#DEE2E6] cursor-not-allowed'
                          : 'text-[#495057] border-[#DEE2E6] hover:text-[#dc3545] hover:border-[#dc3545]'
                      }`}
                    >
                      <Trash2 size={14} /> 删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default TextbookManager;
