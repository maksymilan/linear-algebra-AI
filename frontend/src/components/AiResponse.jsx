// src/components/AiResponse.jsx

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw'; // 解析正文里的原始 HTML（如批改用的 <span style="color">）
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';

import autoWrapMath from '../utils/autoWrapMath';
import 'katex/dist/katex.min.css';
import './AiResponse.css';

// 安全：rehypeRaw 会把内容里的原始 HTML 当真 HTML 渲染，若不净化则 AI 输出 / 老师录入
// 的题目和答案里夹带 <script>、onerror= 等就会在学生浏览器执行（存储型 XSS）。
// 这里用 rehype-sanitize 走白名单净化，但放行 className（数学节点 language-math/math-display
// 要透传给 rehypeKatex）和 style（批改的颜色 span）。净化在 katex 之前，katex 之后的可信
// 输出不再被剥离，公式照常渲染。
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] || []), 'className', 'style'],
  },
};

const AiResponse = ({ content }) => {
  // 统一在组件内做一次数学规范化兜底：把 \(...\) \[...\] 归一成 $...$ / $$...$$，
  // 并给裸 LaTeX 命令补 $。autoWrapMath 幂等，外部即便已调用过也安全。
  const normalized = autoWrapMath(typeof content === 'string' ? content : '');
  return (
    <div className="ai-response-content">
      <ReactMarkdown
        children={normalized}
        remarkPlugins={[remarkGfm, remarkMath]}
        // 顺序：rehypeRaw 解析 HTML → rehypeSanitize 净化（防 XSS）→ rehypeKatex 渲染公式
        rehypePlugins={[rehypeRaw, [rehypeSanitize, sanitizeSchema], rehypeKatex]}
      />
    </div>
  );
};

export default AiResponse;