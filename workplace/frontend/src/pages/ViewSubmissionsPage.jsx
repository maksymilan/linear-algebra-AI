import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import AiResponse from '../components/AiResponse';
import './ListPage.css';

const ViewSubmissionsPage = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [assignment, setAssignment] = useState(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchSubmissions = async () => {
            try {
                const response = await axios.get(`/api/assignments/${id}`);
                setAssignment(response.data);
            } catch (error) {
                console.error("Failed to fetch submissions:", error);
            } finally {
                setIsLoading(false);
            }
        };
        fetchSubmissions();
    }, [id]);

    return (
        <div className="list-page-container">
            <button className="back-button" onClick={() => navigate('/assignments')}>← 返回作业列表</button>
            <h1>{assignment?.title} - 提交情况</h1>
            {isLoading ? <p>加载中...</p> : (
                <div className="submission-list">
                    {assignment?.submissions?.length > 0 ? (
                        assignment.submissions.map(sub => (
                            <details key={sub.id} className="submission-card">
                                <summary>
                                    <strong>{sub.studentName}</strong> 提交于 {new Date(sub.createdAt).toLocaleString()}
                                </summary>
                                <div className="submission-content">
                                    <h3>学生解答</h3>
                                    <pre>{sub.solutionText}</pre>
                                    <hr />
                                    <h3>AI 批改意见</h3>
                                    <AiResponse content={sub.correction} />
                                </div>
                            </details>
                        ))
                    ) : <p>暂无学生提交。</p>}
                </div>
            )}
        </div>
    );
};

export default ViewSubmissionsPage;