"""线性代数受控知识点词表 + 题型/题目类型枚举。

用途：
1. 抽题时把 `concepts_prompt_block()` 附到 LLM prompt，要求模型**只从词表里选** concept tag，
   避免自由发挥产生「矩阵乘法 / 矩阵的乘法」这类同义碎片。
2. 入库前用 `map_to_standard()` 做兜底校验，把模型输出规整到标准 tag，过滤掉不在词表内的项。
3. `QUESTION_TYPES` / `EXERCISE_TYPES` 供抽题 prompt 和题库检索 API 共用，保证取值受控。
"""

import re
from typing import Iterable, List, Union


# ---------------------------------------------------------------------------
# 受控知识点词表（章 → 知识点）
# ---------------------------------------------------------------------------
CONCEPT_TAXONOMY: dict[str, List[str]] = {
    "线性方程组": [
        "高斯消元法",
        "线性方程组的初等变换",
        "齐次线性方程组",
        "非齐次线性方程组",
        "线性方程组解的判定",
        "线性方程组解的结构",
        "阶梯形方程组",
    ],
    "矩阵": [
        "矩阵的运算",
        "矩阵乘法",
        "矩阵的初等变换",
        "初等矩阵",
        "逆矩阵",
        "矩阵的秩",
        "分块矩阵",
        "矩阵的转置",
        "伴随矩阵",
    ],
    "行列式": [
        "排列与逆序数",
        "行列式的定义",
        "行列式的性质",
        "行列式按行列展开",
        "余子式与代数余子式",
        "克拉默法则",
        "范德蒙德行列式",
    ],
    "向量与向量空间": [
        "向量的线性运算",
        "线性组合与线性表示",
        "线性相关与线性无关",
        "向量组的秩",
        "极大线性无关组",
        "向量空间",
        "基与维数",
        "坐标与过渡矩阵",
        "子空间",
    ],
    "内积与正交": [
        "向量的内积",
        "向量的长度与夹角",
        "正交向量组",
        "标准正交基",
        "施密特正交化",
        "正交矩阵",
    ],
    "特征值与特征向量": [
        "特征值与特征向量",
        "特征多项式",
        "相似矩阵",
        "矩阵的相似对角化",
        "实对称矩阵的对角化",
    ],
    "二次型": [
        "二次型及其矩阵",
        "二次型的标准形",
        "配方法",
        "合同变换",
        "惯性定理",
        "正定二次型",
        "正定矩阵",
    ],
    "线性变换": [
        "线性变换的定义",
        "线性变换的矩阵",
        "线性空间",
    ],
}

# 扁平化的全部标准 tag
ALL_CONCEPTS: List[str] = [tag for tags in CONCEPT_TAXONOMY.values() for tag in tags]

# 题型（受控）。抽不出时用空字符串。
QUESTION_TYPES: List[str] = ["计算", "证明", "选择", "填空", "判断", "简答"]

# 题目来源类型：example=正文例题（通常带解答），homework=课后习题（通常无解答）
EXERCISE_TYPES: List[str] = ["example", "homework"]


# ---------------------------------------------------------------------------
# 常见别名 / 同义词 → 标准 tag
# ---------------------------------------------------------------------------
_ALIASES: dict[str, str] = {
    "矩阵的乘法": "矩阵乘法",
    "矩阵的逆": "逆矩阵",
    "可逆矩阵": "逆矩阵",
    "逆阵": "逆矩阵",
    "秩": "矩阵的秩",
    "初等行变换": "矩阵的初等变换",
    "初等列变换": "矩阵的初等变换",
    "行列式展开": "行列式按行列展开",
    "代数余子式": "余子式与代数余子式",
    "余子式": "余子式与代数余子式",
    "克莱姆法则": "克拉默法则",
    "克拉默规则": "克拉默法则",
    "线性无关": "线性相关与线性无关",
    "线性相关": "线性相关与线性无关",
    "线性表示": "线性组合与线性表示",
    "线性组合": "线性组合与线性表示",
    "特征向量": "特征值与特征向量",
    "特征值": "特征值与特征向量",
    "对角化": "矩阵的相似对角化",
    "相似对角化": "矩阵的相似对角化",
    "施密特正交化方法": "施密特正交化",
    "正交化": "施密特正交化",
    "内积": "向量的内积",
    "二次型的矩阵": "二次型及其矩阵",
    "正定": "正定二次型",
}


def _normalize(s: str) -> str:
    """归一化：去首尾空白/标点、去除内部空格。"""
    s = str(s).strip().strip("，,。.、；;：:（）()【】[]「」 ")
    return s.replace(" ", "").replace("　", "")


_NORM_TO_STANDARD: dict[str, str] = {_normalize(c): c for c in ALL_CONCEPTS}
_NORM_ALIASES: dict[str, str] = {_normalize(k): v for k, v in _ALIASES.items()}


def _match_one(raw: str) -> Union[str, None]:
    n = _normalize(raw)
    if not n:
        return None
    if n in _NORM_ALIASES:
        return _NORM_ALIASES[n]
    if n in _NORM_TO_STANDARD:
        return _NORM_TO_STANDARD[n]
    # 仅当某个标准 tag 完整出现在 raw 描述里时才采用（取最长匹配）。
    # 不做反向（raw ⊂ 标准 tag）模糊匹配，否则「矩阵」这类泛词会误命中「矩阵的相似对角化」。
    # 常见泛词缩写（特征值、对角化、秩…）已由 _ALIASES 覆盖。
    best = None
    best_len = 0
    for norm_std, std in _NORM_TO_STANDARD.items():
        if norm_std in n and len(norm_std) > best_len:
            best = std
            best_len = len(norm_std)
    return best


def map_to_standard(raw_concepts: Union[str, Iterable[str]], max_tags: int = 5) -> List[str]:
    """把 LLM 抽取的概念（字符串数组或逗号串）规整为受控标准 tag，去重保序。"""
    if raw_concepts is None:
        return []
    if isinstance(raw_concepts, str):
        items = re.split(r"[，,、;；/]", raw_concepts)
    else:
        items = list(raw_concepts)

    result: List[str] = []
    seen = set()
    for raw in items:
        tag = _match_one(raw)
        if tag and tag not in seen:
            seen.add(tag)
            result.append(tag)
        if len(result) >= max_tags:
            break
    return result


def normalize_question_type(raw: str) -> str:
    """把模型输出的题型规整到受控集合，识别不了返回空串。"""
    n = _normalize(raw)
    if not n:
        return ""
    for qt in QUESTION_TYPES:
        if qt in n or n in qt:
            return qt
    # 常见变体
    if "证" in n:
        return "证明"
    if "算" in n or "求" in n:
        return "计算"
    return ""


def concepts_prompt_block() -> str:
    """生成附到抽题 prompt 里的受控知识点清单（按章组织）。"""
    lines = ["可选知识点（concept_tags 只能从下列词中选择，最多 3 个，选不出留空数组）："]
    for chapter, tags in CONCEPT_TAXONOMY.items():
        lines.append(f"- {chapter}：{ '、'.join(tags) }")
    return "\n".join(lines)
