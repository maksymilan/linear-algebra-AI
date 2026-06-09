import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Bookmark, Check, ChevronDown, Loader2, Search, SlidersHorizontal, X } from 'lucide-react';
import QuestionCard from '../components/QuestionCard';
import Button from '../components/ui/Button';
import IconButton from '../components/ui/IconButton';
import PageHeader from '../components/ui/PageHeader';
import Pagination from '../components/ui/Pagination';
import Select from '../components/ui/Select';
import { EmptyState, InlineAlert, LoadingState } from '../components/ui/FeedbackState';
import { useToast } from '../contexts/ToastContext';
import { useAuth } from '../hooks/useAuth';
import { ALL_CONCEPT_TAGS, CONCEPT_TAXONOMY } from '../utils/conceptsTaxonomy';
import './QuestionBankPage.css';

const QUESTION_TYPES = ['计算', '证明', '选择', '填空', '判断', '简答'];
const QUESTION_TYPE_OPTIONS = [
  { value: '', label: '全部题型' },
  ...QUESTION_TYPES.map((type) => ({ value: type, label: type })),
];
const ANSWER_OPTIONS = [
  { value: '', label: '不限' },
  { value: 'true', label: '有答案' },
  { value: 'false', label: '无答案' },
];
const PAGE_SIZE = 20;

const normalizeSelectedTags = (tags) => (
  Array.from(new Set((Array.isArray(tags) ? tags : []).filter((tag) => ALL_CONCEPT_TAGS.includes(tag))))
);

