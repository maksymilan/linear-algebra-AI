import React, { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Paperclip, Send, X } from 'lucide-react';
import AiResponse from '../components/AiResponse';
import Button from '../components/ui/Button';
import IconButton from '../components/ui/IconButton';
import PageHeader from '../components/ui/PageHeader';
import { InlineAlert } from '../components/ui/FeedbackState';
import { useToast } from '../contexts/ToastContext';
import './CreateAssignmentPage.css';

const CreateAssignmentPage = () => {
  const [title, setTitle] = useState('');
  const [problemText, setProblemText] = useState('');
  const [problemFile, setProblemFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!title.trim()) {
      setError('请输入作业标题');
      return;
    }

    setIsLoading(true);
    setError('');
    const formData = new FormData();
    formData.append('title', title.trim());
    formData.append('problemText', problemText);
    if (problemFile) formData.append('problemFile', problemFile);

    try {
      await axios.post('/api/teacher/assignments', formData);
      showToast('作业已发布', 'success');
      navigate('/assignments');
    } catch (requestError) {
      setError(requestError.response?.data?.error || '发布失败，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="page-surface assignment-create-page">
      <form className="page-container" onSubmit={handleSubmit}>
        <PageHeader
          eyebrow="教学任务"
          title="发布作业"
          description="编辑题目要求并实时检查 Markdown 与 LaTeX 的展示效果。"
          actions={(
            <Button type="submit" variant="primary" icon={Send} loading={isLoading}>
              确认发布
            </Button>
          )}
        />

        {error && <div className="assignment-create__alert"><InlineAlert>{error}</InlineAlert></div>}

        <div className="assignment-create__grid">
          <section className="assignment-create__editor ui-card">
            <label className="assignment-field">
              <span>作业标题</span>
              <input
                className="ui-field"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="例如：第一章 线性方程组"
              />
            </label>

            <label className="assignment-field">
              <span>题目详情</span>
              <textarea
                className="ui-textarea assignment-create__textarea"
                value={problemText}
                onChange={(event) => setProblemText(event.target.value)}
                placeholder="输入题目、要求和提示，支持 Markdown 与 LaTeX..."
              />
            </label>

            <div className="assignment-field">
              <span>附件</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                hidden
                onChange={(event) => setProblemFile(event.target.files?.[0] || null)}
              />
              <div className="assignment-file-row">
                <Button icon={Paperclip} onClick={() => fileInputRef.current?.click()}>
                  {problemFile ? '更换附件' : '选择附件'}
                </Button>
                {problemFile && (
                  <div className="assignment-file-chip">
                    <span>{problemFile.name}</span>
                    <IconButton icon={X} label="移除附件" size="sm" onClick={() => {
                      setProblemFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }} />
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="assignment-create__preview ui-card">
            <div className="assignment-create__preview-heading">
              <h2>实时预览</h2>
              <span>学生端展示效果</span>
            </div>
            <div className="assignment-create__preview-content">
              <AiResponse content={problemText || '*输入题目内容后将在这里预览。*'} />
            </div>
          </section>
        </div>
      </form>
    </div>
  );
};

export default CreateAssignmentPage;
