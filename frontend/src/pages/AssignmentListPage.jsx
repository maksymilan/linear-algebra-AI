import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { ArrowRight, CalendarDays, ClipboardList, Plus } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import Button from '../components/ui/Button';
import PageHeader from '../components/ui/PageHeader';
import { EmptyState, InlineAlert, LoadingState } from '../components/ui/FeedbackState';
import './ListPage.css';

const AssignmentListPage = () => {
  const [assignments, setAssignments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { userRole } = useAuth();

  useEffect(() => {
    const fetchAssignments = async () => {
      if (!userRole) return;
      const apiUrl = userRole === 'teacher' ? '/api/teacher/assignments' : '/api/student/assignments';
      setIsLoading(true);
      try {
        const response = await axios.get(apiUrl);
        setAssignments(Array.isArray(response.data) ? response.data : []);
        setError('');
      } catch (requestError) {
        setAssignments([]);
        setError(requestError.response?.data?.error || '获取作业列表失败');
      } finally {
        setIsLoading(false);
      }
    };
    fetchAssignments();
  }, [userRole]);

  const openAssignment = (id) => {
    navigate(userRole === 'teacher' ? `/assignments/${id}/submissions` : `/assignments/${id}`);
  };

  return (
    <div className="page-surface assignment-list-page">
      <div className="page-container">
        <PageHeader
          eyebrow={userRole === 'teacher' ? '教学任务' : '课程进度'}
          title={userRole === 'teacher' ? '提交管理' : '课程作业'}
          description={userRole === 'teacher' ? '查看作业发布情况并集中批阅学生提交。' : '查看老师发布的任务并按时提交作业。'}
          actions={userRole === 'teacher' ? (
            <Button variant="primary" icon={Plus} onClick={() => navigate('/assignments/new')}>发布作业</Button>
          ) : null}
        />

        {error && <InlineAlert>{error}</InlineAlert>}
        {isLoading ? (
          <LoadingState label="正在加载作业..." />
        ) : assignments.length === 0 ? (
          <EmptyState
            icon={ClipboardList}
            title="当前没有作业"
            description={userRole === 'teacher' ? '发布第一份作业后，学生提交会汇总在这里。' : '老师发布新任务后会显示在这里。'}
            action={userRole === 'teacher' ? (
              <Button variant="primary" icon={Plus} onClick={() => navigate('/assignments/new')}>发布作业</Button>
            ) : null}
          />
        ) : (
          <div className="assignment-list">
            {assignments.map((assignment) => (
              <button
                type="button"
                key={assignment.id}
                className="assignment-row ui-card"
                onClick={() => openAssignment(assignment.id)}
              >
                <span className="assignment-row__icon"><ClipboardList size={18} aria-hidden="true" /></span>
                <span className="assignment-row__copy">
                  <strong>{assignment.title}</strong>
                  <span>
                    <CalendarDays size={13} aria-hidden="true" />
                    发布于 {new Date(assignment.createdAt).toLocaleDateString('zh-CN')}
                  </span>
                </span>
                <span className="assignment-row__action">
                  {userRole === 'teacher' ? '查看提交' : '查看详情'}
                  <ArrowRight size={15} aria-hidden="true" />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AssignmentListPage;
