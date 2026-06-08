import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Bot,
  ClipboardCheck,
  FilePlus2,
  GraduationCap,
  Library,
  ListChecks,
  Users,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import PageHeader from '../components/ui/PageHeader';
import { LoadingState } from '../components/ui/FeedbackState';
import './WorkspacePage.css';

const studentModules = [
  { title: 'AI 助教', icon: Bot, path: '/chat', description: '围绕教材内容提问，获得带引用的分步讲解。', action: '开始对话' },
  { title: '课程作业', icon: ListChecks, path: '/assignments', description: '查看教师发布的任务并提交 PDF 作业。', action: '查看作业' },
  { title: '自主批改', icon: ClipboardCheck, path: '/grading', description: '上传题目与解答，获得结构化批改反馈。', action: '开始批改' },
  { title: '题库', icon: Library, path: '/question-bank', description: '搜索教材例题与练习，按题型和知识点筛选。', action: '浏览题库' },
  { title: '我的班级', icon: GraduationCap, path: '/student/class', description: '查看班级信息、教学周和课程进度。', action: '查看班级' },
];

const teacherModules = [
  { title: '班级管理', icon: Users, path: '/teacher/classes', description: '管理邀请码、教学周、课件和学生学习数据。', action: '管理班级' },
  { title: '发布作业', icon: FilePlus2, path: '/assignments/new', description: '创建作业内容、附件并发布给学生。', action: '新建作业' },
  { title: '提交管理', icon: ListChecks, path: '/assignments', description: '查看学生提交情况并集中填写评语。', action: '查看提交' },
  { title: 'AI 助教', icon: Bot, path: '/chat', description: '检索教材内容，快速准备讲解与答疑。', action: '开始对话' },
  { title: '教材管理', icon: BookOpen, path: '/textbooks', description: '上传教材并跟踪 OCR、题目抽取和向量化进度。', action: '管理教材' },
  { title: '题库', icon: Library, path: '/question-bank', description: '检查教材题目、公式渲染与答案覆盖情况。', action: '浏览题库' },
];

const WorkspacePage = () => {
  const navigate = useNavigate();
  const { user, userRole, isAuthLoading } = useAuth();
  const modules = userRole === 'teacher' ? teacherModules : studentModules;
  const name = user?.displayName || user?.name || user?.username || '用户';

  if (isAuthLoading || !userRole) {
    return <LoadingState label="正在加载工作区..." />;
  }

  return (
    <div className="page-surface workspace-page">
      <div className="page-container">
        <PageHeader
          eyebrow={userRole === 'teacher' ? '教师工作台' : '学生工作台'}
          title={`${name}，你好`}
          description={userRole === 'teacher'
            ? '集中管理教学内容、班级与学生提交，AI 助教随时提供课程支持。'
            : '继续今天的线性代数学习，问答、作业、批改和题库都在这里。'}
        />

        <section className="workspace-summary" aria-label="工作台摘要">
          <div>
            <span>角色</span>
            <strong>{userRole === 'teacher' ? '教师' : '学生'}</strong>
          </div>
          <div>
            <span>可用模块</span>
            <strong>{modules.length}</strong>
          </div>
          <div>
            <span>知识范围</span>
            <strong>线性代数</strong>
          </div>
        </section>

        <section className="workspace-section">
          <div className="workspace-section__header">
            <h2>常用功能</h2>
            <p>选择一个模块继续工作</p>
          </div>
          <div className="workspace-module-list">
            {modules.map(({ title, icon: Icon, path, description, action }) => (
              <button key={title} type="button" className="workspace-module" onClick={() => navigate(path)}>
                <span className="workspace-module__icon">
                  {React.createElement(Icon, { size: 19, 'aria-hidden': true })}
                </span>
                <span className="workspace-module__body">
                  <strong>{title}</strong>
                  <span>{description}</span>
                </span>
                <span className="workspace-module__action">
                  {action}<ArrowRight size={15} aria-hidden="true" />
                </span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default WorkspacePage;
