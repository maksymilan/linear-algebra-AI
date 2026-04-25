// src/components/FilePreview.jsx
import React from 'react';

const FilePreview = ({ files, onRemove }) => {
  if (files.length === 0) {
    return null;
  }

  return (
    <div className="file-preview-area">
      {files.map((file, i) => (
        <div key={i} className="file-tag">
          <span className="file-name">{file.name}</span>
          <button 
            onClick={() => onRemove(i)} 
            className="remove-file-button" 
            title={`移除文件 ${file.name}`}
          >
            × 
          </button>
        </div>
      ))}
    </div>
  );
};

export default FilePreview;