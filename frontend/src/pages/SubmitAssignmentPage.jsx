import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, CheckCircle2, Download, FileText, Upload } from 'lucide-react';
import AiResponse from '../components/AiResponse';
import Button from '../components/ui/Button';
import PageHeader from '../components/ui/PageHeader';
import { InlineAlert, LoadingState } from '../components/ui/FeedbackState';
import './SubmitAssignmentPage.css';

const SubmitAssignmentPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const [assignment, setAssignment] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [loadingAssignment, setLoadingAssignment] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchAssignment = async () => {
      setLoadingAssignment(true);
      try {
        const response = await axios.get(`/api/student/assignments/${id}`);
        setAssignment(response.data);
      } catch (requestError) {
        setError(requestError.response?.data?.error || '无法加载作业详情');
      } finally {
        setLoadingAssignment(false);
      }
    };
    fetchAssignment();
  }, [id]);

  const handleFileChange = (event) => {
    setError('');
    const nextFile = event.target.files?.[0] || null;
    if (nextFile && (nextFile.type === 'application/pdf' || nextFile.name.toLowerCase().endsWith('.pdf'))) {
      setSelectedFile(nextFile);
      return;
    }
    setSelectedFile(null);
    setError('请上传 PDF 格式的文件');
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!selectedFile) return;
    setIsSubmitting(true);
    setError('');
    const formData = new FormData();
    formData.append('assignmentId', id);
    formData.append('solutionFile', selectedFile);

    try {
      await axios.post('/api/student/assignments/submit', formData);
      setIsSubmitted(true);
    } catch (requestError) {
      setError(requestError.response?.data?.error || '提交失败，请稍后重试');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenAttachment = async () => {
    if (!assignment?.problemFileUrl) return;
    setError('');
    try {
      const response = await axios.get(assignment.problemFileUrl, { responseType: 'blob' });
      const objectUrl = URL.createObjectURL(response.data);
      window.open(objectUrl, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60000);
    } catch (requestError) {
      setError(requestError.response?.data?.error || '无法打开题目附件');
    }
  };

  return (
    <div className="page-surface submit-assignment-page">
      <div className="page-container page-container--narrow">
        <PageHeader
          eyebrow="课程作业"
          title={assignment?.title || '作业详情'}
          description="阅读题目要求并上传 PDF 格式的解答文件。"
          actions={<Button icon={ArrowLeft} onClick={() => navigate('/assignments')}>作业列表</Button>}
        />

        {error && <div className="submit-assignment__alert"><InlineAlert>{error}</InlineAlert></div>}
        {loadingAssignment ? (
          <LoadingState label="正在加载作业详情..." />
        ) : (
          <div className="submit-assignment__stack">
            <section className="submit-assignment__problem ui-card">
              <h2>题目要求</h2>
              <div><AiResponse content={assignment?.problemText || '暂无手写题目内容'} /></div>
              {assignment?.exercises?.length > 0 && (
                <div className="submit-assignment__exercise-list">
                  {assignment.exercises.map((exercise, index) => (
                    <article key={exercise.id}>
                      <div>
                        <strong>{exercise.exercise_number || `题库题目 ${index + 1}`}</strong>
                        <span>{exercise.textbook_name}{exercise.page_num ? ` · 第 ${exercise.page_num} 页` : ''}</span>
                      </div>
                      <AiResponse content={exercise.stem || ''} />
                    </article>
                  ))}
                </div>
              )}
              {assignment?.problemFileUrl && (
                <div className="submit-assignment__attachment">
                  <FileText size={17} aria-hidden="true" />
                  <span>{assignment.problemFileName || '题目附件'}</span>
                  <Button
                    size="sm"
                    icon={Download}
                    onClick={handleOpenAttachment}
                  >
                    打开附件
                  </Button>
                </div>
              )}
            </section>

            <section className="submit-assignment__upload ui-card">
              {isSubmitted ? (
                <div className="submit-assignment__success">
                  <CheckCircle2 size={30} aria-hidden="true" />
                  <h2>提交成功</h2>
                  <p>“{selectedFile?.name}” 已提交，等待教师批阅。</p>
                  <Button onClick={() => navigate('/assignments')}>返回作业列表</Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit}>
                  <div className="submit-assignment__upload-heading">
                    <div>
                      <h2>提交解答</h2>
                      <p>仅支持 PDF，提交前请确认文件内容和姓名信息。</p>
                    </div>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,application/pdf"
                    hidden
                    onChange={handleFileChange}
                  />
                  <button
                    type="button"
                    className="submit-assignment__dropzone"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {selectedFile ? <FileText size={24} aria-hidden="true" /> : <Upload size={24} aria-hidden="true" />}
                    <strong>{selectedFile ? selectedFile.name : '选择 PDF 解答文件'}</strong>
                    <span>{selectedFile ? '点击可重新选择' : '从设备中选择需要提交的文件'}</span>
                  </button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="lg"
                    loading={isSubmitting}
                    disabled={!selectedFile}
                  >
                    确认提交
                  </Button>
                </form>
              )}
            </section>
          </div>
        )}
      </div>
    </div>
  );
};

export default SubmitAssignmentPage;
