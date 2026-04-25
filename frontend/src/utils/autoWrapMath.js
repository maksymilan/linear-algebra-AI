// 自动给"裸 LaTeX 命令"补 $...$ 包裹，提升 KaTeX 渲染成功率。
//
// 背景：
//   OCR 模型（Qwen-VL / GPT-4V 等）在识别教材时偶尔漏写 $，导致 \alpha \beta
//   \frac{a}{b} 等 LaTeX 命令在前端被当作字面字符展示。
//   我们在渲染前做一次"兜底包裹"，把**不在 $...$ 内**的 LaTeX 命令段补上 $。
//
// 设计要点：
// 1. 线性扫描：遇到 $ 就跳过到下一个 $（保留已存在的数学段原样）；
// 2. 识别"数学片段"：以 LaTeX 命令（\xxx）、上下标 ^_ 开头，贪婪吃掉相邻的
//    命令 / 花括号参数 / 下标上标，整段统一包在一对 $ 里，避免断裂；
// 3. 白名单策略：命令必须由字母组成（\alpha, \frac, \cdot…），这样中文文本
//    里偶发的反斜杠片段（极少见）不会被误伤。
//
// 局限：极少数"文档讲解反斜杠"的文本可能被误包，但在线代/数学教材语境下
// 几乎不存在。

// 一段"数学片段"的贪婪匹配：
//   \cmd 或 \cmd{...}（递归一层足够覆盖 \frac{\alpha}{\beta} 这种）
//   或 ^/_ 后跟 {..} / 单字符
//   相邻多段视为一个整体（中间允许极少数非字母字符，如 + - , 空格）
const MATH_SEG_RE =
  /(?:\\[A-Za-z]+(?:\{[^{}$]*\})*|[_^]\{[^{}$]*\}|[_^][A-Za-z0-9])(?:\s*(?:\\[A-Za-z]+(?:\{[^{}$]*\})*|[_^]\{[^{}$]*\}|[_^][A-Za-z0-9]|[=+\-*/.,]|\d+))*/;

// 已经确定是"数学命令"开头的特征：避免把反斜杠转义的日常字符（如 \n 实际不会出现于 OCR 文本）误当数学
const LOOKS_LIKE_MATH_RE = /\\[A-Za-z]+|[_^][A-Za-z0-9{]/;

/**
 * @param {string} text
 * @returns {string}
 */
export function autoWrapMath(text) {
  if (!text || typeof text !== 'string') return text || '';
  if (!LOOKS_LIKE_MATH_RE.test(text)) return text;

  // 先把原文拆成 [math | plain] 片段，math 段原样保留，避免对已有 $...$ 二次包裹
  const parts = [];
  let i = 0;
  const n = text.length;

  while (i < n) {
    const ch = text[i];
    if (ch === '$') {
      const isDouble = text[i + 1] === '$';
      const delim = isDouble ? '$$' : '$';
      const end = text.indexOf(delim, i + delim.length);
      if (end === -1) {
        parts.push({ kind: 'plain', seg: text.slice(i) });
        i = n;
        break;
      }
      parts.push({ kind: 'math', seg: text.slice(i, end + delim.length) });
      i = end + delim.length;
    } else {
      const j = text.indexOf('$', i);
      if (j === -1) {
        parts.push({ kind: 'plain', seg: text.slice(i) });
        i = n;
        break;
      }
      parts.push({ kind: 'plain', seg: text.slice(i, j) });
      i = j;
    }
  }

  // 对 plain 片段逐一扫描、包裹
  const wrapped = parts.map(({ kind, seg }) => {
    if (kind === 'math' || !seg) return seg;
    let out = '';
    let k = 0;
    while (k < seg.length) {
      MATH_SEG_RE.lastIndex = 0;
      const sub = seg.slice(k);
      const m = sub.match(MATH_SEG_RE);
      if (!m) {
        out += sub;
        break;
      }
      const s = m.index;
      const e = s + m[0].length;
      out += sub.slice(0, s) + `$${m[0]}$`;
      k += e;
    }
    return out;
  });

  return wrapped.join('');
}

export default autoWrapMath;
