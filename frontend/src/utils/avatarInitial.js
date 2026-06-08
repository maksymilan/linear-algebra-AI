const PINYIN_BOUNDARIES = [
  ['A', '阿'],
  ['B', '芭'],
  ['C', '嚓'],
  ['D', '搭'],
  ['E', '婀'],
  ['F', '发'],
  ['G', '旮'],
  ['H', '哈'],
  ['J', '击'],
  ['K', '喀'],
  ['L', '垃'],
  ['M', '妈'],
  ['N', '拿'],
  ['O', '哦'],
  ['P', '啪'],
  ['Q', '期'],
  ['R', '然'],
  ['S', '撒'],
  ['T', '塌'],
  ['W', '挖'],
  ['X', '昔'],
  ['Y', '压'],
  ['Z', '匝'],
];

const pinyinCollator = typeof Intl !== 'undefined'
  ? new Intl.Collator('zh-Hans-CN-u-co-pinyin')
  : null;

const isChineseCharacter = (char) => /[\u3400-\u9fff]/u.test(char);
const isLatinLetter = (char) => /^[a-z]$/i.test(char);

export const getRoleFallbackInitial = (role) => role === 'teacher' ? 'T' : 'S';

export const getAvatarInitial = (name, role = 'student') => {
  const fallback = getRoleFallbackInitial(role);
  const first = Array.from(String(name || '').trim())[0];
  if (!first) return fallback;

  if (isLatinLetter(first)) {
    return first.toUpperCase();
  }

  if (!isChineseCharacter(first) || !pinyinCollator) {
    return fallback;
  }

  for (let index = PINYIN_BOUNDARIES.length - 1; index >= 0; index -= 1) {
    const [letter, boundary] = PINYIN_BOUNDARIES[index];
    if (pinyinCollator.compare(first, boundary) >= 0) {
      return letter;
    }
  }

  return 'A';
};
