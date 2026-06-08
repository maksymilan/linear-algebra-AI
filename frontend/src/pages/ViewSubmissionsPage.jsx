import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, FileText, Inbox, Save } from 'lucide-react';
import AiResponse from '../components/AiResponse';
import Button from '../components/ui/Button';
import PageHeader from '../components/ui/PageHeader';
import { EmptyState, InlineAlert, LoadingState } from '../components/ui/FeedbackState';
import { useToast } from '../contexts/ToastContext';
import './ViewSubmissionsPage.css';

const SubmissionCard = ({ submission, onSaveComment }) => {
  const { showToast } = useToast();
  const [comment, setComment] = useState(submission.comment || '');
  const [isSaving, setIsSaving] = useState(false);
  const [fileLoading, setFileLoading] = useState(false);

  useEffect(() => {
    setComment(submission.comment || '');
  }, [submission.comment]);

  const viewFile = async () => {
    setFileLoading(true);
    try {
      const response = await axios.get(`/api/teacher/submission/file/${submission.id}`, {
        responseType: 'blob',
      });
      const fileUrl = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      window.open(fileUrl, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(fileUrl), 60_000);
    } catch {
      showToast('无法查看文件，请稍后重试', 'error');
    } finally {
      setFileLoading(false);
    }
  };

  const saveComment = async () => {
    setIsSaving(true);
    try {
      await onSaveComment(submission.id, comment);
      showToast(`已保存 ${submission.studentName} 的评语`, 'success');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <article className="submission-review ui-card">
      <div className="submission-review__meta">
        <div>
          <h3>{submission.studentName}</h3>
          <p>提交于 {new Date(submission.createdAt).toLocaleString('zh-CN', { hour12: false })}</p>
        </div>
        <span className={`submission-status submission-status--${submission.status}`}>
          {submission.status === 'graded' ? '已批改' : '待批改'}
        </span>
      </div>

      <Button icon={FileText} loading={fileLoading} onClick={viewFile}>
        {submission.solutionFileName || '查看解答文件'}
      </Button>

      <div className="submission-review__comment">
        <label htmlFor={`comment-${submission.id}`}>教师评语</label>
        <textarea
          id={`comment-${submission.id}`}
          className="ui-textarea"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="记录解题思路、错误位置和改进建议..."
          rows={4}
        />
        <Button
          variant="primary"
          icon={Save}
          loading={isSaving}
          disabled={comment === (submission.comment || '')}
          onClick={saveComment}
        >
          保存评语
        </Button>
      </div>
    </article>
  );
};

const ViewSubmissionsPage = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const [assignment, setAssignment] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchSubmissions = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await axios.get(`/api/teacher/assignments/${id}`);
      const nextAssignment = response.data || {};
      nextAssignment.submissions = [...(nextAssignment.submissions || [])].sort(
        (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
      );
      setAssignment(nextAssignment);
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.error || '加载提交列表失败');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchSubmissions();
  }, [fetchSubmissions]);

  const handleSaveComment = async (submissionId, comment) => {
    try {
      await axios.post(`/api/teacher/submission/${submissionId}/comment`, { comment });
      await fetchSubmissions();
    } catch (requestError) {
      showToast(requestError.response?.data?.error || '保存评语失败', 'error');
      throw requestError;
    }
  };

  return (
    <div className="page-surface submissions-page">
      <div className="page-container">
        <PageHeader
          eyebrow="提交管理"
          title={assignment?.title || '学生提交'}
          description="查看学生解答文件并集中记录批阅意见。"
          actions={<Button icon={ArrowLeft} onClick={() => navigate('/assignments')}>作业列表</Button>}
        />

        {error && <div className="submissions-page__alert"><InlineAlert>{error}</InlineAlert></div>}
        {isLoading ? (
          <LoadingState label="正在加载学生提交..." />
        ) : (
          <>
            <section className="submissions-problem ui-card">
              <h2>原题要求</h2>
              <div><AiResponse content={assignment?.problemText || '暂无题目内容'} /></div>
            </section>

            <div className="submissions-heading">
              <h2>提交记录</h2>
              <span>{assignment?.submissions?.length || 0} 份</span>
            </div>

            {assignment?.submissions?.length > 0 ? (
              <div className="submissions-list">
                {assignment.submissions.map((submission) => (
                  <SubmissionCard
                    key={submission.id}
                    submission={submission}
                    onSaveComment={handleSaveComment}
                  />
                ))}
              </div>
            ) : (
              <EmptyState icon={Inbox} title="暂无学生提交" description="学生提交作业后会按时间倒序显示在这里。" />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default ViewSubmissionsPage;
