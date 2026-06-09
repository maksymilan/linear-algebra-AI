import React, { useState } from 'react';
import { Bookmark, BookmarkCheck, Sparkles, Pencil, Eye, EyeOff, Loader2 } from 'lucide-react';
import AiResponse from './AiResponse';
import IconButton from './ui/IconButton';

const TYPE_LABEL = { example: '例题', homework: '课后习题' };

const QuestionCard = ({
  question,
  isFavorited,
  onToggleFavorite,
  onTagClick,
  userRole,
  onExplain,
  onEditAnswer,
  explaining = false,
}) => {
  const [showAnswer, setShowAnswer] = useState(false);
  const tags = Array.isArray(question.concept_tags)
    ? question.concept_tags
    : (question.concept_tags || '').split(',').map((item) => item.trim()).filter(Boolean);
  const sourceParts = [
    question.exercise_number,
    question.textbook_name ? `《${question.textbook_name}》` : '',
    question.page_num ? `第 ${question.page_num} 页` : '',
  ].filter(Boolean);
  const answerText = (question.answer || '').trim();
  const solutionText = (question.solution || '').trim();
  const hasAnswerContent = Boolean(answerText || solutionText);
  const isTeacher = userRole === 'teacher';

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
        <AiResponse content={question.stem || ''} />
      </div>

      {showAnswer && hasAnswerContent && (
        <div className="question-row__answer">
          {answerText && (
            <div className="question-answer__block">
              <span className="question-answer__label">答案</span>
              <AiResponse content={answerText} />
            </div>
          )}
          {solutionText && (
            <div className="question-answer__block">
              <span className="question-answer__label">解析</span>
              <AiResponse content={solutionText} />
            </div>
          )}
        </div>
      )}

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

      {(hasAnswerContent || isTeacher || onExplain) && (
        <div className="question-row__actions">
          {hasAnswerContent && (
            <button type="button" className="question-action" onClick={() => setShowAnswer((v) => !v)}>
              {showAnswer ? <EyeOff size={14} aria-hidden="true" /> : <Eye size={14} aria-hidden="true" />}
              {showAnswer ? '收起答案' : '查看答案'}
            </button>
          )}
          {isTeacher && (
            <button type="button" className="question-action" onClick={() => onEditAnswer?.(question)}>
              <Pencil size={14} aria-hidden="true" />
              {question.has_answer ? '编辑答案' : '录入答案'}
            </button>
          )}
          {!isTeacher && onExplain && (
            <button
              type="button"
              className="question-action question-action--primary"
              disabled={explaining}
              onClick={() => onExplain(question)}
            >
              {explaining ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
              {explaining ? 'AI 讲解生成中…' : 'AI 讲解'}
            </button>
          )}
        </div>
      )}
    </article>
  );
};

export default QuestionCard;
