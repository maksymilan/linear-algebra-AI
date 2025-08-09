import React from 'react';
import './FileUploadButton.css';

// Spinner组件也可以放在这里，或者一个更通用的UI组件文件中
const Spinner = () => <div className="spinner"></div>;

const FileUploadButton = ({ id, onChange, isLoading, children, accept }) => {
  return (
    <div className="upload-button-wrapper">
      <label htmlFor={id} className="custom-file-upload">
        {children}
      </label>
      <input 
        type="file" 
        id={id} 
        onChange={onChange} 
        accept={accept} 
        disabled={isLoading}
      />
      {isLoading && <Spinner />}
    </div>
  );
};

export default FileUploadButton;