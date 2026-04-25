// src/components/AiResponse.jsx

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw'; // 1. 导入 rehype-raw 插件

import 'katex/dist/katex.min.css';
import './AiResponse.css';

const AiResponse = ({ content }) => {
  return (
    <div className="ai-response-content">
      <ReactMarkdown
        children={content}
        remarkPlugins={[remarkGfm, remarkMath]}
        // 2. 将 rehypeRaw 添加到 rehypePlugins 数组中
        rehypePlugins={[rehypeRaw, rehypeKatex]} 
      />
    </div>
  );
};

export default AiResponse;