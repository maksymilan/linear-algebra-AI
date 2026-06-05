DROP SCHEMA public CASCADE;
CREATE SCHEMA public;

CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm; -- 题库关键词模糊检索

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

CREATE TABLE textbook_exercises (
    id SERIAL PRIMARY KEY,
    textbook_id INTEGER,
    textbook_name VARCHAR(255) NOT NULL,
    page_num INTEGER,
    exercise_number VARCHAR(100),
    stem TEXT NOT NULL,
    answer TEXT,
    solution TEXT,
    concepts TEXT,                          -- 旧的自由文本概念（保留兼容）
    concept_tags TEXT[],                    -- 受控知识点标准 tag
    exercise_type VARCHAR(20),              -- example=例题 / homework=课后习题
    question_type VARCHAR(20),              -- 计算/证明/选择/填空/判断/简答
    has_answer BOOLEAN DEFAULT FALSE,       -- 是否带答案或解析
    source_excerpt TEXT,
    embedding vector(1536),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_textbook_exercises_embedding
ON textbook_exercises USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX idx_textbook_exercises_stem_trgm
ON textbook_exercises USING gin (stem gin_trgm_ops);

CREATE INDEX idx_textbook_exercises_concept_tags
ON textbook_exercises USING gin (concept_tags);

CREATE TABLE model_usage_daily (
    user_id INTEGER NOT NULL,
    usage_date DATE NOT NULL DEFAULT CURRENT_DATE,
    bucket VARCHAR(100) NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, usage_date, bucket)
);

-- 4. 聊天记录表 (新增 RLHF 评价反馈) 
CREATE TABLE chat_messages ( 
    id SERIAL PRIMARY KEY, 
    session_id INTEGER NOT NULL, 
    role VARCHAR(20) NOT NULL, 
    content TEXT NOT NULL, 
    feedback_score SMALLINT DEFAULT 0,      -- 1: 有帮助, -1: 没看懂, 0: 未评价 
    response_duration_ms INTEGER,           -- AI 回复生成耗时，单位毫秒
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
