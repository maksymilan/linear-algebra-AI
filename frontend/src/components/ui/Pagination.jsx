import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import Button from './Button';

const Pagination = ({ page, totalPages, total, canPrev, canNext, onPrev, onNext }) => (
  <div className="ui-pagination">
    <div className="ui-pagination__summary">
      第 {page} 页
      {totalPages != null ? ` / 共 ${totalPages} 页` : ''}
      {total != null ? ` · ${total} 项` : ''}
    </div>
    <div className="ui-pagination__actions">
      <Button icon={ChevronLeft} size="sm" onClick={onPrev} disabled={!canPrev}>上一页</Button>
      <Button icon={ChevronRight} size="sm" onClick={onNext} disabled={!canNext}>下一页</Button>
    </div>
  </div>
);

export default Pagination;
