import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { X, Check, Search, Loader2, BookOpen } from 'lucide-react';
import AiResponse from './AiResponse';

// 老师选题用的题库浏览弹窗：左侧按教材章节分类，右侧题目卡片勾选。
const QuestionBankPicker = ({ initialSelected = [], onConfirm, onClose }) => {
    const [chapters, setChapters] = useState([]);
    const [activeChapter, setActiveChapter] = useState('');
    const [questions, setQuestions] = useState([]);
    const [loadingChapters, setLoadingChapters] = useState(false);
    const [loadingQuestions, setLoadingQuestions] = useState(false);
    const [query, setQuery] = useState('');
    const [error, setError] = useState('');
    const [selectedMap, setSelectedMap] = useState(() => {
        const map = {};
        initialSelected.forEach((q) => { if (q && q.id != null) map[q.id] = q; });
        return map;
    });

    const selectedList = useMemo(() => Object.values(selectedMap), [selectedMap]);

    useEffect(() => {
        let alive = true;
        (async () => {
            setLoadingChapters(true);
            setError('');
            try {
                const res = await axios.post('/api/questions/chapters', {});
                if (!alive) return;
                const list = Array.isArray(res.data?.chapters) ? res.data.chapters : [];
                setChapters(list);
                const firstNonEmpty = list.find((c) => c.count > 0) || list[0];
                setActiveChapter(firstNonEmpty?.chapter || '');
            } catch (e) {
                if (alive) setError(e.response?.data?.error || '获取章节失败');
            } finally {
                if (alive) setLoadingChapters(false);
            }
        })();
        return () => { alive = false; };
    }, []);

    const loadQuestions = useCallback(async (chapter, q) => {
        if (!chapter) { setQuestions([]); return; }
        setLoadingQuestions(true);
        setError('');
        try {
            const res = await axios.post('/api/questions/search', { chapter, query: q || '', limit: 50 });
            setQuestions(Array.isArray(res.data?.results) ? res.data.results : []);
        } catch (e) {
            setQuestions([]);
            setError(e.response?.data?.error || '获取题目失败');
        } finally {
            setLoadingQuestions(false);
        }
    }, []);

    useEffect(() => {
        if (activeChapter) loadQuestions(activeChapter, '');
        setQuery('');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeChapter]);

    const toggle = (q) => setSelectedMap((prev) => {
        const next = { ...prev };
        if (next[q.id]) delete next[q.id];
        else next[q.id] = q;
        return next;
    });

    const tagsOf = (q) => {
        if (Array.isArray(q.concept_tags)) return q.concept_tags;
        if (typeof q.concept_tags === 'string') return q.concept_tags.split(',').map((t) => t.trim()).filter(Boolean);
        return [];
    };

    return (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4" onMouseDown={onClose}>
            <div
                className="bg-white rounded-xl border border-[#DEE2E6] shadow-xl w-full max-w-5xl h-[80vh] flex flex-col overflow-hidden"
                onMouseDown={(e) => e.stopPropagation()}
            >
                {/* 头部 */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#E9ECEF]">
                    <div className="flex items-center gap-2">
                        <BookOpen size={17} className="text-[#212529]" />
                        <h3 className="text-base font-semibold text-[#212529] m-0">从题库选题</h3>
                        <span className="text-xs text-[#868E96]">按教材章节浏览，点击题目卡片勾选</span>
                    </div>
                    <button onClick={onClose} className="text-[#868E96] hover:text-[#212529]" aria-label="关闭">
                        <X size={18} />
                    </button>
                </div>

                {error && (
                    <div className="mx-5 mt-3 text-sm text-[#dc3545] bg-[#FFF5F5] border border-[#FFE3E3] rounded-md px-3 py-2">
                        {error}
                    </div>
                )}

                {/* 主体：左章节 + 右题目 */}
                <div className="flex-1 grid grid-cols-[220px_1fr] min-h-0">
                    {/* 左：章节列表 */}
                    <aside className="border-r border-[#E9ECEF] overflow-y-auto bg-[#FAFBFC]">
                        {loadingChapters ? (
                            <div className="p-4 text-sm text-[#868E96] text-center">加载章节...</div>
                        ) : (
                            <ul>
                                {chapters.map((c) => {
                                    const active = c.chapter === activeChapter;
                                    return (
                                        <li key={c.chapter}>
                                            <button
                                                type="button"
                                                onClick={() => setActiveChapter(c.chapter)}
                                                disabled={c.count === 0}
                                                className={`w-full text-left px-4 py-2.5 flex items-center justify-between text-sm transition-colors ${
                                                    active ? 'bg-[#212529] text-white' : 'text-[#212529] hover:bg-[#F1F3F5]'
                                                } ${c.count === 0 ? 'opacity-45 cursor-not-allowed' : ''}`}
                                            >
                                                <span className="truncate">{c.chapter}</span>
                                                <span className={`text-xs font-mono ${active ? 'text-white/70' : 'text-[#868E96]'}`}>{c.count}</span>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                    </aside>

                    {/* 右：搜索 + 题目卡片 */}
                    <section className="flex flex-col min-h-0">
                        <div className="px-4 py-3 border-b border-[#E9ECEF] flex items-center gap-2">
                            <div className="flex items-center gap-2 flex-1 h-9 px-3 border border-[#DEE2E6] rounded-md focus-within:border-[#212529]">
                                <Search size={15} className="text-[#868E96]" />
                                <input
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); loadQuestions(activeChapter, query); } }}
                                    placeholder={`在「${activeChapter || '本章'}」内搜索题干 / 知识点`}
                                    className="flex-1 text-sm outline-none bg-transparent"
                                />
                            </div>
                            <button
                                type="button"
                                onClick={() => loadQuestions(activeChapter, query)}
                                className="h-9 px-3 text-sm text-white bg-[#212529] border border-[#212529] rounded-md hover:bg-black transition-colors"
                            >
                                检索
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-4 space-y-3">
                            {loadingQuestions ? (
                                <div className="py-10 flex items-center justify-center text-sm text-[#868E96]">
                                    <Loader2 size={16} className="animate-spin mr-2" /> 加载题目...
                                </div>
                            ) : questions.length === 0 ? (
                                <div className="py-10 text-center text-sm text-[#868E96] border border-dashed border-[#DEE2E6] rounded-lg">
                                    本章暂无匹配题目。
                                </div>
                            ) : (
                                questions.map((q) => {
                                    const checked = Boolean(selectedMap[q.id]);
                                    return (
                                        <button
                                            key={q.id}
                                            type="button"
                                            onClick={() => toggle(q)}
                                            className={`w-full text-left border rounded-lg p-3 transition-colors ${
                                                checked ? 'border-[#212529] bg-[#F8F9FA]' : 'border-[#E9ECEF] bg-white hover:border-[#ADB5BD]'
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-2 mb-1">
                                                <div className="flex items-center gap-2 flex-wrap text-xs text-[#868E96]">
                                                    <strong className="text-[#212529]">{q.exercise_number || `题目 #${q.id}`}</strong>
                                                    <span>{q.textbook_name}{q.page_num ? ` · 第 ${q.page_num} 页` : ''}</span>
                                                    {q.question_type && <span className="px-1.5 py-0.5 bg-[#F1F3F5] rounded text-[#495057]">{q.question_type}</span>}
                                                    {q.exercise_type && <span className="px-1.5 py-0.5 bg-[#F1F3F5] rounded text-[#495057]">{q.exercise_type === 'example' ? '例题' : '习题'}</span>}
                                                </div>
                                                <span className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border ${
                                                    checked ? 'bg-[#212529] border-[#212529] text-white' : 'border-[#CED4DA] text-transparent'
                                                }`}>
                                                    <Check size={13} />
                                                </span>
                                            </div>
                                            <div className="text-sm text-[#212529] question-picker__stem">
                                                <AiResponse content={q.stem || ''} />
                                            </div>
                                            {tagsOf(q).length > 0 && (
                                                <div className="mt-1.5 flex flex-wrap gap-1">
                                                    {tagsOf(q).map((t) => (
                                                        <span key={t} className="text-[11px] px-1.5 py-0.5 bg-[#EEF2FF] text-[#3730A3] rounded">{t}</span>
                                                    ))}
                                                </div>
                                            )}
                                        </button>
                                    );
                                })
                            )}
                        </div>
                    </section>
                </div>

                {/* 底部：已选 + 操作 */}
                <div className="flex items-center justify-between px-5 py-3 border-t border-[#E9ECEF] bg-[#FAFBFC]">
                    <span className="text-sm text-[#495057]">已选 <strong className="text-[#212529]">{selectedList.length}</strong> 题</span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3 py-1.5 text-sm text-[#495057] bg-white border border-[#DEE2E6] rounded-md hover:border-[#212529] hover:text-[#212529] transition-colors"
                        >
                            取消
                        </button>
                        <button
                            type="button"
                            onClick={() => onConfirm(selectedList)}
                            className="px-3 py-1.5 text-sm text-white bg-[#212529] border border-[#212529] rounded-md hover:bg-black transition-colors inline-flex items-center gap-1.5"
                        >
                            <Check size={14} /> 确认选择（{selectedList.length}）
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default QuestionBankPicker;
