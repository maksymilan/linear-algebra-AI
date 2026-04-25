DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

CREATE EXTENSION IF NOT EXISTS vector; 

-- 1. 班级表 (核心组织架构) 
CREATE TABLE classes ( 
    id SERIAL PRIMARY KEY, 
    name VARCHAR(255) NOT NULL, 
    invite_code VARCHAR(6) UNIQUE NOT NULL, -- 6位随机全大写英数混合 
    teacher_id INTEGER NOT NULL, 
    current_week INTEGER DEFAULT 1,         -- 教学进度控制 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP 
); 

-- 2. 用户表 (通过 class_id 建立 1对1 班级关系) 
CREATE TABLE users ( 
    id SERIAL PRIMARY KEY, 
    username VARCHAR(50) UNIQUE NOT NULL, 
    password_hash VARCHAR(255) NOT NULL, 
    role VARCHAR(20) NOT NULL, -- 'student' or 'teacher' 
    class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL, 
    email VARCHAR(255) UNIQUE NOT NULL, -- 为了兼容原本的 auth handler
    user_id_no VARCHAR(50) UNIQUE NOT NULL, -- 为了兼容原本的 auth handler
    display_name VARCHAR(100),
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP 
); 

-- 3. 课本知识库表 (RAG) 
CREATE TABLE textbook_chunks ( 
    id SERIAL PRIMARY KEY, 
    textbook_name VARCHAR(255), 
    content TEXT NOT NULL, 
    embedding vector(1536),                 -- 根据 Qwen 向量维度调整 
    week_num INTEGER NOT NULL,              -- 该片段对应的教学周 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP 
); 

-- 4. 聊天记录表 (新增 RLHF 评价反馈) 
CREATE TABLE chat_messages ( 
    id SERIAL PRIMARY KEY, 
    session_id INTEGER NOT NULL, 
    role VARCHAR(20) NOT NULL, 
    content TEXT NOT NULL, 
    feedback_score SMALLINT DEFAULT 0,      -- 1: 有帮助, -1: 没看懂, 0: 未评价 
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP 
); 

-- 5. 个性化学情图谱表 (增量画像) 
CREATE TABLE student_concept_profiles ( 
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE, 
    concept_name VARCHAR(100) NOT NULL,     -- 如 "矩阵乘法", "特征值" 
    mastery_score INTEGER DEFAULT 50,       -- 掌握度 0-100 
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP, 
    PRIMARY KEY (user_id, concept_name) 
);
