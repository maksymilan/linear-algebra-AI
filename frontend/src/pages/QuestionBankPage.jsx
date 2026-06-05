// src/pages/QuestionBankPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import QuestionCard from '../components/QuestionCard';

const QUESTION_TYPES = ['计算', '证明', '选择', '填空', '判断', '简答'];
const PAGE_SIZE = 20;

const QuestionBankPage = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState('search'); // 'search' | 'favorites'

  // 搜索条件
  const [query, setQuery] = useState('');
  const [questionType, setQuestionType] = useState('');
  const [hasAnswer, setHasAnswer] = useState(''); // '' | 'true' | 'false'
  const [tagInput, setTagInput] = useState('');

  const [results, setResults] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [favoritedIds, setFavoritedIds] = useState(new Set());
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({
    total: null,
    limit: PAGE_SIZE,
    offset: 0,
    has_more: false,
  });
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState('');

  const loadFavorites = useCallback(async () => {
    try {
      const res = await axios.get('/api/favorites');
      const list = res.data.results || [];
      setFavorites(list);
      setFavoritedIds(new Set(list.map((q) => q.id)));
    } catch (e) {
      /* 忽略：未登录时由全局拦截器处理 */
    }
  }, []);

  useEffect(() => {
    loadFavorites();
    // 进页面默认展示题库（空 query → 后端按页码浏览），避免初次进来一片空白
    fetchQuestions(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadFavorites]);

  const fetchQuestions = async (nextPage = 1) => {
    const safePage = Math.max(1, nextPage);
    setLoading(true);
    setSearched(true);
    setError('');
    try {
      const body = {
        query: query.trim(),
        limit: PAGE_SIZE,
        offset: (safePage - 1) * PAGE_SIZE,
      };
      if (questionType) body.question_type = questionType;
      if (hasAnswer) body.has_answer = hasAnswer === 'true';
      const tags = tagInput.split(',').map((s) => s.trim()).filter(Boolean);
      if (tags.length) body.concept_tags = tags;
      const res = await axios.post('/api/questions/search', body);
      setResults(res.data.results || []);
      setPage(safePage);
      setPagination({
        total: res.data.total ?? null,
        limit: res.data.limit || PAGE_SIZE,
        offset: res.data.offset || 0,
        has_more: Boolean(res.data.has_more),
      });
    } catch (e) {
      setResults([]);
      setPagination({ total: null, limit: PAGE_SIZE, offset: 0, has_more: false });
      setError(e.response?.data?.error || '题库搜索失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const doSearch = () => fetchQuestions(1);

  const toggleFavorite = async (exerciseId) => {
    if (favoritedIds.has(exerciseId)) {
      await axios.delete(`/api/favorites/${exerciseId}`);
      setFavoritedIds((prev) => {
        const n = new Set(prev);
        n.delete(exerciseId);
        return n;
      });
      setFavorites((prev) => prev.filter((q) => q.id !== exerciseId));
    } else {
      await axios.post('/api/favorites', { exercise_id: exerciseId });
      setFavoritedIds((prev) => new Set(prev).add(exerciseId));
    }
  };

  const showList = tab === 'search' ? results : favorites;
  const totalPages = pagination.total == null
    ? null
    : Math.max(1, Math.ceil(pagination.total / PAGE_SIZE));
  const canPrev = tab === 'search' && page > 1 && !loading;
  const canNext = tab === 'search' && !loading && (
    pagination.has_more || (totalPages != null && page < totalPages)
  );

  return (
    <div className="max-w-3xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-[#212529]">题库</h1>
        <button
          onClick={() => navigate('/workspace')}
          className="text-sm text-[#868E96] hover:text-[#212529]"
        >
          返回工作台
        </button>
      </div>

      <div className="flex gap-2 mb-4 border-b border-[#DEE2E6]">
        <button
          onClick={() => setTab('search')}
          className={`px-3 py-2 text-sm ${
            tab === 'search' ? 'border-b-2 border-[#1971C2] text-[#1971C2]' : 'text-[#868E96]'
          }`}
        >
          搜索
        </button>
        <button
          onClick={() => {
            setTab('favorites');
            loadFavorites();
          }}
          className={`px-3 py-2 text-sm ${
            tab === 'favorites' ? 'border-b-2 border-[#1971C2] text-[#1971C2]' : 'text-[#868E96]'
          }`}
        >
          我的收藏
        </button>
      </div>

      {tab === 'search' && (
        <div className="mb-4 space-y-3">
          <div className="flex gap-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && doSearch()}
              placeholder="搜索题目，如：求特征值 / 二次型标准形"
              className="flex-1 h-10 px-3 border border-[#DEE2E6] rounded-md text-sm"
            />
            <button onClick={doSearch} className="px-4 h-10 bg-[#1971C2] text-white rounded-md text-sm">
              搜索
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            <select
              value={questionType}
              onChange={(e) => setQuestionType(e.target.value)}
              className="h-9 px-2 border border-[#DEE2E6] rounded-md text-sm"
            >
              <option value="">全部题型</option>
              {QUESTION_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <select
              value={hasAnswer}
              onChange={(e) => setHasAnswer(e.target.value)}
              className="h-9 px-2 border border-[#DEE2E6] rounded-md text-sm"
            >
              <option value="">有无答案不限</option>
              <option value="true">有答案（例题）</option>
              <option value="false">无答案（练习）</option>
            </select>
            <input
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              placeholder="知识点（逗号分隔）"
              className="h-9 px-2 border border-[#DEE2E6] rounded-md text-sm flex-1 min-w-[160px]"
            />
          </div>
        </div>
      )}

      {loading && <p className="text-sm text-[#868E96]">搜索中…</p>}
      {!loading && error && <p className="text-sm text-[#C92A2A]">{error}</p>}
      {!loading && !error && tab === 'search' && searched && results.length === 0 && (
        <p className="text-sm text-[#868E96]">没有匹配的题目。</p>
      )}
      {!loading && tab === 'favorites' && favorites.length === 0 && (
        <p className="text-sm text-[#868E96]">还没有收藏题目。</p>
      )}

      {showList.map((q) => (
        <QuestionCard
          key={q.id}
          question={q}
          isFavorited={favoritedIds.has(q.id)}
          onToggleFavorite={toggleFavorite}
        />
      ))}

      {tab === 'search' && searched && !loading && !error && results.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-[#868E96]">
          <div>
            第 {page} 页
            {totalPages != null ? ` / 共 ${totalPages} 页` : ''}
            {pagination.total != null ? ` · 共 ${pagination.total} 道题` : ''}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => fetchQuestions(page - 1)}
              disabled={!canPrev}
              className="h-9 px-3 rounded-md border border-[#DEE2E6] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F8F9FA]"
            >
              上一页
            </button>
            <button
              onClick={() => fetchQuestions(page + 1)}
              disabled={!canNext}
              className="h-9 px-3 rounded-md border border-[#DEE2E6] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#F8F9FA]"
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuestionBankPage;
