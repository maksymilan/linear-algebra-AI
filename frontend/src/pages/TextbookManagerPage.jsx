import React from 'react';
import TextbookManager from '../components/TextbookManager';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const TextbookManagerPage = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-[#F8F9FA] p-8">
      <div className="max-w-5xl mx-auto">
        <button 
          onClick={() => navigate('/workspace')} 
          className="flex items-center gap-2 text-[#868E96] hover:text-black transition-colors mb-6"
        >
          <ArrowLeft size={20} />
          返回工作区
        </button>
        <TextbookManager />
      </div>
    </div>
  );
};

export default TextbookManagerPage;
