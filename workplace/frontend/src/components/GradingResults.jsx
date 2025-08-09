import React from 'react';

const GradingResults = ({ selectedResult }) => {
    return (
        <div className="results-section">
            {selectedResult ? (
                <>
                    <h3>批改结果: {selectedResult.filename}</h3>
                    <div className="correction-content" dangerouslySetInnerHTML={{ __html: selectedResult.correction }}></div>
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