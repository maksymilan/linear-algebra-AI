import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../hooks/useAuth';
import {
    ArrowLeft, Users, Clock, BookOpen, MessageSquare, FileCheck, CheckCircle2,
    Plus, Copy, Check, RefreshCw, X, Upload, FileText, Loader2
} from 'lucide-react';

const API_BASE_URL = 'http://localhost:8080';

const formatDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleString('zh-CN', { hour12: false });
};

const ClassManagementPage = () => {
    const { token } = useAuth();
    const navigate = useNavigate();

    const [classes, setClasses] = useState([]);
    const [loadingList, setLoadingList] = useState(false);
    const [selectedClassId, setSelectedClassId] = useState(null);
    const [detail, setDetail] = useState(null);
    const [loadingDetail, setLoadingDetail] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [newClassName, setNewClassName] = useState('');
    const [creating, setCreating] = useState(false);
    const [copiedCode, setCopiedCode] = useState(null);
    const [err, setErr] = useState('');

    // 教学进度 / PPT 上传
    const [weekDraft, setWeekDraft] = useState(1);
    const [savingWeek, setSavingWeek] = useState(false);
    const [uploadWeek, setUploadWeek] = useState(1);
    const [uploadingPpt, setUploadingPpt] = useState(false);
    const [uploadResult, setUploadResult] = useState(null); // { summary }
    const fileInputRef = useRef(null);

    const authHeader = { headers: { Authorization: `Bearer ${token}` } };

    const fetchClasses = useCallback(async () => {
        setLoadingList(true);
        setErr('');
        try {
            const resp = await axios.get(`${API_BASE_URL}/api/teacher/classes`, authHeader);
            const list = resp.data?.classes || [];
            setClasses(list);
            if (list.length > 0 && !selectedClassId) {
                setSelectedClassId(list[0].id);
            }
        } catch (e) {
            setErr(e.response?.data?.error || '获取班级列表失败');
        } finally {
            setLoadingList(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    const fetchDetail = useCallback(async (classId) => {
        if (!classId) return;
        setLoadingDetail(true);
        try {
            const resp = await axios.get(`${API_BASE_URL}/api/teacher/classes/${classId}`, authHeader);
            setDetail(resp.data);
            const cw = resp.data?.class?.current_week ?? 1;
            setWeekDraft(cw);
            setUploadWeek(cw && cw > 0 ? cw : 1);
            setUploadResult(null);
        } catch (e) {
            setErr(e.response?.data?.error || '获取班级详情失败');
            setDetail(null);
        } finally {
            setLoadingDetail(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    useEffect(() => {
        fetchClasses();
    }, [fetchClasses]);

    useEffect(() => {
        if (selectedClassId) fetchDetail(selectedClassId);
    }, [selectedClassId, fetchDetail]);

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!newClassName.trim()) return;
        setCreating(true);
        setErr('');
        try {
            await axios.post(
                `${API_BASE_URL}/api/teacher/classes`,
                { name: newClassName.trim() },
                authHeader
            );
            setNewClassName('');
            setShowCreate(false);
            await fetchClasses();
        } catch (e) {
            setErr(e.response?.data?.error || '创建班级失败');
        } finally {
            setCreating(false);
        }
    };

    const copyInviteCode = async (code) => {
        try {
            await navigator.clipboard.writeText(code);
            setCopiedCode(code);
            setTimeout(() => setCopiedCode(null), 1500);
        } catch {
            // ignore
        }
    };

    const handleSaveWeek = async () => {
        if (!selectedClassId) return;
        const wk = parseInt(weekDraft, 10);
        if (!(wk >= 1 && wk <= 16)) {
            setErr('教学周需在 1 ~ 16 之间');
            return;
        }
        setSavingWeek(true);
        setErr('');
        try {
            await axios.patch(
                `${API_BASE_URL}/api/teacher/classes/${selectedClassId}/week`,
                { current_week: wk },
                authHeader
            );
            await Promise.all([fetchClasses(), fetchDetail(selectedClassId)]);
        } catch (e) {
            setErr(e.response?.data?.error || '更新教学周失败');
        } finally {
            setSavingWeek(false);
        }
    };

    const handleUploadPpt = async (file) => {
        if (!file || !selectedClassId) return;
        const wk = parseInt(uploadWeek, 10);
        if (!(wk >= 1 && wk <= 16)) {
            setErr('上传课件时教学周需在 1 ~ 16 之间');
            return;
        }
        setUploadingPpt(true);
        setErr('');
        setUploadResult(null);
        try {
            const fd = new FormData();
            fd.append('week_num', String(wk));
            fd.append('file', file);
            const resp = await axios.post(
                `${API_BASE_URL}/api/teacher/classes/${selectedClassId}/weekly_content`,
                fd,
                {
                    headers: {
                        Authorization: `Bearer ${token}`,
                        'Content-Type': 'multipart/form-data',
                    },
                }
            );
            setUploadResult({ summary: resp.data?.summary || '' });
            await Promise.all([fetchClasses(), fetchDetail(selectedClassId)]);
        } catch (e) {
            setErr(e.response?.data?.error || '上传课件失败');
        } finally {
            setUploadingPpt(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const selectedClassMeta = classes.find((c) => c.id === selectedClassId);

    return (
        <div className="min-h-screen bg-[#F1F3F5] p-6 md:p-10">
            <div className="max-w-[1280px] mx-auto">
                {/* 返回按钮 */}
                <button
                    onClick={() => navigate('/workspace')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#495057] bg-white border border-[#DEE2E6] rounded-md hover:border-[#212529] hover:text-[#212529] transition-colors mb-4"
                >
                    <ArrowLeft size={16} /> 返回工作区
                </button>

                <header className="flex items-end justify-between mb-6 flex-wrap gap-3">
                    <div>
                        <h1 className="text-2xl font-semibold text-[#212529] m-0">班级管理</h1>
                        <p className="text-sm text-[#868E96] mt-1 mb-0">
                            查看你管理的班级、邀请码，以及每位学生的学习情况。
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={fetchClasses}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#495057] bg-white border border-[#DEE2E6] rounded-md hover:border-[#212529] hover:text-[#212529] transition-colors"
                        >
                            <RefreshCw size={14} /> 刷新
                        </button>
                        <button
                            onClick={() => setShowCreate(true)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-white bg-[#212529] border border-[#212529] rounded-md hover:bg-black transition-colors"
                        >
                            <Plus size={14} /> 新建班级
                        </button>
                    </div>
                </header>

                {err && (
                    <div className="mb-4 text-sm text-[#dc3545] bg-[#FFF5F5] border border-[#FFE3E3] rounded-md px-3 py-2">
                        {err}
                    </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
                    {/* 左：班级列表 */}
                    <aside className="bg-white border border-[#DEE2E6] rounded-xl overflow-hidden h-fit">
                        <div className="px-4 py-3 border-b border-[#E9ECEF] text-sm font-medium text-[#495057]">
                            我的班级
                        </div>
                        {loadingList ? (
                            <div className="px-4 py-8 text-sm text-[#868E96] text-center">加载中...</div>
                        ) : classes.length === 0 ? (
                            <div className="px-4 py-8 text-sm text-[#868E96] text-center">
                                暂无班级，点击右上角“新建班级”开始。
                            </div>
                        ) : (
                            <ul className="divide-y divide-[#E9ECEF]">
                                {classes.map((c) => {
                                    const active = c.id === selectedClassId;
                                    return (
                                        <li key={c.id}>
                                            <button
                                                onClick={() => setSelectedClassId(c.id)}
                                                className={`w-full text-left px-4 py-3 flex items-center justify-between transition-colors ${
                                                    active
                                                        ? 'bg-[#212529] text-white'
                                                        : 'bg-white text-[#212529] hover:bg-[#F8F9FA]'
                                                }`}
                                            >
                                                <div className="min-w-0">
                                                    <div className="font-medium truncate">{c.name}</div>
                                                    <div className={`text-xs mt-0.5 ${active ? 'text-white/70' : 'text-[#868E96]'}`}>
                                                        {c.student_count} 位学生 · 第 {c.current_week} 周
                                                    </div>
                                                </div>
                                                <code className={`text-xs px-1.5 py-0.5 rounded font-mono ${active ? 'bg-white/15' : 'bg-[#F1F3F5] text-[#495057]'}`}>
                                                    {c.invite_code}
                                                </code>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </aside>

                    {/* 右：班级详情 */}
                    <section className="bg-white border border-[#DEE2E6] rounded-xl min-h-[400px]">
                        {!selectedClassMeta ? (
                            <div className="h-full flex items-center justify-center px-6 py-16 text-[#868E96] text-sm">
                                请在左侧选择一个班级查看详情。
                            </div>
                        ) : (
                            <>
                                {/* 班级信息顶部 */}
                                <div className="p-6 border-b border-[#E9ECEF]">
                                    <div className="flex items-start justify-between flex-wrap gap-3">
                                        <div>
                                            <h2 className="text-xl font-semibold text-[#212529] m-0">
                                                {selectedClassMeta.name}
                                            </h2>
                                            <p className="text-xs text-[#868E96] mt-1 mb-0">
                                                当前教学进度：第 {selectedClassMeta.current_week} 周 · 已上传课件 {selectedClassMeta.materials_count} 份
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => copyInviteCode(selectedClassMeta.invite_code)}
                                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#495057] bg-[#F8F9FA] border border-[#DEE2E6] rounded-md hover:border-[#212529] hover:text-[#212529] transition-colors"
                                            title="点击复制邀请码"
                                        >
                                            {copiedCode === selectedClassMeta.invite_code ? <Check size={14} /> : <Copy size={14} />}
                                            邀请码：<span className="font-mono font-semibold text-[#212529]">{selectedClassMeta.invite_code}</span>
                                        </button>
                                    </div>

                                    {/* 班级指标卡片 */}
                                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
                                        <StatCard
                                            icon={<Users size={16} />}
                                            label="学生数"
                                            value={detail?.class?.total_students ?? selectedClassMeta.student_count}
                                        />
                                        <StatCard
                                            icon={<Clock size={16} />}
                                            label="教学周"
                                            value={`第 ${detail?.class?.current_week ?? selectedClassMeta.current_week} 周`}
                                        />
                                        <StatCard
                                            icon={<BookOpen size={16} />}
                                            label="已发布作业"
                                            value={detail?.class?.total_assignments ?? 0}
                                        />
                                        <StatCard
                                            icon={<FileCheck size={16} />}
                                            label="累计提交"
                                            value={detail?.class?.total_submissions ?? 0}
                                        />
                                    </div>
                                </div>

                                {/* 教学进度 & PPT 上传 */}
                                <div className="px-6 pt-5 pb-4 border-b border-[#E9ECEF] bg-[#FAFBFC]">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* 调整教学周 */}
                                        <div className="border border-[#E9ECEF] bg-white rounded-lg p-4">
                                            <div className="flex items-center gap-1.5 text-sm font-medium text-[#212529] mb-1">
                                                <Clock size={14} /> 调整教学进度
                                            </div>
                                            <p className="text-xs text-[#868E96] m-0 mb-3">
                                                学生端 AI 助教会依据该教学周限制教材检索范围，避免剧透未学内容。
                                            </p>
                                            <div className="flex items-center gap-2">
                                                <label className="text-xs text-[#495057]">当前周</label>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={16}
                                                    value={weekDraft}
                                                    onChange={(e) => setWeekDraft(e.target.value)}
                                                    className="w-20 h-9 px-2 border border-[#DEE2E6] rounded-md text-sm focus:border-[#212529] focus:ring-1 focus:ring-[#212529] outline-none"
                                                />
                                                <button
                                                    onClick={handleSaveWeek}
                                                    disabled={savingWeek}
                                                    className="h-9 px-3 text-sm text-white bg-[#212529] border border-[#212529] rounded-md hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5"
                                                >
                                                    {savingWeek ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                                                    保存
                                                </button>
                                                <span className="text-xs text-[#868E96]">
                                                    （当前：第 {detail?.class?.current_week ?? 0} 周）
                                                </span>
                                            </div>
                                        </div>

                                        {/* 上传本周 PPT */}
                                        <div className="border border-[#E9ECEF] bg-white rounded-lg p-4">
                                            <div className="flex items-center gap-1.5 text-sm font-medium text-[#212529] mb-1">
                                                <Upload size={14} /> 上传本周课件
                                            </div>
                                            <p className="text-xs text-[#868E96] m-0 mb-3">
                                                支持 PDF / PPT 文本，AI 会自动总结成"本周已学知识点"，注入到学生 AI 助教的回答上下文。
                                            </p>
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <label className="text-xs text-[#495057]">所属周</label>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={16}
                                                    value={uploadWeek}
                                                    onChange={(e) => setUploadWeek(e.target.value)}
                                                    className="w-20 h-9 px-2 border border-[#DEE2E6] rounded-md text-sm focus:border-[#212529] focus:ring-1 focus:ring-[#212529] outline-none"
                                                />
                                                <input
                                                    ref={fileInputRef}
                                                    type="file"
                                                    accept=".pdf,.ppt,.pptx,.txt,.md"
                                                    className="hidden"
                                                    onChange={(e) => {
                                                        const f = e.target.files?.[0];
                                                        if (f) handleUploadPpt(f);
                                                    }}
                                                />
                                                <button
                                                    onClick={() => fileInputRef.current?.click()}
                                                    disabled={uploadingPpt}
                                                    className="h-9 px-3 text-sm text-white bg-[#212529] border border-[#212529] rounded-md hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed transition-colors inline-flex items-center gap-1.5"
                                                >
                                                    {uploadingPpt ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                                                    {uploadingPpt ? '解析中...' : '选择文件'}
                                                </button>
                                            </div>
                                            {uploadResult?.summary && (
                                                <div className="mt-3 border border-[#E9ECEF] rounded-md bg-[#F8F9FA] p-3">
                                                    <div className="flex items-center gap-1.5 text-xs text-[#495057] mb-1.5">
                                                        <FileText size={12} /> AI 生成的知识点总结
                                                    </div>
                                                    <pre className="whitespace-pre-wrap text-xs text-[#212529] m-0 leading-relaxed max-h-40 overflow-y-auto">
                                                        {uploadResult.summary}
                                                    </pre>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* 学生学习情况表 */}
                                <div className="p-6">
                                    <div className="flex items-center justify-between mb-3">
                                        <h3 className="text-base font-semibold text-[#212529] m-0">学生学习情况</h3>
                                        <span className="text-xs text-[#868E96]">
                                            {loadingDetail ? '加载中...' : `共 ${detail?.students?.length ?? 0} 人`}
                                        </span>
                                    </div>

                                    {loadingDetail ? (
                                        <div className="py-10 text-center text-sm text-[#868E96]">正在加载学生数据...</div>
                                    ) : (detail?.students?.length ?? 0) === 0 ? (
                                        <div className="py-10 text-center text-sm text-[#868E96] border border-dashed border-[#DEE2E6] rounded-lg">
                                            该班级还没有学生加入。将邀请码发给学生让他们加入班级吧。
                                        </div>
                                    ) : (
                                        <div className="overflow-x-auto border border-[#E9ECEF] rounded-lg">
                                            <table className="w-full text-sm">
                                                <thead className="bg-[#F8F9FA] text-[#495057]">
                                                    <tr>
                                                        <Th>学生</Th>
                                                        <Th center>提交作业</Th>
                                                        <Th center>已批改</Th>
                                                        <Th center>完成率</Th>
                                                        <Th center>AI 对话</Th>
                                                        <Th>最近活跃</Th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-[#E9ECEF]">
                                                    {detail.students.map((s) => {
                                                        const total = detail?.class?.total_assignments ?? 0;
                                                        const rate = total > 0 ? Math.round((s.submit_count / total) * 100) : 0;
                                                        return (
                                                            <tr key={s.id} className="hover:bg-[#F8F9FA] transition-colors">
                                                                <Td>
                                                                    <div className="font-medium text-[#212529]">
                                                                        {s.display_name || s.username}
                                                                    </div>
                                                                    {s.display_name && (
                                                                        <div className="text-xs text-[#868E96]">@{s.username}</div>
                                                                    )}
                                                                </Td>
                                                                <Td center>
                                                                    <span className="font-mono">
                                                                        {s.submit_count}
                                                                        <span className="text-[#868E96]"> / {total}</span>
                                                                    </span>
                                                                </Td>
                                                                <Td center>
                                                                    <span className="inline-flex items-center gap-1">
                                                                        <CheckCircle2 size={14} className={s.graded_count > 0 ? 'text-[#212529]' : 'text-[#ADB5BD]'} />
                                                                        {s.graded_count}
                                                                    </span>
                                                                </Td>
                                                                <Td center>
                                                                    <ProgressPill percent={rate} />
                                                                </Td>
                                                                <Td center>
                                                                    <span className="inline-flex items-center gap-1 text-[#495057]">
                                                                        <MessageSquare size={14} /> {s.chat_count}
                                                                    </span>
                                                                </Td>
                                                                <Td>
                                                                    <span className="text-[#868E96]">{formatDate(s.last_active)}</span>
                                                                </Td>
                                                            </tr>
                                                        );
                                                    })}
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </section>
                </div>
            </div>

            {/* 创建班级弹窗 */}
            {showCreate && (
                <div
                    className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
                    onClick={() => setShowCreate(false)}
                >
                    <div
                        className="bg-white rounded-xl border border-[#DEE2E6] shadow-xl w-full max-w-md p-6"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-semibold text-[#212529] m-0">新建班级</h3>
                            <button
                                onClick={() => setShowCreate(false)}
                                className="text-[#868E96] hover:text-[#212529]"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <form onSubmit={handleCreate} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-[#868E96] mb-1">班级名称</label>
                                <input
                                    type="text"
                                    value={newClassName}
                                    onChange={(e) => setNewClassName(e.target.value)}
                                    placeholder="例如：线性代数 2025 春 01 班"
                                    className="w-full h-10 px-4 border border-[#DEE2E6] rounded-md focus:border-[#212529] focus:ring-1 focus:ring-[#212529] outline-none text-sm bg-white"
                                    autoFocus
                                />
                            </div>
                            <div className="flex items-center justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowCreate(false)}
                                    className="px-3 py-1.5 text-sm text-[#495057] bg-white border border-[#DEE2E6] rounded-md hover:border-[#212529] hover:text-[#212529] transition-colors"
                                >
                                    取消
                                </button>
                                <button
                                    type="submit"
                                    disabled={creating || !newClassName.trim()}
                                    className="px-3 py-1.5 text-sm text-white bg-[#212529] border border-[#212529] rounded-md hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {creating ? '创建中...' : '创建'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

const StatCard = ({ icon, label, value }) => (
    <div className="border border-[#E9ECEF] rounded-lg px-3 py-3 bg-[#F8F9FA]">
        <div className="flex items-center gap-1.5 text-xs text-[#868E96]">
            {icon}<span>{label}</span>
        </div>
        <div className="text-xl font-semibold text-[#212529] mt-1">{value}</div>
    </div>
);

const ProgressPill = ({ percent }) => (
    <div className="inline-flex items-center gap-2">
        <div className="w-20 h-1.5 bg-[#E9ECEF] rounded-full overflow-hidden">
            <div
                className="h-full bg-[#212529] transition-all duration-500 ease-out"
                style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
            />
        </div>
        <span className="text-xs font-mono text-[#495057] w-9 text-right">{percent}%</span>
    </div>
);

const Th = ({ children, center }) => (
    <th className={`font-medium text-xs uppercase tracking-wide px-4 py-2.5 ${center ? 'text-center' : 'text-left'}`}>
        {children}
    </th>
);

const Td = ({ children, center }) => (
    <td className={`px-4 py-3 ${center ? 'text-center' : 'text-left'}`}>{children}</td>
);

export default ClassManagementPage;
