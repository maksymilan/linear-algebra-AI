import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import FileUploadButton from './FileUploadButton';
import FileStatus from './FileStatus';

const GradingWorkflow = ({
    problemText,
    setProblemText,
    solutionText,
    setSolutionText,
    handleFileOcr,
    problemFiles,
    solutionFiles,
    ocrLoading,
    removeFile
}) => {
    return (
        <div className="grading-workflow">
            <div className="workflow-step">
                <div className="step-header">
                    <span className="step-number">1</span>
                    <h2>提供题目</h2>
                </div>
                <p>在下方输入或上传图片/PDF识别题目，并进行编辑确认。</p>
                <textarea
                    value={problemText}
                    onChange={(e) => setProblemText(e.target.value)}
                    placeholder="在此处手动输入或编辑识别后的题目..."
                    rows="8"
                    className="problem-textarea"
                />
                <div className="file-upload-area">
                    <FileUploadButton
                        id="problem-file-input"
                        onChange={(e) => handleFileOcr(e.target.files[0], 'problem')}
                        isLoading={ocrLoading.problem !== null}
                        accept=".pdf,.jpg,.jpeg,.png"
                    >
                        上传文件识别
                    </FileUploadButton>
                    <div className="file-status-list">
                        <AnimatePresence>
                            {problemFiles.map(file => (
                                <FileStatus
                                    key={file.id}
                                    file={file}
                                    onRemove={id => removeFile(id, 'problem')}
                                />
                            ))}
                        </AnimatePresence>
                    </div>
                </div>
            </div>

            <div className="workflow-step">
                <div className="step-header">
                    <span className="step-number">2</span>
                    <h2>提供解答</h2>
                </div>
                <p>上传您的解答图片或PDF，系统将自动识别，您可以在下方进行编辑确认。</p>
                <textarea
                    value={solutionText}
                    onChange={(e) => setSolutionText(e.target.value)}
                    placeholder="解答识别结果将显示在此处，请编辑确认..."
                    rows="8"
                    className="problem-textarea"
                />
                <div className="file-upload-area">
                    <FileUploadButton
                        id="solution-file-input"
                        onChange={(e) => handleFileOcr(e.target.files[0], 'solution')}
                        isLoading={ocrLoading.solution !== null}
                        accept=".pdf,.jpg,.jpeg,.png"
                    >
                        上传解答文件
                    </FileUploadButton>
                    <div className="file-status-list">
                        <AnimatePresence>
                            {solutionFiles.map(file => (
                                <FileStatus
                                    key={file.id}
                                    file={file}
                                    onRemove={id => removeFile(id, 'solution')}
                                />
                            ))}
                        </AnimatePresence>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GradingWorkflow;