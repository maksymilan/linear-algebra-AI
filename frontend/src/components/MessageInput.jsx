// src/components/MessageInput.jsx

import React, { useRef } from 'react';
import FilePreview from './FilePreview';
import { CircleStop, Paperclip, Send } from 'lucide-react';

const MessageInput = ({ input, setInput, files, setFiles, onSend, onCancel, isLoading }) => {
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

  const handleCancel = (e) => {
    e.preventDefault();
    e.stopPropagation();
    onCancel();
  };

  return (
    <div className="chat-composer">
      <input
        type="file"
        multiple
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <FilePreview files={files} onRemove={handleRemoveFile} />
      <form className="chat-composer__form" onSubmit={handleSubmit}>
        <button type="button" className="chat-composer__icon" onClick={() => fileInputRef.current?.click()} disabled={isLoading} title="上传文件" aria-label="上传文件">
          <Paperclip size={20} />
        </button>
        <textarea
          className="chat-composer__textarea"
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
        {isLoading ? (
          <button
            type="button"
            className="chat-composer__icon chat-composer__icon--cancel"
            onClick={handleCancel}
            title="取消本次对话"
            aria-label="取消本次对话"
          >
            <CircleStop size={20} />
          </button>
        ) : (
          <button 
            type="submit" 
            className="chat-composer__icon chat-composer__icon--send"
            disabled={input.trim() === '' && files.length === 0} 
            title="发送"
            aria-label="发送"
          >
            <Send size={20} />
          </button>
        )}
      </form>
    </div>
  );
};

export default MessageInput;
