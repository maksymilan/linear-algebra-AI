import React from 'react';
import AiResponse from './AiResponse'; // 1. 导入新组件

const GradingResults = ({ selectedResult }) => {
    return (
        <div className="results-section">
            {selectedResult ? (
                <>
                    <h3>批改结果: {selectedResult.filename}</h3>
                    {/* 2. 使用AiResponse组件替换原来的div */}
                    <div className="correction-content">
                       <AiResponse content={selectedResult.correction} />
                    </div>
                </>
            ) : (
                <div className="no-result">
                    <p>提交作业后，将在此处显示批改结果</p>
                </div>
            )}
        </div>
    );
};

export default GradingResults;