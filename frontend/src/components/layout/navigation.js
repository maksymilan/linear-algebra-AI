import {
  BookOpen,
  Bot,
  ClipboardCheck,
  FilePlus2,
  GraduationCap,
  LayoutDashboard,
  Library,
  ListChecks,
  Search,
  Users,
} from 'lucide-react';

export const studentNavigation = [
  { label: '概览', path: '/workspace', icon: LayoutDashboard },
  { label: 'AI 助教', path: '/chat', icon: Bot },
  { label: '课程作业', path: '/assignments', icon: ListChecks },
  { label: '自主批改', path: '/grading', icon: ClipboardCheck },
  { label: '题库', path: '/question-bank', icon: Search },
  { label: '我的班级', path: '/student/class', icon: GraduationCap },
];

export const teacherNavigation = [
  { label: '概览', path: '/workspace', icon: LayoutDashboard },
  { label: '班级管理', path: '/teacher/classes', icon: Users },
  { label: '发布作业', path: '/assignments/new', icon: FilePlus2 },
  { label: '提交管理', path: '/assignments', icon: ListChecks },
  { label: 'AI 助教', path: '/chat', icon: Bot },
  { label: '教材管理', path: '/textbooks', icon: BookOpen },
  { label: '题库', path: '/question-bank', icon: Library },
];

export const getNavigation = (role) => role === 'teacher' ? teacherNavigation : studentNavigation;

export const isNavigationActive = (pathname, path) => {
  if (path === '/workspace') return pathname === path;
  if (path === '/assignments') return pathname === path || /^\/assignments\/\d+/.test(pathname);
  return pathname === path || pathname.startsWith(`${path}/`);
};