const ConceptTagPicker = ({ selectedTags, onChange }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handlePointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  const toggleTag = (tag) => {
    onChange(selectedTags.includes(tag)
      ? selectedTags.filter((item) => item !== tag)
      : [...selectedTags, tag]);
  };

  return (
    <div ref={rootRef} className={`question-tag-picker ${open ? 'is-open' : ''}`}>
      <button
        type="button"
        className="question-tag-picker__trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selectedTags.length > 0 ? `已选 ${selectedTags.length} 个知识点` : '选择知识点'}</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>

      {open && (
        <div className="question-tag-picker__panel" role="dialog" aria-label="选择知识点">
          <div className="question-tag-picker__selected">
            {selectedTags.length === 0 ? (
              <span>未选择知识点</span>
            ) : selectedTags.map((tag) => (
              <button key={tag} type="button" onClick={() => toggleTag(tag)}>
                {tag}<X size={12} aria-hidden="true" />
              </button>
            ))}
          </div>
          <div className="question-tag-picker__groups">
            {Object.entries(CONCEPT_TAXONOMY).map(([chapter, tags]) => (
              <section key={chapter}>
                <h3>{chapter}</h3>
                <div>
                  {tags.map((tag) => {
                    const selected = selectedTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        className={selected ? 'is-selected' : ''}
                        aria-pressed={selected}
                        onClick={() => toggleTag(tag)}
                      >
                        {selected && <Check size={12} aria-hidden="true" />}
                        <span>{tag}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const QuestionBankPage = () => {
  const { showToast } = useToast();
  const { userRole } = useAuth();
  const navigate = useNavigate();
  const [explainingId, setExplainingId] = useState(null);
  const [answerEditor, setAnswerEditor] = useState(null); // { question, answer, solution }
  const [savingAnswer, setSavingAnswer] = useState(false);
  const [tab, setTab] = useState('search');
  const [query, setQuery] = useState('');
  const [questionType, setQuestionType] = useState('');
  const [hasAnswer, setHasAnswer] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [filterOpen, setFilterOpen] = useState(false);
  const [results, setResults] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [favoritedIds, setFavoritedIds] = useState(new Set());
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: null, limit: PAGE_SIZE, offset: 0, has_more: false });
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');
  const appliedFiltersRef = useRef({
    query: '',
    questionType: '',
    hasAnswer: '',
    selectedTags: [],
  });

  const loadFavorites = useCallback(async () => {
    try {
      const response = await axios.get('/api/favorites');
      const list = response.data.results || [];
      setFavorites(list);
      setFavoritedIds(new Set(list.map((question) => question.id)));
    } catch {
      // 全局鉴权拦截器负责未登录场景。
    }
  }, []);

  const fetchQuestions = useCallback(async (nextPage = 1) => {
    const safePage = Math.max(1, nextPage);
    const appliedFilters = appliedFiltersRef.current;
    setLoading(true);
    setSearched(true);
    setError('');
    try {
      const body = {
        query: appliedFilters.query.trim(),
        limit: PAGE_SIZE,
        offset: (safePage - 1) * PAGE_SIZE,
      };
      if (appliedFilters.questionType) body.question_type = appliedFilters.questionType;
      if (appliedFilters.hasAnswer) body.has_answer = appliedFilters.hasAnswer === 'true';
      const tags = normalizeSelectedTags(appliedFilters.selectedTags);
      if (tags.length) body.concept_tags = tags;
      const response = await axios.post('/api/questions/search', body);
      setResults(response.data.results || []);
      setPage(safePage);
      setPagination({
        total: response.data.total ?? null,
        limit: response.data.limit || PAGE_SIZE,
        offset: response.data.offset || 0,
        has_more: Boolean(response.data.has_more),
      });
      setFilterOpen(false);
    } catch (requestError) {
      setResults([]);
      setPagination({ total: null, limit: PAGE_SIZE, offset: 0, has_more: false });
      setError(requestError.response?.data?.error || '题库搜索失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadFavorites();
    fetchQuestions(1);
  }, [fetchQuestions, loadFavorites]);

  const applyFilters = (overrides = {}) => {
    const nextFilters = {
      query,
      questionType,
      hasAnswer,
      selectedTags: normalizeSelectedTags(selectedTags),
      ...overrides,
    };
    nextFilters.selectedTags = normalizeSelectedTags(nextFilters.selectedTags);
    appliedFiltersRef.current = nextFilters;
    if (Object.hasOwn(overrides, 'query')) setQuery(nextFilters.query);
    if (Object.hasOwn(overrides, 'questionType')) setQuestionType(nextFilters.questionType);
    if (Object.hasOwn(overrides, 'hasAnswer')) setHasAnswer(nextFilters.hasAnswer);
    if (Object.hasOwn(overrides, 'selectedTags')) setSelectedTags(nextFilters.selectedTags);
    fetchQuestions(1);
  };

  const clearFilters = () => {
    applyFilters({ query: '', questionType: '', hasAnswer: '', selectedTags: [] });
  };

  const applyTagFilter = (tag) => {
    setTab('search');
    setSelectedTags([tag]);
    applyFilters({ selectedTags: [tag], query: '', questionType: '', hasAnswer: '' });
  };

  const toggleFavorite = async (exerciseId) => {
    try {
      if (favoritedIds.has(exerciseId)) {
        await axios.delete(`/api/favorites/${exerciseId}`);
        setFavoritedIds((current) => {
          const next = new Set(current);
          next.delete(exerciseId);
          return next;
        });
        setFavorites((current) => current.filter((question) => question.id !== exerciseId));
        showToast('已取消收藏', 'info');
      } else {
        await axios.post('/api/favorites', { exercise_id: exerciseId });
        setFavoritedIds((current) => new Set(current).add(exerciseId));
        showToast('题目已收藏', 'success');
      }
    } catch (requestError) {
      showToast(requestError.response?.data?.error || '收藏操作失败', 'error');
    }
  };

  const handleExplain = async (question) => {
    if (explainingId) return;
    setExplainingId(question.id);
    showToast('正在生成讲解，请稍候…', 'info');
    try {
      const response = await axios.post(`/api/questions/${question.id}/explain`);
      const sessionId = response.data?.chatSessionId;
      if (!sessionId) throw new Error('no session');
      navigate(`/chat/${sessionId}`);
    } catch (requestError) {
      showToast(requestError.response?.data?.error || 'AI 讲解失败，请稍后再试', 'error');
    } finally {
      setExplainingId(null);
    }
  };

  const openAnswerEditor = (question) => {
    setAnswerEditor({ question, answer: question.answer || '', solution: question.solution || '' });
  };

  const patchQuestion = (id, patch) => {
    const apply = (list) => list.map((item) => (item.id === id ? { ...item, ...patch } : item));
    setResults((current) => apply(current));
    setFavorites((current) => apply(current));
  };

  const saveAnswer = async () => {
    if (!answerEditor) return;
    setSavingAnswer(true);
    try {
      const { question, answer, solution } = answerEditor;
      const response = await axios.put(`/api/teacher/questions/${question.id}/answer`, { answer, solution });
      patchQuestion(question.id, { answer, solution, has_answer: Boolean(response.data?.has_answer) });
      showToast('答案已保存', 'success');
      setAnswerEditor(null);
    } catch (requestError) {
      showToast(requestError.response?.data?.error || '保存答案失败', 'error');
    } finally {
      setSavingAnswer(false);
    }
  };

  const showList = tab === 'search' ? results : favorites;
  const totalPages = pagination.total == null ? null : Math.max(1, Math.ceil(pagination.total / PAGE_SIZE));
  const canPrev = tab === 'search' && page > 1 && !loading;
  const canNext = tab === 'search' && !loading && (
    pagination.has_more || (totalPages != null && page < totalPages)
  );

  const renderFilterFields = () => (
    <>
      <div className="question-filter-field">
        <span>题型</span>
        <Select
          ariaLabel="题型"
          value={questionType}
          options={QUESTION_TYPE_OPTIONS}
          onChange={setQuestionType}
        />
      </div>
      <div className="question-filter-field">
        <span>答案</span>
        <Select
          ariaLabel="答案"
          value={hasAnswer}
          options={ANSWER_OPTIONS}
          onChange={setHasAnswer}
        />
      </div>
      <div className="question-filter-field question-filter-field--tags">
        <span>知识点</span>
        <ConceptTagPicker
          selectedTags={selectedTags}
          onChange={setSelectedTags}
        />
      </div>
    </>
  );

  return (
    <div className="page-surface question-bank-page">
      <div className="page-container">
        <PageHeader
          eyebrow="教材题目"
          title="题库"
          description="检索教材例题和练习题，公式、知识点与出处保持完整。"
          actions={<Button icon={SlidersHorizontal} className="question-mobile-filter" onClick={() => setFilterOpen(true)}>筛选</Button>}
        />

        <div className="question-toolbar">
          <div className="question-tabs" role="tablist">
            <button className={tab === 'search' ? 'is-active' : ''} onClick={() => setTab('search')}>全部题目</button>
            <button className={tab === 'favorites' ? 'is-active' : ''} onClick={() => { setTab('favorites'); loadFavorites(); }}>
              我的收藏 <span>{favorites.length}</span>
            </button>
          </div>
          {tab === 'search' && (
            <form className="question-search" onSubmit={(event) => { event.preventDefault(); applyFilters(); }}>
              <Search size={17} aria-hidden="true" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索题目、概念或公式" />
              <Button type="submit" variant="primary" size="sm">搜索</Button>
            </form>
          )}
        </div>

        {tab === 'search' && (
          <div className="question-filter-bar">
            {renderFilterFields()}
            <div className="question-filter-actions" aria-label="筛选操作">
              <Button size="sm" variant="primary" onClick={() => applyFilters()}>应用筛选</Button>
              <Button size="sm" variant="ghost" onClick={clearFilters}>清空</Button>
            </div>
          </div>
        )}
        {error && <div className="mb-3"><InlineAlert>{error}</InlineAlert></div>}

        {loading ? (
          <LoadingState label="正在检索题目..." />
        ) : showList.length === 0 ? (
          <EmptyState
            icon={tab === 'favorites' ? Bookmark : Search}
            title={tab === 'favorites' ? '还没有收藏题目' : '没有匹配的题目'}
            description={tab === 'favorites' ? '在题目右上角点击收藏，方便以后集中练习。' : '尝试减少筛选条件或更换搜索关键词。'}
          />
        ) : (
          <div className="question-list">
            {showList.map((question) => (
              <QuestionCard
                key={question.id}
                question={question}
                isFavorited={favoritedIds.has(question.id)}
                onToggleFavorite={toggleFavorite}
                onTagClick={applyTagFilter}
                userRole={userRole}
                onExplain={handleExplain}
                onEditAnswer={openAnswerEditor}
                explaining={explainingId === question.id}
              />
            ))}
          </div>
        )}

        {tab === 'search' && searched && !loading && !error && results.length > 0 && (
          <Pagination
            page={page}
            totalPages={totalPages}
            total={pagination.total}
            canPrev={canPrev}
            canNext={canNext}
            onPrev={() => fetchQuestions(page - 1)}
            onNext={() => fetchQuestions(page + 1)}
          />
        )}
      </div>

      {filterOpen && (
        <div className="question-filter-drawer-backdrop" onMouseDown={() => setFilterOpen(false)}>
          <div className="question-filter-drawer" onMouseDown={(event) => event.stopPropagation()}>
            <div className="question-filter-drawer__header">
              <strong>筛选题目</strong>
              <IconButton icon={X} label="关闭筛选" onClick={() => setFilterOpen(false)} />
            </div>
            <div className="question-filter-drawer__body">{renderFilterFields()}</div>
            <div className="question-filter-drawer__actions">
              <Button variant="primary" onClick={() => applyFilters()}>应用筛选</Button>
              <Button variant="ghost" onClick={clearFilters}>清空</Button>
            </div>
          </div>
        </div>
      )}

      {answerEditor && (
        <div className="question-answer-modal__backdrop" onMouseDown={() => !savingAnswer && setAnswerEditor(null)}>
          <div className="question-answer-modal" onMouseDown={(event) => event.stopPropagation()}>
            <div className="question-answer-modal__header">
              <strong>录入题目答案</strong>
              <IconButton icon={X} label="关闭" onClick={() => !savingAnswer && setAnswerEditor(null)} />
            </div>
            <p className="question-answer-modal__hint">
              答案与解析将直接展示给本班学生（不经过 AI 生成）。留空则视为暂无答案。
            </p>
            <div className="question-answer-modal__field">
              <span>答案</span>
              <textarea
                value={answerEditor.answer}
                onChange={(event) => setAnswerEditor((current) => ({ ...current, answer: event.target.value }))}
                placeholder="例如：x₁ = 1, x₂ = -1（支持 Markdown / LaTeX，用 $...$ 包裹公式）"
                rows={4}
              />
            </div>
            <div className="question-answer-modal__field">
              <span>解析（可选）</span>
              <textarea
                value={answerEditor.solution}
                onChange={(event) => setAnswerEditor((current) => ({ ...current, solution: event.target.value }))}
                placeholder="解题步骤、思路说明……"
                rows={6}
              />
            </div>
            <div className="question-answer-modal__actions">
              <Button variant="ghost" onClick={() => setAnswerEditor(null)} disabled={savingAnswer}>取消</Button>
              <Button variant="primary" onClick={saveAnswer} loading={savingAnswer} icon={savingAnswer ? Loader2 : Check}>
                保存答案
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuestionBankPage;
