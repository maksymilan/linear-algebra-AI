import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { BookOpen, Paperclip, Send, X } from 'lucide-react';
import AiResponse from '../components/AiResponse';
import QuestionBankPicker from '../components/QuestionBankPicker';
import Button from '../components/ui/Button';
import IconButton from '../components/ui/IconButton';
import PageHeader from '../components/ui/PageHeader';
import Select from '../components/ui/Select';
import { InlineAlert } from '../components/ui/FeedbackState';
import { useToast } from '../contexts/ToastContext';
import autoWrapMath from '../utils/autoWrapMath';
import './CreateAssignmentPage.css';

const CreateAssignmentPage = () => {
  const [title, setTitle] = useState('');
  const [problemText, setProblemText] = useState('');
  const [problemFile, setProblemFile] = useState(null);
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [selectedQuestions, setSelectedQuestions] = useState([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);
  const navigate = useNavigate();
  const { showToast } = useToast();

  const selectedQuestionIds = selectedQuestions.map((question) => question.id);
  const classOptions = [
    { value: '', label: '选择班级' },
    ...classes.map((item) => ({ value: String(item.id), label: item.name })),
  ];

  const previewContent = useMemo(() => {
    const parts = [];
    if (problemText.trim()) parts.push(problemText.trim());
    selectedQuestions.forEach((question, index) => {
      const label = question.exercise_number || `题库题目 ${index + 1}`;
      parts.push(`### ${label}\n${autoWrapMath(question.stem || '')}`);
    });
    if (!parts.length) return '*输入题目、上传附件或从题库选择题目后将在这里预览。*';
    return parts.join('\n\n');
  }, [problemText, selectedQuestions]);

  const fetchClasses = useCallback(async () => {
    try {
      const response = await axios.get('/api/teacher/classes');
      const list = response.data?.classes || [];
      setClasses(list);
      if (list.length > 0) {
        setClassId((current) => current || String(list[0].id));
      }
    } catch (requestError) {
      setError(requestError.response?.data?.error || '获取班级列表失败');
    }
  }, []);

  useEffect(() => {
    fetchClasses();
  }, [fetchClasses]);

  const removeQuestion = (questionId) => {
    setSelectedQuestions((current) => current.filter((question) => question.id !== questionId));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!title.trim()) {
      setError('请输入作业标题');
      return;
    }
    if (!classId) {
      setError('请选择要发布的班级');
      return;
    }
    if (!problemText.trim() && !problemFile && selectedQuestions.length === 0) {
      setError('请至少提供题目文本、附件或题库题目');
      return;
    }

    setIsLoading(true);
    setError('');
    const formData = new FormData();
    formData.append('title', title.trim());
    formData.append('problemText', problemText);
    formData.append('classId', classId);
    formData.append('exerciseIds', JSON.stringify(selectedQuestionIds));
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
              <span>发布班级</span>
              <Select
                value={classId}
                options={classOptions}
                ariaLabel="发布班级"
                onChange={setClassId}
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

            <div className="assignment-field">
              <span>从题库选择题目</span>
              <Button type="button" icon={BookOpen} onClick={() => setPickerOpen(true)}>
                {selectedQuestions.length > 0 ? `题库选题（已选 ${selectedQuestions.length} 题）` : '打开题库选题'}
              </Button>
              {selectedQuestions.length > 0 && (
                <div className="assignment-selected-questions">
                  {selectedQuestions.map((question) => (
                    <div key={question.id}>
                      <span>{question.exercise_number || `题目 #${question.id}`}</span>
                      <small>{question.textbook_name}</small>
                      <IconButton
                        icon={X}
                        label="移除题目"
                        size="sm"
                        onClick={() => removeQuestion(question.id)}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>

          <section className="assignment-create__preview ui-card">
            <div className="assignment-create__preview-heading">
              <h2>实时预览</h2>
              <span>学生端展示效果</span>
            </div>
            <div className="assignment-create__preview-content">
              <AiResponse content={previewContent} />
            </div>
          </section>
        </div>
      </form>

      {pickerOpen && (
        <QuestionBankPicker
          initialSelected={selectedQuestions}
          onClose={() => setPickerOpen(false)}
          onConfirm={(list) => { setSelectedQuestions(list); setPickerOpen(false); }}
        />
      )}
    </div>
  );
};

export default CreateAssignmentPage;
