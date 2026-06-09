import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion as _motion } from 'framer-motion';
import { MessageSquare, Sparkles } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import AiResponse from '../components/AiResponse';
import GradingWorkflow from '../components/GradingWorkflow';
import Button from '../components/ui/Button';
import PageHeader from '../components/ui/PageHeader';
import Select from '../components/ui/Select';
import { InlineAlert } from '../components/ui/FeedbackState';
import autoWrapMath from '../utils/autoWrapMath';
import './GradingPage.css';

const GradingPage = () => {
  const [problemText, setProblemText] = useState('');
  const [solutionText, setSolutionText] = useState('');
  const [problemFiles, setProblemFiles] = useState([]);
  const [solutionFiles, setSolutionFiles] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [ocrLoading, setOcrLoading] = useState({ problem: null, solution: null });
  const [error, setError] = useState('');
  const [gradeResult, setGradeResult] = useState(null);
  const [followUpQuestion, setFollowUpQuestion] = useState('');
  const [assignments, setAssignments] = useState([]);
  const [selectedAssignmentId, setSelectedAssignmentId] = useState('');
  const [loadingAssignments, setLoadingAssignments] = useState(false);
  const [useVisionOcr, setUseVisionOcr] = useState(false);
  const { token, userRole } = useAuth();
  const navigate = useNavigate();
  const selectedAssignment = useMemo(
    () => assignments.find((item) => String(item.id) === selectedAssignmentId),
    [assignments, selectedAssignmentId]
  );
  const assignmentOptions = [
    { value: '', label: '自定义题目' },
    ...assignments.map((item) => ({ value: String(item.id), label: item.title })),
  ];

  useEffect(() => {
    if (userRole !== 'student') return;
    const loadAssignments = async () => {
      setLoadingAssignments(true);
      try {
        const response = await axios.get('/api/student/assignments');
        setAssignments(Array.isArray(response.data) ? response.data : []);
      } catch (requestError) {
        setError(requestError.response?.data?.error || '获取课程作业失败');
      } finally {
        setLoadingAssignments(false);
      }
    };
    loadAssignments();
  }, [userRole]);

  useEffect(() => {
    setGradeResult(null);
    setProblemFiles([]);
    if (!selectedAssignment) {
      setProblemText('');
      return;
    }
    const parts = [];
    if (selectedAssignment.problemText?.trim()) {
      parts.push(selectedAssignment.problemText.trim());
    }
    (selectedAssignment.exercises || []).forEach((exercise, index) => {
      parts.push(`### ${exercise.exercise_number || `题目 ${index + 1}`}\n${autoWrapMath(exercise.stem || '')}`);
    });
    if (selectedAssignment.problemFileName) {
      parts.push(`### 教师题目附件\n${selectedAssignment.problemFileName}\n\n批改时将由服务端读取该附件内容。`);
    }
    setProblemText(parts.join('\n\n'));
  }, [selectedAssignment]);

  const handleFileOcr = async (file, type) => {
    if (!file) return;
    const fileId = `${type}-${file.name}-${Date.now()}`;
    const nextFile = { id: fileId, name: file.name, isLoading: true };
    const setFiles = type === 'problem' ? setProblemFiles : setSolutionFiles;
    const setText = type === 'problem' ? setProblemText : setSolutionText;

    setFiles((current) => [...current, nextFile]);
    setOcrLoading((current) => ({ ...current, [type]: fileId }));
    setError('');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('use_vision', useVisionOcr ? 'true' : 'false');

    try {
      const response = await axios.post('/api/grading/ocr', formData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const nextText = response.data.text || '';
      setText((current) => current ? `${current}\n\n--- ${file.name} ---\n${nextText}` : nextText);
      setFiles((current) => current.map((item) => item.id === fileId ? { ...item, isLoading: false } : item));
    } catch (requestError) {
      setError(requestError.response?.data?.error || `${type === 'problem' ? '题目' : '解答'}文件识别失败`);
      setFiles((current) => current.map((item) => item.id === fileId ? { ...item, isLoading: false, error: true } : item));
    } finally {
      setOcrLoading((current) => ({ ...current, [type]: null }));
    }
  };

  const handleGrade = async () => {
    if ((!selectedAssignmentId && !problemText.trim()) || !solutionText.trim()) {
      setError(selectedAssignmentId ? '请提供解答内容' : '请完整提供题目和解答内容');
      return;
    }

    setIsLoading(true);
    setError('');
    setGradeResult(null);
    const formData = new FormData();
    formData.append('problemText', problemText);
    formData.append('solutionText', solutionText);
    if (selectedAssignmentId) formData.append('assignmentId', selectedAssignmentId);

    try {
      const response = await axios.post('/api/grading/upload', formData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setGradeResult(response.data);
    } catch (requestError) {
      setError(requestError.response?.data?.error || '批改失败');
    } finally {
      setIsLoading(false);
    }
  };

  const startFollowUpChat = async (event) => {
    event.preventDefault();
    if (!gradeResult || !followUpQuestion.trim()) {
      setError('请输入问题后再开始答疑');
      return;
    }

    setIsLoading(true);
    setError('');
    const formData = new FormData();
    formData.append('problemText', gradeResult.problemText);
    formData.append('solutionText', gradeResult.solutionText);
    formData.append('correctionText', gradeResult.correction);
    formData.append('newQuestion', followUpQuestion);

    try {
      const response = await axios.post('/api/grading/followup', formData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.data?.chatSessionId) throw new Error('未返回答疑会话');
      navigate(`/chat/${response.data.chatSessionId}`);
    } catch (requestError) {
      setError(requestError.response?.data?.error || '开启答疑会话失败，请稍后重试');
    } finally {
      setIsLoading(false);
    }
  };

  const removeFile = (fileId, type) => {
    const setFiles = type === 'problem' ? setProblemFiles : setSolutionFiles;
    setFiles((current) => current.filter((file) => file.id !== fileId));
  };

  return (
    <div className="page-surface grading-page">
      <div className="page-container">
        <PageHeader
          eyebrow="学习工具"
          title="自主批改"
          description="可直接选择老师发布的作业，只提交自己的解答，也可以使用自定义题目。"
        />

        {error && <div className="grading-page__alert"><InlineAlert>{error}</InlineAlert></div>}

        <section className="grading-editor ui-card">
          {userRole === 'student' && (
            <div className="grading-assignment-source">
              <div>
                <strong>题目来源</strong>
                <span>选择已有作业后，题目以老师发布的内容为准。</span>
              </div>
              <Select
                value={selectedAssignmentId}
                options={assignmentOptions}
                ariaLabel="题目来源"
                placeholder={loadingAssignments ? '正在加载作业' : '选择题目来源'}
                onChange={setSelectedAssignmentId}
              />
            </div>
          )}
          <label className="grading-ocr-mode">
            <input
              type="checkbox"
              checked={useVisionOcr}
              onChange={(event) => setUseVisionOcr(event.target.checked)}
            />
            <span>
              <strong>用 AI 识别 PDF（扫描件 / 手写 / 图片型 PDF）</strong>
              <small>普通电子版 PDF 不勾更快（直接读取文字层）；扫描件或拍照转的 PDF 没有文字层，请勾选让模型逐页识别。图片始终走 AI 识别。</small>
            </span>
          </label>
          <GradingWorkflow {...{
            problemText,
            setProblemText,
            solutionText,
            setSolutionText,
            handleFileOcr,
            problemFiles,
            solutionFiles,
            ocrLoading,
            removeFile,
            problemLocked: Boolean(selectedAssignmentId),
          }} />

          <AnimatePresence>
            {!gradeResult && (
              <_motion.div className="grading-submit" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Button
                  variant="primary"
                  size="lg"
                  icon={Sparkles}
                  loading={isLoading}
                  disabled={Boolean(ocrLoading.problem || ocrLoading.solution)}
                  onClick={handleGrade}
                >
                  开始 AI 批改
                </Button>
              </_motion.div>
            )}
          </AnimatePresence>
        </section>

        <AnimatePresence>
          {gradeResult && (
            <_motion.section
              className="grading-result ui-card"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="grading-result__heading">
                <h2>批改结果</h2>
                <span>AI 生成内容，请结合课程要求判断</span>
              </div>
              <div className="grading-result__content">
                <AiResponse content={gradeResult.correction} />
              </div>
              <form className="grading-followup" onSubmit={startFollowUpChat}>
                <label htmlFor="grading-followup">继续追问</label>
                <textarea
                  id="grading-followup"
                  className="ui-textarea"
                  value={followUpQuestion}
                  onChange={(event) => setFollowUpQuestion(event.target.value)}
                  placeholder="例如：为什么这里不能直接使用初等行变换？"
                  disabled={isLoading}
                />
                <Button
                  type="submit"
                  icon={MessageSquare}
                  loading={isLoading}
                  disabled={!followUpQuestion.trim()}
                >
                  开始答疑对话
                </Button>
              </form>
            </_motion.section>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default GradingPage;
