// src/components/MessageInput.jsx

import React, { useRef } from 'react';
import FilePreview from './FilePreview';
import { Paperclip, Send } from 'lucide-react';

const MessageInput = ({ input, setInput, files, setFiles, onSend, isLoading }) => {
  const fileInputRef = useRef(null);

  const handleFileChange = (event) => {
    if (event.target.files) {
      setFiles(prevFiles => [...prevFiles, ...Array.from(event.target.files)]);
    }
  };

  const handleRemoveFile = (indexToRemove) => {
    setFiles(prevFiles => prevFiles.filter((_, index) => index !== indexToRemove));
    if (fileInputRef.current) {
        fileInputRef.current.value = "";
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSend();
  };

  return (
    <div className="bg-white p-4 flex flex-col gap-2 relative">
      <input
        type="file"
        multiple
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <FilePreview files={files} onRemove={handleRemoveFile} />
      <form className="flex items-end gap-3 max-w-4xl mx-auto w-full bg-white border border-[#DEE2E6] rounded-2xl p-2 shadow-sm focus-within:border-black transition-colors" onSubmit={handleSubmit}>
        <button type="button" className="p-2.5 text-[#868E96] hover:text-black transition-colors rounded-xl flex-shrink-0" onClick={() => fileInputRef.current?.click()} disabled={isLoading} title="上传文件">
          <Paperclip size={20} />
        </button>
        <textarea
          className="flex-1 max-h-48 min-h-[44px] bg-transparent text-[#212529] placeholder-[#868E96] resize-none outline-none py-3 text-[15px] leading-relaxed"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="给助教发送消息..."
          disabled={isLoading}
          rows="1"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />
        <button 
          type="submit" 
          className={`p-2.5 rounded-xl flex-shrink-0 transition-colors ${
            input.trim() || files.length > 0 ? 'bg-black text-white hover:bg-gray-800 shadow-md' : 'bg-gray-100 text-gray-400 cursor-not-allowed'
          }`}
          disabled={isLoading || (input.trim() === '' && files.length === 0)} 
          title="发送"
        >
          <Send size={20} />
        </button>
      </form>
    </div>
  );
};

export default MessageInput;