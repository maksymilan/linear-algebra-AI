// src/components/MessageInput.jsx

import React, { useRef } from 'react';
import FilePreview from './FilePreview';

const PaperclipIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>;

// --- 新的发送按钮图标 (纸飞机/信封) ---
const SendIcon = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4l17.4-8.4c.8-.4.8-1.6 0-2L3.4 1.6c-.6-.3-1.4.3-1.2.9l2.8 14.4c.2.8 1.2 1 1.6.3l4-4.5c.3-.3.8-.3 1.1 0l4 4.5c.5.6 1.4.5 1.6-.3l2.8-14.4c.2-.6-.6-1.2-1.2-.9L3.4 12c-.8.4-.8 1.6 0 2l17.4 8.4z"></path></svg>;

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
    <>
      <FilePreview files={files} onRemove={handleRemoveFile} />
      <form className="message-form" onSubmit={handleSubmit}>
        <button type="button" className="attach-button" onClick={() => fileInputRef.current?.click()} disabled={isLoading} title="Attach files">
          <PaperclipIcon />
        </button>
        <textarea
          className="text-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="输入您的问题，或上传文件..."
          disabled={isLoading}
          rows="1"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
        />
        <button type="submit" className="send-button" disabled={isLoading || (input.trim() === '' && files.length === 0)} title="Send">
          <SendIcon />
        </button>
      </form>
    </>
  );
};

export default MessageInput;