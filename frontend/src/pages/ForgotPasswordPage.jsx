// src/pages/ForgotPasswordPage.jsx
// 基于邮箱验证码的两步重置密码流程
//   Step 1: 用户名 + 邮箱 -> 请求验证码（后端把验证码打印到日志；开发联调可返回 debug_code）
//   Step 2: 输入验证码 + 新密码 -> 重置密码，成功后跳转登录

import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';

const API_BASE_URL = 'http://localhost:8080';

const ForgotPasswordPage = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState(1);

    const [username, setUsername] = useState('');
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [cooldown, setCooldown] = useState(0); // 重发冷却秒数

    useEffect(() => {
        if (cooldown <= 0) return;
        const t = setInterval(() => setCooldown((n) => n - 1), 1000);
        return () => clearInterval(t);
    }, [cooldown]);

    const requestCode = async () => {
        if (!email.trim()) {
            setError('请先填写邮箱');
            return;
        }
        setLoading(true);
        setError('');
        setInfo('');
        try {
            const resp = await axios.post(`${API_BASE_URL}/api/auth/request-code`, {
                username: username.trim(),
                email: email.trim(),
                purpose: 'password_reset',
            });
            setInfo(resp.data?.message || '验证码已发送，请查收邮箱（开发环境请查看后端日志）');
            setStep(2);
            setCooldown(60);
        } catch (e) {
            setError(e.response?.data?.error || '发送验证码失败');
        } finally {
            setLoading(false);
        }
    };

    const resetPassword = async (e) => {
        e.preventDefault();
        setError('');
        if (!code.trim() || code.trim().length < 4) {
            setError('请输入正确的验证码');
            return;
        }
        if (newPassword.length < 6) {
            setError('新密码至少 6 位');
            return;
        }
        if (newPassword !== confirmPassword) {
            setError('两次输入的新密码不一致');
            return;
        }
        setLoading(true);
        try {
            await axios.post(`${API_BASE_URL}/api/auth/reset-password`, {
                email: email.trim(),
                code: code.trim(),
                new_password: newPassword,
            });
            alert('密码重置成功，请使用新密码登录');
            navigate('/login');
        } catch (e) {
            setError(e.response?.data?.error || '重置失败');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F1F3F5] flex items-center justify-center px-4">
            <div className="w-full max-w-md bg-white border border-[#DEE2E6] rounded-xl shadow-sm p-8">
                <div className="mb-6">
                    <h1 className="text-2xl font-semibold text-[#212529] m-0">找回密码</h1>
                    <p className="text-sm text-[#868E96] mt-1 mb-0">
                        {step === 1 ? '我们会把 6 位验证码发送到你的注册邮箱。' : '请输入邮箱收到的验证码和新密码。'}
                    </p>
                </div>

                {/* 步骤指示 */}
                <div className="flex items-center gap-2 mb-6 text-xs">
                    <StepPill active={step >= 1} label="1 · 验证身份" />
                    <div className="flex-1 h-px bg-[#DEE2E6]" />
                    <StepPill active={step >= 2} label="2 · 设置新密码" />
                </div>

                {error && (
                    <div className="mb-4 text-sm text-[#dc3545] bg-[#FFF5F5] border border-[#FFE3E3] rounded-md px-3 py-2">
                        {error}
                    </div>
                )}
                {info && !error && (
                    <div className="mb-4 text-sm text-[#495057] bg-[#F8F9FA] border border-[#DEE2E6] rounded-md px-3 py-2">
                        {info}
                    </div>
                )}

                {step === 1 ? (
                    <form
                        onSubmit={(e) => { e.preventDefault(); requestCode(); }}
                        className="space-y-4"
                    >
                        <Field label="用户名（可选）">
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="不填也可以"
                                className="w-full h-10 px-4 border border-[#DEE2E6] rounded-md focus:border-[#212529] focus:ring-1 focus:ring-[#212529] outline-none text-sm bg-white"
                            />
                        </Field>
                        <Field label="注册邮箱">
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="you@example.com"
                                className="w-full h-10 px-4 border border-[#DEE2E6] rounded-md focus:border-[#212529] focus:ring-1 focus:ring-[#212529] outline-none text-sm bg-white"
                                required
                            />
                        </Field>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full h-10 bg-[#212529] text-white rounded-md font-medium hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {loading ? '发送中...' : '发送验证码'}
                        </button>
                    </form>
                ) : (
                    <form onSubmit={resetPassword} className="space-y-4">
                        <Field label="验证码">
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={code}
                                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                                    placeholder="6 位数字"
                                    inputMode="numeric"
                                    className="flex-1 h-10 px-4 border border-[#DEE2E6] rounded-md focus:border-[#212529] focus:ring-1 focus:ring-[#212529] outline-none text-sm bg-white font-mono tracking-widest"
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={requestCode}
                                    disabled={cooldown > 0 || loading}
                                    className="h-10 px-3 text-sm border border-[#DEE2E6] rounded-md text-[#495057] bg-white hover:border-[#212529] hover:text-[#212529] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                >
                                    {cooldown > 0 ? `${cooldown}s 后重发` : '重新发送'}
                                </button>
                            </div>
                        </Field>
                        <Field label="新密码">
                            <input
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="至少 6 位"
                                className="w-full h-10 px-4 border border-[#DEE2E6] rounded-md focus:border-[#212529] focus:ring-1 focus:ring-[#212529] outline-none text-sm bg-white"
                                required
                            />
                        </Field>
                        <Field label="确认新密码">
                            <input
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="再输一次"
                                className="w-full h-10 px-4 border border-[#DEE2E6] rounded-md focus:border-[#212529] focus:ring-1 focus:ring-[#212529] outline-none text-sm bg-white"
                                required
                            />
                        </Field>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => setStep(1)}
                                className="h-10 px-4 text-sm border border-[#DEE2E6] rounded-md text-[#495057] bg-white hover:border-[#212529] hover:text-[#212529] transition-colors"
                            >
                                上一步
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="flex-1 h-10 bg-[#212529] text-white rounded-md font-medium hover:bg-black disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                {loading ? '处理中...' : '重置密码'}
                            </button>
                        </div>
                    </form>
                )}

                <div className="mt-6 text-center text-sm text-[#868E96]">
                    想起密码了？ <Link to="/login" className="text-[#212529] underline">返回登录</Link>
                </div>
            </div>
        </div>
    );
};

const StepPill = ({ active, label }) => (
    <div className={`px-3 py-1 rounded-full border ${active ? 'bg-[#212529] text-white border-[#212529]' : 'bg-white text-[#868E96] border-[#DEE2E6]'}`}>
        {label}
    </div>
);

const Field = ({ label, children }) => (
    <div>
        <label className="block text-sm font-medium text-[#868E96] mb-1">{label}</label>
        {children}
    </div>
);

export default ForgotPasswordPage;
