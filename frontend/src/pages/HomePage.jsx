import React, { useEffect } from 'react';
import { ArrowRight, BookOpen, Bot, CheckCircle2, Library } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import './HomePage.css';

function HomePage() {
  const navigate = useNavigate();
  const { token } = useAuth();

  useEffect(() => {
    if (token) navigate('/workspace', { replace: true });
  }, [token, navigate]);

  if (token) return null;

  return (
    <div className="home-page">
      <nav className="home-nav" aria-label="主导航">
        <div className="home-brand">
          <img src="/logo.svg" alt="" className="home-logo" />
          <span>智能助教平台</span>
        </div>
        <button className="home-nav-button" onClick={() => navigate('/login')}>登录 / 注册</button>
      </nav>

      <main className="home-main">
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-hero-copy">
            <p className="home-kicker">线性代数教学工作台</p>
            <h1 id="home-title">智能助教平台</h1>
            <p className="home-lead">
              把教材、题库、作业和 AI 答疑放进同一个学习流程。学生获得即时帮助，教师更高效地组织课程内容。
            </p>
            <div className="home-actions">
              <button className="home-primary-button" onClick={() => navigate('/login')}>
                开始使用 <ArrowRight size={17} />
              </button>
              <a className="home-secondary-link" href="#home-capabilities">了解功能</a>
            </div>
          </div>

          <div className="home-product-preview" aria-label="产品界面预览">
            <div className="home-product-sidebar">
              <div className="home-product-brand"><img src="/logo.svg" alt="" /><span>智能助教</span></div>
              <div className="home-product-nav is-active"><Bot size={15} />AI 助教</div>
              <div className="home-product-nav"><Library size={15} />题库</div>
              <div className="home-product-nav"><BookOpen size={15} />教材管理</div>
            </div>
            <div className="home-product-main">
              <div className="home-product-header">
                <div><strong>二次型定义与理解</strong><span>默认模型</span></div>
                <span className="home-product-badge">教材检索已开启</span>
              </div>
              <div className="home-product-chat">
                <div className="home-product-question">如何判断一个二次型是否正定？</div>
                <div className="home-product-answer">
                  <div className="home-product-ai">AI</div>
                  <div>
                    <strong>可以从三个等价条件入手</strong>
                    <p>检查特征值、顺序主子式，或通过配方法化为标准形。</p>
                    <span><CheckCircle2 size={12} />引用教材第 6 章 · 3 条</span>
                  </div>
                </div>
              </div>
              <div className="home-product-input">给助教发送消息...</div>
            </div>
          </div>
        </section>

        <section id="home-capabilities" className="home-capabilities" aria-label="核心能力">
          <article><span>01</span><h2>带出处的 AI 答疑</h2><p>回答可检索教材正文与题目，公式使用 LaTeX 清晰呈现。</p></article>
          <article><span>02</span><h2>课程与作业协同</h2><p>教师发布任务、跟踪提交，学生完成作业并获得反馈。</p></article>
          <article><span>03</span><h2>题库与智能批改</h2><p>按知识点检索题目，上传解答后获得结构化批改建议。</p></article>
        </section>
      </main>
    </div>
  );
}

export default HomePage;
