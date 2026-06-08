import React from 'react';
import TextbookManager from '../components/TextbookManager';
import PageHeader from '../components/ui/PageHeader';

const TextbookManagerPage = () => (
  <div className="page-surface">
    <div className="page-container">
      <PageHeader
        eyebrow="知识库"
        title="教材管理"
        description="上传课程教材并跟踪 OCR、内容修复、题目提取和向量化进度。"
      />
      <TextbookManager />
    </div>
  </div>
);

export default TextbookManagerPage;
