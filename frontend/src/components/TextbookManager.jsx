import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileText,
  RefreshCw,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import Button from './ui/Button';
import IconButton from './ui/IconButton';
import { EmptyState, InlineAlert, LoadingState } from './ui/FeedbackState';
import { useConfirm } from '../contexts/ConfirmContext';
import { useToast } from '../contexts/ToastContext';
import './TextbookManager.css';

const API_BASE_URL = '';
const POLL_INTERVAL_MS = 3000;

const statusMeta = {
  completed: { label: '解析完成', icon: CheckCircle2, tone: 'success' },
  processing: { label: '解析中', icon: Clock3, tone: 'warning' },
  failed: { label: '解析失败', icon: AlertCircle, tone: 'danger' },
  canceled: { label: '已取消', icon: XCircle, tone: 'neutral' },
};

const TextbookManager = () => {
  const { token } = useAuth();
  const { confirm } = useConfirm();
  const { showToast } = useToast();
  const [textbooks, setTextbooks] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState(null);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const pollTimerRef = useRef(null);
  const fileInputRef = useRef(null);

  const fetchTextbooks = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setIsLoading(true);
    try {
      const response = await axios.get(`${API_BASE_URL}/api/teacher/textbooks`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setTextbooks(response.data || []);
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.error || '获取教材列表失败');
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchTextbooks();
  }, [fetchTextbooks]);

  useEffect(() => {
    const hasProcessing = textbooks.some((textbook) => textbook.status === 'processing');
    if (hasProcessing) {
      if (pollTimerRef.current) window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = window.setInterval(() => fetchTextbooks({ silent: true }), POLL_INTERVAL_MS);
    } else if (pollTimerRef.current) {
      window.clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }

    return () => {
      if (pollTimerRef.current) {
        window.clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    };
  }, [fetchTextbooks, textbooks]);

  const handleFileChange = (event) => {
    const picked = event.target.files?.[0] || null;
    setFile(picked);
    if (picked && !name.trim()) {
      const baseName = picked.name.replace(/\.(pdf|pptx?|docx?)$/i, '').trim();
      if (baseName) setName(baseName);
    }
  };

  const handleUpload = async (event) => {
    event.preventDefault();
    if (!file || !name.trim()) return;

    setUploading(true);
    setError('');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('name', name.trim());

    try {
      await axios.post(`${API_BASE_URL}/api/teacher/textbooks`, formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data',
        },
      });
      setName('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      showToast('教材已上传，后台开始解析与向量化', 'success');
      fetchTextbooks();
    } catch (requestError) {
      setError(requestError.response?.data?.error || requestError.message || '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const handleCancel = async (textbook) => {
    const approved = await confirm({
      title: '取消教材解析？',
      description: `将停止《${textbook.name}》当前的 OCR 与入库任务，已生成的数据会由后续删除操作清理。`,
      confirmLabel: '取消解析',
      tone: 'danger',
    });
    if (!approved) return;

    try {
      await axios.post(`${API_BASE_URL}/api/teacher/textbooks/${textbook.id}/cancel`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      showToast('已发送取消指令', 'info');
      fetchTextbooks();
    } catch (requestError) {
      showToast(requestError.response?.data?.error || '取消失败', 'error');
    }
  };

  const handleDelete = async (textbook) => {
    const description = textbook.status === 'completed'
      ? `这会永久删除《${textbook.name}》的上传文件、教材切片、题目和向量库数据。`
      : `这会删除《${textbook.name}》的上传文件及可能残留的解析数据。`;
    const approved = await confirm({
      title: '删除教材？',
      description,
      confirmLabel: '永久删除',
      tone: 'danger',
    });
    if (!approved) return;

    try {
      await axios.delete(`${API_BASE_URL}/api/teacher/textbooks/${textbook.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      showToast('教材及关联数据已删除', 'success');
      fetchTextbooks();
    } catch (requestError) {
      showToast(requestError.response?.data?.error || '删除失败', 'error');
    }
  };

  return (
    <div className="textbook-manager">
      <section className="textbook-upload ui-card">
        <div className="textbook-section-heading">
          <div className="textbook-section-icon"><Upload size={18} aria-hidden="true" /></div>
          <div>
            <h2>上传新教材</h2>
            <p>支持 PDF、PPT 和 Word。上传后将自动完成 OCR、内容修复、题目提取与向量化。</p>
          </div>
        </div>

        <form className="textbook-upload__form" onSubmit={handleUpload}>
          <label>
            <span>教材名称</span>
            <input
              className="ui-field"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="例如：线性代数第二版"
              required
            />
          </label>
          <label>
            <span>教材文件</span>
            <input
              ref={fileInputRef}
              className="textbook-file-field"
              type="file"
              accept=".pdf,.ppt,.pptx,.doc,.docx"
              onChange={handleFileChange}
              required
            />
          </label>
          <div className="textbook-upload__footer">
            <p>大体积教材可能需要较长时间，离开页面不会中断后台任务。</p>
            <Button
              type="submit"
              variant="primary"
              icon={Upload}
              loading={uploading}
              disabled={!file || !name.trim()}
            >
              {uploading ? '正在上传' : '上传并解析'}
            </Button>
          </div>
        </form>
      </section>

      <section className="textbook-tasks">
        <div className="textbook-tasks__header">
          <div>
            <h2>解析任务</h2>
            <p>{textbooks.length > 0 ? `共 ${textbooks.length} 本教材` : '上传后的处理进度会显示在这里'}</p>
          </div>
          <Button icon={RefreshCw} size="sm" onClick={() => fetchTextbooks()}>刷新</Button>
        </div>

        {error && <InlineAlert>{error}</InlineAlert>}
        {isLoading ? (
          <LoadingState label="正在加载教材任务..." />
        ) : textbooks.length === 0 ? (
          <EmptyState
            icon={BookOpen}
            title="还没有教材"
            description="上传第一本教材后，系统会在这里持续更新 OCR 和入库进度。"
          />
        ) : (
          <div className="textbook-task-list">
            {textbooks.map((textbook) => {
              const meta = statusMeta[textbook.status] || statusMeta.canceled;
              const StatusIcon = meta.icon;
              const totalPages = Number(textbook.total_pages) || 0;
              const processedPages = Number(textbook.processed_pages) || 0;
              const progress = totalPages > 0
                ? Math.min(100, Math.max(0, Math.floor((processedPages / totalPages) * 100)))
                : null;

              return (
                <article className="textbook-task ui-card" key={textbook.id}>
                  <div className="textbook-task__file">
                    <div className="textbook-task__file-icon"><FileText size={18} aria-hidden="true" /></div>
                    <div>
                      <h3>{textbook.name}</h3>
                      <p>{new Date(textbook.created_at).toLocaleString('zh-CN', { hour12: false })}</p>
                    </div>
                  </div>

                  <div className="textbook-task__status">
                    <span className={`textbook-status textbook-status--${meta.tone}`}>
                      <StatusIcon size={14} aria-hidden="true" />
                      {meta.label}
                      {textbook.status === 'processing' && progress != null ? ` ${progress}%` : ''}
                    </span>
                    {textbook.status === 'processing' && (
                      <div className="textbook-progress">
                        <div
                          className={progress == null ? 'is-indeterminate' : ''}
                          style={progress == null ? undefined : { width: `${progress}%` }}
                        />
                      </div>
                    )}
                    {textbook.status === 'processing' && (
                      <p>{totalPages > 0 ? `${processedPages} / ${totalPages} 页` : '正在读取教材页数'}</p>
                    )}
                  </div>

                  <div className="textbook-task__actions">
                    {textbook.status === 'processing' && (
                      <Button size="sm" icon={XCircle} onClick={() => handleCancel(textbook)}>取消</Button>
                    )}
                    <IconButton
                      icon={Trash2}
                      label={`删除教材 ${textbook.name}`}
                      disabled={textbook.status === 'processing'}
                      onClick={() => handleDelete(textbook)}
                    />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};

export default TextbookManager;
