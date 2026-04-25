// src/pages/StudentClassPage.jsx
//
// 学生端班级详情页面：
//   - 未加入：展示输入邀请码的加入表单
//   - 已加入：展示班级名称、邀请码、教师、当前教学周、同学人数、课件数量

import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../hooks/useAuth';
import { ArrowLeft, Users, Clock, BookOpen, GraduationCap, Copy, Check, RefreshCw } from 'lucide-react';

const API_BASE_URL = 'http://localhost:8080';

const StudentClassPage = () => {
    const { token } = useAuth();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [joined, setJoined] = useState(false);
    const [cls, setCls] = useState(null);
    const [inviteCode, setInviteCode] = useState('');
    const [joining, setJoining] = useState(false);
    const [error, setError] = useState('');
    const [copied, setCopied] = useState(false);

    const authHeader = { headers: { Authorization: `Bearer ${token}` } };

    const fetchClass = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const resp = await axios.get(`${API_BASE_URL}/api/student/class`, authHeader);
            setJoined(!!resp.data?.joined);
            setCls(resp.data?.class || null);
        } catch (e) {
            setError(e.response?.data?.error || '获取班级信息失败');
        } finally {
            setLoading(false);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [token]);

    useEffect(() => {
        fetchClass();
    }, [fetchClass]);

    const handleJoin = async (e) => {
        e.preventDefault();
        if (!inviteCode.trim()) return;
        setJoining(true);
        setError('');
        try {
            await axios.post(
                `${API_BASE_URL}/api/student/class/join`,
                { invite_code: inviteCode.trim().toUpperCase() },
                authHeader
            );
            setInviteCode('');
            await fetchClass();
        } catch (e) {
            setError(e.response?.data?.error || '加入班级失败');
        } finally {
            setJoining(false);
        }
    };

    const copyInvite = async () => {
        if (!cls?.invite_code) return;
        try {
            await navigator.clipboard.writeText(cls.invite_code);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            // ignore
        }
    };

    return (
        <div className="min-h-screen bg-[#F1F3F5] p-6 md:p-10">
            <div className="max-w-[900px] mx-auto">
                <button
                    onClick={() => navigate('/workspace')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#495057] bg-white border border-[#DEE2E6] rounded-md hover:border-[#212529] hover:text-[#212529] transition-colors mb-4"
                >
                    <ArrowLeft size={16} /> 返回工作区
                </button>

                <header className="mb-6 flex items-end justify-between flex-wrap gap-3">
                    <div>
                        <h1 className="text-2xl font-semibold text-[#212529] m-0">我的班级</h1>
                        <p className="text-sm text-[#868E96] mt-1 mb-0">
                            {joined ? '查看当前所在班级的信息与进度。' : '输入老师提供的 6 位邀请码加入你的班级。'}
                        </p>
                    </div>
                    <button
                        onClick={fetchClass}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#495057] bg-white border border-[#DEE2E6] rounded-md hover:border-[#212529] hover:text-[#212529] transition-colors"
                    >
                        <RefreshCw size={14} /> 刷新
                    </button>
                </header>

                {error && (
                    <div className="mb-4 text-sm text-[#dc3545] bg-[#FFF5F5] border border-[#FFE3E3] rounded-md px-3 py-2">
                        {error}
                    </div>
                )}

                {loading ? (
                    <div className="bg-white border border-[#DEE2E6] rounded-xl p-10 text-center text-sm text-[#868E96]">
                        加载中...
                    </div>
                ) : joined && cls ? (
                    <section className="bg-white border border-[#DEE2E6] rounded-xl">
                        <div className="p-6 border-b border-[#E9ECEF]">
                            <div className="flex items-start justify-between flex-wrap gap-3">
                                <div>
                                    <h2 className="text-xl font-semibold text-[#212529] m-0">{cls.name}</h2>
                                    <p className="text-xs text-[#868E96] mt-1 mb-0">
                                        任课老师：{cls.teacher_name || '—'}
                                    </p>
                                </div>
                                <button
                                    onClick={copyInvite}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm text-[#495057] bg-[#F8F9FA] border border-[#DEE2E6] rounded-md hover:border-[#212529] hover:text-[#212529] transition-colors"
                                    title="点击复制邀请码"
                                >
                                    {copied ? <Check size={14} /> : <Copy size={14} />}
                                    邀请码：<span className="font-mono font-semibold text-[#212529]">{cls.invite_code}</span>
                                </button>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
                                <StatCard icon={<Clock size={16} />} label="当前教学周" value={`第 ${cls.current_week} 周`} />
                                <StatCard icon={<Users size={16} />} label="同学人数" value={cls.classmate_count} />
                                <StatCard icon={<BookOpen size={16} />} label="本学期课件" value={cls.materials_count} />
                                <StatCard icon={<GraduationCap size={16} />} label="班级编号" value={`#${cls.id}`} />
                            </div>
                        </div>
                        <div className="p-6 text-sm text-[#495057] leading-relaxed">
                            <p className="m-0">
                                你已经加入班级 <strong className="text-[#212529]">{cls.name}</strong>。AI 助教将依据该班级的教学进度
                                （当前第 {cls.current_week} 周）来回答你的问题，作业任务也会同步发放到你的作业列表。
                            </p>
                        </div>
                    </section>
                ) : (
                    <section className="bg-white border border-[#DEE2E6] rounded-xl p-6">
                        <h2 className="text-lg font-semibold text-[#212529] m-0 mb-1">还没有加入任何班级</h2>
                        <p className="text-sm text-[#868E96] m-0 mb-5">
                            向你的老师索要 6 位班级邀请码（字母与数字组合），在下方输入后即可加入。
                        </p>
                        <form onSubmit={handleJoin} className="flex items-center gap-2">
                            <input
                                type="text"
                                value={inviteCode}
                                onChange={(e) => setInviteCode(e.target.value.toUpperCase().slice(0, 6))}
                                placeholder="ABC123"
                                className="flex-1 h-10 px-4 border border-[#DEE2E6] rounded-md focus:border-[#212529] focus:ring-1 focus:ring-[#212529] outline-none text-sm font-mono tracking-widest bg-white"
                                maxLength={6}
                                required
                            />
                            <button
                                type="submit"
                                disabled={joining || inviteCode.length < 4}
                                className="h-10 px-4 text-sm text-white bg-[#212529] border border-[#212529] rounded-md hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {joining ? '加入中...' : '加入班级'}
                            </button>
                        </form>
                    </section>
                )}
            </div>
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

export default StudentClassPage;
