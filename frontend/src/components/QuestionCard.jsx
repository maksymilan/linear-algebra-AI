// src/components/QuestionCard.jsx
import React from 'react';
import AiResponse from './AiResponse';
import autoWrapMath from '../utils/autoWrapMath';

const TYPE_LABEL = { example: '例题', homework: '课后习题' };

const QuestionCard = ({ question, isFavorited, onToggleFavorite }) => {
  // concept_tags 可能是数组（搜索结果）或逗号字符串（收藏夹）
  const tags = Array.isArray(question.concept_tags)
    ? question.concept_tags
    : (question.concept_tags || '').split(',').map((s) => s.trim()).filter(Boolean);

  const sourceParts = [];
  if (question.exercise_number) sourceParts.push(question.exercise_number);
  if (question.textbook_name) sourceParts.push(`《${question.textbook_name}》`);
  if (question.page_num) sourceParts.push(`第${question.page_num}页`);

  return (
    <div className="border border-[#DEE2E6] rounded-lg p-4 bg-white mb-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {question.question_type && (
            <span className="px-2 py-0.5 rounded bg-[#E7F5FF] text-[#1971C2]">{question.question_type}</span>
          )}
          <span className="px-2 py-0.5 rounded bg-[#F1F3F5] text-[#495057]">
            {TYPE_LABEL[question.exercise_type] || '题目'}
          </span>
          <span
            className={`px-2 py-0.5 rounded ${
              question.has_answer ? 'bg-[#EBFBEE] text-[#2F9E44]' : 'bg-[#FFF0F6] text-[#C2255C]'
            }`}
          >
            {question.has_answer ? '有答案' : '无答案'}
          </span>
        </div>
        <button
          onClick={() => onToggleFavorite(question.id)}
          className="text-xl leading-none shrink-0"
          title={isFavorited ? '取消收藏' : '收藏'}
          aria-label={isFavorited ? '取消收藏' : '收藏'}
        >
          <span className={isFavorited ? 'text-[#F08C00]' : 'text-[#CED4DA]'}>{isFavorited ? '★' : '☆'}</span>
        </button>
      </div>

      <div className="mt-2 text-[#212529]">
        <AiResponse content={autoWrapMath(question.stem || '')} />
      </div>

      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {tags.map((t) => (
            <span
              key={t}
              className="px-2 py-0.5 rounded-full bg-[#F8F9FA] border border-[#DEE2E6] text-xs text-[#868E96]"
            >
              #{t}
            </span>
          ))}
        </div>
      )}

      {sourceParts.length > 0 && (
        <div className="mt-2 text-xs text-[#ADB5BD]">{sourceParts.join(' · ')}</div>
      )}
    </div>
  );
};

export default QuestionCard;
