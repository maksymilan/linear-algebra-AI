import React from 'react';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import AiResponse from './AiResponse';
import IconButton from './ui/IconButton';
import autoWrapMath from '../utils/autoWrapMath';

const TYPE_LABEL = { example: '例题', homework: '课后习题' };

const QuestionCard = ({ question, isFavorited, onToggleFavorite, onTagClick }) => {
  const tags = Array.isArray(question.concept_tags)
    ? question.concept_tags
    : (question.concept_tags || '').split(',').map((item) => item.trim()).filter(Boolean);
  const sourceParts = [
    question.exercise_number,
    question.textbook_name ? `《${question.textbook_name}》` : '',
    question.page_num ? `第 ${question.page_num} 页` : '',
  ].filter(Boolean);

  return (
    <article className="question-row">
      <div className="question-row__top">
        <div className="question-row__badges">
          {question.question_type && <span className="question-badge question-badge--dark">{question.question_type}</span>}
          <span className="question-badge">{TYPE_LABEL[question.exercise_type] || '题目'}</span>
          <span className={`question-badge ${question.has_answer ? 'question-badge--success' : ''}`}>
            {question.has_answer ? '有答案' : '无答案'}
          </span>
        </div>
        <IconButton
          icon={isFavorited ? BookmarkCheck : Bookmark}
          label={isFavorited ? '取消收藏' : '收藏题目'}
          size="sm"
          className={isFavorited ? 'question-row__favorite is-active' : 'question-row__favorite'}
          onClick={() => onToggleFavorite(question.id)}
        />
      </div>
      <div className="question-row__content">
        <AiResponse content={autoWrapMath(question.stem || '')} />
      </div>
      <div className="question-row__footer">
        <div className="question-row__tags">
          {tags.map((tag) => (
            onTagClick ? (
              <button key={tag} type="button" onClick={() => onTagClick(tag)}>#{tag}</button>
            ) : (
              <span key={tag}>#{tag}</span>
            )
          ))}
        </div>
        {sourceParts.length > 0 && <div className="question-row__source">{sourceParts.join(' · ')}</div>}
      </div>
    </article>
  );
};

export default QuestionCard;
