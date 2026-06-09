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
// 注意：排除 \begin / \end —— 它们是环境命令，必须由 LATEX_ENV_RE 成对包成 $$。
// 截断的引用片段里常出现"孤立无配对的 \begin{cases}"，若被当行内命令包进 $...$ 会让 KaTeX 报错变红字；
// 排除后这类残片保持原文（可读、不红），完整成对的环境仍由 wrapPlainMath 正常渲染。
const MATH_SEG_RE =
  /(?:\\(?!begin|end)[A-Za-z]+(?:\{[^{}$]*\})*|[_^]\{[^{}$]*\}|[_^][A-Za-z0-9])(?:\s*(?:\\(?!begin|end)[A-Za-z]+(?:\{[^{}$]*\})*|[_^]\{[^{}$]*\}|[_^][A-Za-z0-9]|[=+\-*/.,]|\d+))*/;

// 已经确定是"数学命令"开头的特征：避免把反斜杠转义的日常字符（如 \n 实际不会出现于 OCR 文本）误当数学
const LOOKS_LIKE_MATH_RE = /\\[A-Za-z]+|[_^][A-Za-z0-9{]/;

// \begin{cases}...\end{cases} 这类环境如果没有 $$ 包裹，remark-math 不会识别。
// 只在 plain 段处理，已有 $...$ / $$...$$ 的内容保持原样。
const LATEX_ENV_RE = /\\begin\{([A-Za-z*]+)\}[\s\S]*?\\end\{\1\}/g;

// 去掉数学片段里游离的 $（部分模型会在 \(...\) / \[...\] 内部又乱撒 $，
// 例如 \(v$_2 =$ n $\times$ v$_1$\)，会把渲染彻底打断）。保留被转义的 \$。
const ESC_DOLLAR_SENTINEL = ' ESCDOLLAR ';
function stripStrayDollars(s) {
  return s
    .replace(/\\\$/g, ESC_DOLLAR_SENTINEL) // 先把被转义的 \$ 暂存为占位符
    .replace(/\$/g, '') // 去掉游离的 $
    .replace(new RegExp(ESC_DOLLAR_SENTINEL, 'g'), '\\$'); // 还原字面 \$
}

// 关键修复：remark-math 只认 $...$ / $$...$$，不认 LaTeX 原生定界符 \( \) 和 \[ \]。
// 不少模型（尤其批改答疑链路）输出 \(...\) / \[...\]，导致整段公式被当字面字符渲染。
// 这里在渲染前统一把它们规范成 $ / $$，并清理内部游离的 $。
function normalizeMathDelimiters(text) {
  // \[ ... \] -> $$ ... $$ （独立公式）
  text = text.replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => `$$${stripStrayDollars(inner)}$$`);
  // \( ... \) -> $ ... $ （行内公式）
  text = text.replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => `$${stripStrayDollars(inner)}$`);
  return text;
}

// 截断的 OCR 片段（典型如教材检索引用）常出现奇数个 $$ 或 $——公式被从中间截开，
// 定界符配对错位会把大段正文吞进公式、整体渲染崩坏。检测到不平衡时移除该类定界符，
// 改由 wrapInlineMath 给裸 LaTeX 命令逐个补 $（\begin{}\end{} 环境仍会被 wrapPlainMath
// 重新包成 $$），保证片段可读、不连环崩。配平时（偶数）则原样信任。
const DD_SENTINEL = '@@DDSENTINEL@@';
function balanceMathDelimiters(text) {
  let t = text.split('$$').join(DD_SENTINEL); // 先保护 $$，避免与单 $ 统计互相干扰
  const singleCount = (t.match(/\$/g) || []).length;
  if (singleCount % 2 === 1) t = t.split('$').join(' '); // 单 $ 不平衡 -> 去掉
  const ddCount = t.split(DD_SENTINEL).length - 1;
  t = ddCount % 2 === 1 ? t.split(DD_SENTINEL).join(' ') : t.split(DD_SENTINEL).join('$$'); // $$ 不平衡 -> 去掉，否则还原
  return t;
}

function wrapInlineMath(seg) {
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
}

function wrapPlainMath(seg) {
  let out = '';
  let last = 0;
  for (const match of seg.matchAll(LATEX_ENV_RE)) {
    const start = match.index;
    const rawEnv = match[0].trim();
    out += wrapInlineMath(seg.slice(last, start));
    out += `$$\n${rawEnv}\n$$`;
    last = start + match[0].length;
  }
  out += wrapInlineMath(seg.slice(last));
  return out;
}

/**
 * @param {string} text
 * @returns {string}
 */
export function autoWrapMath(text) {
  if (!text || typeof text !== 'string') return text || '';
  // 1) 规范 LaTeX 原生定界符 \( \) \[ \] -> $ $$
  text = normalizeMathDelimiters(text);
  // 2) 截断片段的不平衡 $ / $$ 兜底，避免配对错位连环崩
  text = balanceMathDelimiters(text);
  // 3) 移除 \tag{...}：KaTeX 行内模式不支持，会渲染成红字；公式编号对阅读无影响
  text = text.replace(/\\tag\*?\s*\{[^{}]*\}/g, '');
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
    return wrapPlainMath(seg);
  });

  return wrapped.join('');
}

export default autoWrapMath;
