import React from 'react';
import { motion as _motion } from 'framer-motion';
import './FileStatus.css';

const Spinner = () => <div className="spinner"></div>;

const FileStatus = ({ file, onRemove }) => (
    <_motion.div
        className="file-status"
        layout
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.3 }}
    >
        {file.isLoading ? (
            <div className="spinner file-status-icon"></div>
        ) : (
            <span className="file-status-icon">📄</span>
        )}
        <span className="file-status-name">{file.name}</span>
        {!file.isLoading && onRemove && (
            <button onClick={() => onRemove(file.id)} className="delete-btn" style={{ display: 'block', position: 'static', fontSize: '1rem' }}>×</button>
        )}
    </_motion.div>
);

export default FileStatus;
