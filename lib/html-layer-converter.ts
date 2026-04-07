/**
 * HTML ↔ Layer bidirectional converter
 *
 * Import: Parse an HTML string into a Layer[] tree, converting Tailwind classes
 *         to design properties and mapping HTML elements to Ycode layer types.
 *
 * Export: Convert a Layer tree back into clean HTML with Tailwind classes.
 */

import type { Layer, LinkSettings } from '@/types';
import { generateId } from '@/lib/utils';
import { classesToDesign } from '@/lib/tailwind-class-mapper';
import { getClassesString, getLayerHtmlTag } from '@/lib/layer-utils';
import { getTiptapTextContent } from '@/lib/text-format-utils';

// ─── Tag → Layer Name Mapping ───

const TAG_TO_LAYER_NAME: Record<string, string> = {
  // Structure — maps to valid Ycode layer names
  div: 'div',
  section: 'section',
  header: 'div',
  footer: 'div',
  main: 'div',
  aside: 'div',
  article: 'div',
  nav: 'div',
  figure: 'div',
  figcaption: 'div',
  blockquote: 'div',
  details: 'div',
  summary: 'div',
  dialog: 'div',
  address: 'div',
  fieldset: 'div',
  legend: 'div',
  hgroup: 'div',
  search: 'div',

  // Links — treated as div with link settings
  a: 'div',

  // Text / inline content
  p: 'text',
  span: 'span',
  label: 'label',
  strong: 'span',
  b: 'span',
  em: 'span',
  i: 'span',
  u: 'span',
  s: 'span',
  del: 'span',
  ins: 'span',
  mark: 'span',
  small: 'span',
  sub: 'span',
  sup: 'span',
  abbr: 'span',
  cite: 'span',
  code: 'span',
  kbd: 'span',
  samp: 'span',
  var: 'span',
  time: 'span',
  data: 'span',
  q: 'span',
  dfn: 'span',
  ruby: 'span',
  rt: 'span',
  rp: 'span',
  bdi: 'span',
  bdo: 'span',
  wbr: 'span',

  // Headings
  h1: 'heading',
  h2: 'heading',
  h3: 'heading',
  h4: 'heading',
  h5: 'heading',
  h6: 'heading',

  // Media
  img: 'image',
  picture: 'div',
  source: 'div',
  video: 'video',
  audio: 'audio',
  track: 'div',
  canvas: 'div',
  svg: 'icon',

  // Embeds
  iframe: 'iframe',
  embed: 'div',
  object: 'div',

  // Forms
  form: 'form',
  button: 'button',
  input: 'input',
  textarea: 'textarea',
  select: 'select',
  option: 'div',
  optgroup: 'div',
  datalist: 'div',
  output: 'div',
  progress: 'div',
  meter: 'div',

  // Lists → div (with semantic tag preserved)
  ul: 'div',
  ol: 'div',
  li: 'div',
  dl: 'div',
  dt: 'div',
  dd: 'div',
  menu: 'div',

  // Tables → div (with semantic tag preserved)
  table: 'div',
  caption: 'div',
  colgroup: 'div',
  col: 'div',
  thead: 'div',
  tbody: 'div',
  tfoot: 'div',
  tr: 'div',
  td: 'div',
  th: 'div',

  // Separators
  hr: 'hr',
  br: 'hr',

  // Preformatted
  pre: 'div',
};

const SEMANTIC_TAG_OVERRIDE: Record<string, string> = {
  header: 'header',
  footer: 'footer',
  main: 'main',
  aside: 'aside',
  article: 'article',
  nav: 'nav',
  ul: 'ul',
  ol: 'ol',
  li: 'li',
  dl: 'dl',
  dt: 'dt',
  dd: 'dd',
  blockquote: 'blockquote',
  pre: 'pre',
  figure: 'figure',
  figcaption: 'figcaption',
  details: 'details',
  summary: 'summary',
  table: 'table',
  caption: 'caption',
  thead: 'thead',
  tbody: 'tbody',
  tfoot: 'tfoot',
  tr: 'tr',
  td: 'td',
  th: 'th',
  fieldset: 'fieldset',
  legend: 'legend',
  address: 'address',
  menu: 'menu',
  search: 'search',
};

const HEADING_TAGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

const CONTAINER_NAMES = new Set([
  'div', 'section', 'form', 'button', 'label',
]);

const SELF_CLOSING_TAGS = new Set([
  'img', 'input', 'hr', 'br', 'meta', 'link', 'source', 'track', 'wbr',
]);

const INLINE_TEXT_TAGS = new Set([
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'mark', 'small',
  'sub', 'sup', 'abbr', 'cite', 'code', 'kbd', 'samp', 'var', 'time',
  'data', 'q', 'dfn', 'ruby', 'rt', 'rp', 'bdi', 'bdo', 'wbr',
  'a',
]);

// ─── Tailwind v3 → v4 Normalizer ───

const V3_TO_V4_RENAMES: Record<string, string> = {
  'flex-grow': 'grow',
  'flex-grow-0': 'grow-0',
  'flex-shrink': 'shrink',
  'flex-shrink-0': 'shrink-0',
  'overflow-ellipsis': 'text-ellipsis',
  'decoration-clone': 'box-decoration-clone',
  'decoration-slice': 'box-decoration-slice',
  'outline-none': 'outline-hidden',
  'ring': 'ring-3',
  'shadow-inner': 'inset-shadow-sm',
  'break-words': 'wrap-break-word',
  'transform': '',
  'filter': '',
  'backdrop-filter': '',
};

const OPACITY_RE = /^(bg|text|border|ring|divide|placeholder)-opacity-(?:(\d+)|\[(\d+)%?\])$/;
const NAMED_COLOR_RE = /^[a-z]+-\d{2,3}$/;
const SIZE_VALUE_RE = /^\d|(?:px|em|rem|%|vh|vw|ch|ex|svh|dvh|lvh)$/;

const VARIANT_PREFIX_RE = /^((?:[a-z0-9-]+:)+)/;

function splitVariantPrefix(cls: string): [string, string] {
  const m = cls.match(VARIANT_PREFIX_RE);
  return m ? [m[1], cls.slice(m[1].length)] : ['', cls];
}

function isArbitraryColorClass(_prefix: string, rest: string): boolean {
  if (!rest.startsWith('[')) return false;
  const inner = rest.slice(1, rest.indexOf(']'));
  if (SIZE_VALUE_RE.test(inner)) return false;
  return true;
}

const V3_TO_V4_SCALE: Record<string, string> = {
  '': 'sm', 'sm': 'xs',
};

const ROUNDED_RE = /^rounded(-(?:t|r|b|l|tl|tr|bl|br|s|e|ss|se|es|ee))?(?:-(sm|md|lg|xl|2xl|3xl))?$/;

function renameScaledUtility(cls: string): string | null {
  const roundedMatch = cls.match(ROUNDED_RE);
  if (roundedMatch) {
    const dir = roundedMatch[1] || '';
    const size = roundedMatch[2] || '';
    if (!(size in V3_TO_V4_SCALE)) return null;
    const v4 = V3_TO_V4_SCALE[size];
    return `rounded${dir}${v4 ? `-${v4}` : ''}`;
  }

  for (const pfx of ['drop-shadow', 'shadow', 'backdrop-blur', 'blur'] as const) {
    if (cls === pfx || cls.startsWith(`${pfx}-`)) {
      const rest = cls.slice(pfx.length);
      const m = rest.match(/^(?:-(sm|md|lg|xl|2xl|3xl))?$/);
      if (!m) return null;
      const size = m[1] || '';
      if (!(size in V3_TO_V4_SCALE)) return null;
      const v4 = V3_TO_V4_SCALE[size];
      return `${pfx}${v4 ? `-${v4}` : ''}`;
    }
  }

  return null;
}

function normalizeV3ToV4(classes: string[]): string[] {
  const result: string[] = [];
  const opacityEntries: { prefix: string; value: string }[] = [];

  for (const cls of classes) {
    const [variantPrefix, base] = splitVariantPrefix(cls);

    const renamed = V3_TO_V4_RENAMES[base];
    if (renamed !== undefined) {
      if (renamed) result.push(variantPrefix + renamed);
      continue;
    }

    const opMatch = base.match(OPACITY_RE);
    if (opMatch) {
      const opValue = opMatch[2] || opMatch[3];
      if (opValue && opValue !== '100') {
        opacityEntries.push({ prefix: opMatch[1], value: opValue });
      }
      continue;
    }

    if (base.startsWith('bg-gradient-to-')) {
      result.push(variantPrefix + 'bg-linear-to-' + base.slice(15));
      continue;
    }

    const scaled = renameScaledUtility(base);
    if (scaled) {
      result.push(variantPrefix + scaled);
      continue;
    }

    result.push(cls);
  }

  for (const { prefix, value } of opacityEntries) {
    const colorIdx = result.findIndex(cls => {
      if (cls.includes('/')) return false;
      if (!cls.startsWith(`${prefix}-`)) return false;
      const rest = cls.slice(prefix.length + 1);
      if (rest.startsWith('[')) return isArbitraryColorClass(prefix, rest);
      return NAMED_COLOR_RE.test(rest);
    });

    if (colorIdx !== -1) {
      result[colorIdx] = `${result[colorIdx]}/${value}`;
    }
  }

  for (let i = 0; i < result.length; i++) {
    const [vp, base] = splitVariantPrefix(result[i]);
    if (base.startsWith('placeholder-') && !base.includes(':')) {
      result[i] = `${vp}placeholder:text-${base.slice(12)}`;
    }
  }

  return result;
}

// ─── Named Tailwind Color → Hex Resolver ───

const TAILWIND_COLORS: Record<string, Record<string, string>> = {
  slate: { '50':'#f8fafc','100':'#f1f5f9','200':'#e2e8f0','300':'#cbd5e1','400':'#94a3b8','500':'#64748b','600':'#475569','700':'#334155','800':'#1e293b','900':'#0f172a','950':'#020617' },
  gray: { '50':'#f9fafb','100':'#f3f4f6','200':'#e5e7eb','300':'#d1d5db','400':'#9ca3af','500':'#6b7280','600':'#4b5563','700':'#374151','800':'#1f2937','900':'#111827','950':'#030712' },
  zinc: { '50':'#fafafa','100':'#f4f4f5','200':'#e4e4e7','300':'#d4d4d8','400':'#a1a1aa','500':'#71717a','600':'#52525b','700':'#3f3f46','800':'#27272a','900':'#18181b','950':'#09090b' },
  neutral: { '50':'#fafafa','100':'#f5f5f5','200':'#e5e5e5','300':'#d4d4d4','400':'#a3a3a3','500':'#737373','600':'#525252','700':'#404040','800':'#262626','900':'#171717','950':'#0a0a0a' },
  stone: { '50':'#fafaf9','100':'#f5f5f4','200':'#e7e5e4','300':'#d6d3d1','400':'#a8a29e','500':'#78716c','600':'#57534e','700':'#44403c','800':'#292524','900':'#1c1917','950':'#0c0a09' },
  red: { '50':'#fef2f2','100':'#fee2e2','200':'#fecaca','300':'#fca5a5','400':'#f87171','500':'#ef4444','600':'#dc2626','700':'#b91c1c','800':'#991b1b','900':'#7f1d1d','950':'#450a0a' },
  orange: { '50':'#fff7ed','100':'#ffedd5','200':'#fed7aa','300':'#fdba74','400':'#fb923c','500':'#f97316','600':'#ea580c','700':'#c2410c','800':'#9a3412','900':'#7c2d12','950':'#431407' },
  amber: { '50':'#fffbeb','100':'#fef3c7','200':'#fde68a','300':'#fcd34d','400':'#fbbf24','500':'#f59e0b','600':'#d97706','700':'#b45309','800':'#92400e','900':'#78350f','950':'#451a03' },
  yellow: { '50':'#fefce8','100':'#fef9c3','200':'#fef08a','300':'#fde047','400':'#facc15','500':'#eab308','600':'#ca8a04','700':'#a16207','800':'#854d0e','900':'#713f12','950':'#422006' },
  lime: { '50':'#f7fee7','100':'#ecfccb','200':'#d9f99d','300':'#bef264','400':'#a3e635','500':'#84cc16','600':'#65a30d','700':'#4d7c0f','800':'#3f6212','900':'#365314','950':'#1a2e05' },
  green: { '50':'#f0fdf4','100':'#dcfce7','200':'#bbf7d0','300':'#86efac','400':'#4ade80','500':'#22c55e','600':'#16a34a','700':'#15803d','800':'#166534','900':'#14532d','950':'#052e16' },
  emerald: { '50':'#ecfdf5','100':'#d1fae5','200':'#a7f3d0','300':'#6ee7b7','400':'#34d399','500':'#10b981','600':'#059669','700':'#047857','800':'#065f46','900':'#064e3b','950':'#022c22' },
  teal: { '50':'#f0fdfa','100':'#ccfbf1','200':'#99f6e4','300':'#5eead4','400':'#2dd4bf','500':'#14b8a6','600':'#0d9488','700':'#0f766e','800':'#115e59','900':'#134e4a','950':'#042f2e' },
  cyan: { '50':'#ecfeff','100':'#cffafe','200':'#a5f3fc','300':'#67e8f9','400':'#22d3ee','500':'#06b6d4','600':'#0891b2','700':'#0e7490','800':'#155e75','900':'#164e63','950':'#083344' },
  sky: { '50':'#f0f9ff','100':'#e0f2fe','200':'#bae6fd','300':'#7dd3fc','400':'#38bdf8','500':'#0ea5e9','600':'#0284c7','700':'#0369a1','800':'#075985','900':'#0c4a6e','950':'#082f49' },
  blue: { '50':'#eff6ff','100':'#dbeafe','200':'#bfdbfe','300':'#93c5fd','400':'#60a5fa','500':'#3b82f6','600':'#2563eb','700':'#1d4ed8','800':'#1e40af','900':'#1e3a8a','950':'#172554' },
  indigo: { '50':'#eef2ff','100':'#e0e7ff','200':'#c7d2fe','300':'#a5b4fc','400':'#818cf8','500':'#6366f1','600':'#4f46e5','700':'#4338ca','800':'#3730a3','900':'#312e81','950':'#1e1b4b' },
  violet: { '50':'#f5f3ff','100':'#ede9fe','200':'#ddd6fe','300':'#c4b5fd','400':'#a78bfa','500':'#8b5cf6','600':'#7c3aed','700':'#6d28d9','800':'#5b21b6','900':'#4c1d95','950':'#2e1065' },
  purple: { '50':'#faf5ff','100':'#f3e8ff','200':'#e9d5ff','300':'#d8b4fe','400':'#c084fc','500':'#a855f7','600':'#9333ea','700':'#7e22ce','800':'#6b21a8','900':'#581c87','950':'#3b0764' },
  fuchsia: { '50':'#fdf4ff','100':'#fae8ff','200':'#f5d0fe','300':'#f0abfc','400':'#e879f9','500':'#d946ef','600':'#c026d3','700':'#a21caf','800':'#86198f','900':'#701a75','950':'#4a044e' },
  pink: { '50':'#fdf2f8','100':'#fce7f3','200':'#fbcfe8','300':'#f9a8d4','400':'#f472b6','500':'#ec4899','600':'#db2777','700':'#be185d','800':'#9d174d','900':'#831843','950':'#500724' },
  rose: { '50':'#fff1f2','100':'#ffe4e6','200':'#fecdd3','300':'#fda4af','400':'#fb7185','500':'#f43f5e','600':'#e11d48','700':'#be123c','800':'#9f1239','900':'#881337','950':'#4c0519' },
};

const SINGLE_COLORS: Record<string, string> = {
  black: '#000000', white: '#ffffff', transparent: 'transparent', current: 'currentColor',
};

const COLOR_UTILITY_PREFIXES = [
  'bg', 'text', 'border', 'ring', 'outline', 'shadow', 'divide',
  'from', 'via', 'to', 'caret', 'accent', 'fill', 'stroke', 'decoration',
];

const NAMED_COLOR_PATTERN = new RegExp(
  `^(${COLOR_UTILITY_PREFIXES.join('|')})-(${Object.keys(TAILWIND_COLORS).join('|')})-(50|100|200|300|400|500|600|700|800|900|950)(?:/(\\d+|\\[.+?\\]))?$`
);

const SINGLE_COLOR_PATTERN = new RegExp(
  `^(${COLOR_UTILITY_PREFIXES.join('|')})-(${Object.keys(SINGLE_COLORS).join('|')})(?:/(\\d+|\\[.+?\\]))?$`
);

function resolveNamedColors(classes: string[]): string[] {
  return classes.map(cls => {
    const [variantPrefix, base] = splitVariantPrefix(cls);

    const namedMatch = base.match(NAMED_COLOR_PATTERN);
    if (namedMatch) {
      const [, prefix, color, shade, opacity] = namedMatch;
      const hex = TAILWIND_COLORS[color]?.[shade];
      if (hex) {
        return `${variantPrefix}${prefix}-[${hex}]${opacity ? `/${opacity}` : ''}`;
      }
    }

    const singleMatch = base.match(SINGLE_COLOR_PATTERN);
    if (singleMatch) {
      const [, prefix, color, opacity] = singleMatch;
      const value = SINGLE_COLORS[color];
      if (value) {
        if (value === 'transparent' || value === 'currentColor') {
          return cls;
        }
        return `${variantPrefix}${prefix}-[${value}]${opacity ? `/${opacity}` : ''}`;
      }
    }

    return cls;
  });
}

// ─── Inline Style → Tailwind Classes ───

function parseSpacingShorthand(val: string, prefix: string, sides: [string, string, string, string]): string[] {
  const parts = val.split(/\s+/);
  if (parts.length === 1) return [`${prefix}-[${parts[0]}]`];
  if (parts.length === 2) return [
    `${sides[0]}-[${parts[0]}]`, `${sides[1]}-[${parts[1]}]`,
    `${sides[2]}-[${parts[0]}]`, `${sides[3]}-[${parts[1]}]`,
  ];
  if (parts.length === 3) return [
    `${sides[0]}-[${parts[0]}]`, `${sides[1]}-[${parts[1]}]`,
    `${sides[2]}-[${parts[2]}]`, `${sides[3]}-[${parts[1]}]`,
  ];
  return [
    `${sides[0]}-[${parts[0]}]`, `${sides[1]}-[${parts[1]}]`,
    `${sides[2]}-[${parts[2]}]`, `${sides[3]}-[${parts[3]}]`,
  ];
}

const DISPLAY_MAP: Record<string, string> = {
  flex: 'flex', 'inline-flex': 'inline-flex', grid: 'grid',
  'inline-grid': 'inline-grid', block: 'block', 'inline-block': 'inline-block',
  inline: 'inline', none: 'hidden',
};
const FLEX_DIR_MAP: Record<string, string> = {
  row: 'flex-row', 'row-reverse': 'flex-row-reverse',
  column: 'flex-col', 'column-reverse': 'flex-col-reverse',
};
const FLEX_WRAP_MAP: Record<string, string> = {
  wrap: 'flex-wrap', 'wrap-reverse': 'flex-wrap-reverse', nowrap: 'flex-nowrap',
};
const JUSTIFY_MAP: Record<string, string> = {
  'flex-start': 'justify-start', start: 'justify-start',
  'flex-end': 'justify-end', end: 'justify-end',
  center: 'justify-center', 'space-between': 'justify-between',
  'space-around': 'justify-around', 'space-evenly': 'justify-evenly',
  stretch: 'justify-stretch',
};
const ALIGN_ITEMS_MAP: Record<string, string> = {
  'flex-start': 'items-start', start: 'items-start',
  'flex-end': 'items-end', end: 'items-end',
  center: 'items-center', baseline: 'items-baseline', stretch: 'items-stretch',
};
const ALIGN_SELF_MAP: Record<string, string> = {
  auto: 'self-auto', 'flex-start': 'self-start', start: 'self-start',
  'flex-end': 'self-end', end: 'self-end',
  center: 'self-center', stretch: 'self-stretch', baseline: 'self-baseline',
};
const TEXT_ALIGN_MAP: Record<string, string> = {
  left: 'text-left', center: 'text-center', right: 'text-right', justify: 'text-justify',
};
const TEXT_DECO_MAP: Record<string, string> = {
  underline: 'underline', 'line-through': 'line-through', none: 'no-underline',
};
const TEXT_TRANSFORM_MAP: Record<string, string> = {
  uppercase: 'uppercase', lowercase: 'lowercase', capitalize: 'capitalize', none: 'normal-case',
};
const WHITESPACE_MAP: Record<string, string> = {
  nowrap: 'whitespace-nowrap', pre: 'whitespace-pre',
  'pre-wrap': 'whitespace-pre-wrap', 'pre-line': 'whitespace-pre-line',
  normal: 'whitespace-normal',
};
const POSITION_MAP: Record<string, string> = {
  relative: 'relative', absolute: 'absolute', fixed: 'fixed', sticky: 'sticky', static: 'static',
};
const OVERFLOW_MAP: Record<string, string> = {
  hidden: 'overflow-hidden', auto: 'overflow-auto', scroll: 'overflow-scroll', visible: 'overflow-visible',
};
const CURSOR_MAP: Record<string, string> = {
  pointer: 'cursor-pointer', default: 'cursor-default', move: 'cursor-move',
  text: 'cursor-text', wait: 'cursor-wait', help: 'cursor-help',
  'not-allowed': 'cursor-not-allowed', grab: 'cursor-grab', grabbing: 'cursor-grabbing',
};
const OBJECT_FIT_MAP: Record<string, string> = {
  contain: 'object-contain', cover: 'object-cover', fill: 'object-fill',
  none: 'object-none', 'scale-down': 'object-scale-down',
};
const BORDER_STYLE_VALUES = new Set(['solid', 'dashed', 'dotted', 'double', 'none']);

function sanitizeCssValue(val: string): string {
  let v = val.replace(/\s*!important\s*$/i, '').trim();
  v = v.replace(/,\s+/g, ',');
  return v;
}

function styleToClasses(style: string): string[] {
  const classes: string[] = [];
  const decls = style.split(';').map(d => d.trim()).filter(Boolean);

  for (const decl of decls) {
    const colonIdx = decl.indexOf(':');
    if (colonIdx === -1) continue;
    const prop = decl.slice(0, colonIdx).trim().toLowerCase();
    const val = sanitizeCssValue(decl.slice(colonIdx + 1));
    if (!val) continue;

    const mapped =
      prop === 'display' ? DISPLAY_MAP[val] :
        prop === 'flex-direction' ? FLEX_DIR_MAP[val] :
          prop === 'flex-wrap' ? FLEX_WRAP_MAP[val] :
            prop === 'justify-content' ? JUSTIFY_MAP[val] :
              prop === 'align-items' ? ALIGN_ITEMS_MAP[val] :
                prop === 'align-self' ? ALIGN_SELF_MAP[val] :
                  prop === 'text-align' ? TEXT_ALIGN_MAP[val] :
                    prop === 'text-decoration' || prop === 'text-decoration-line' ? TEXT_DECO_MAP[val] :
                      prop === 'text-transform' ? TEXT_TRANSFORM_MAP[val] :
                        prop === 'white-space' ? WHITESPACE_MAP[val] :
                          prop === 'position' ? POSITION_MAP[val] :
                            prop === 'overflow' ? OVERFLOW_MAP[val] :
                              prop === 'cursor' ? CURSOR_MAP[val] :
                                prop === 'object-fit' ? OBJECT_FIT_MAP[val] :
                                  prop === 'font-style' && val === 'italic' ? 'italic' :
                                    prop === 'font-style' && val === 'normal' ? 'not-italic' :
                                      prop === 'pointer-events' && val === 'none' ? 'pointer-events-none' :
                                        prop === 'pointer-events' && val === 'auto' ? 'pointer-events-auto' :
                                          prop === 'word-break' && val === 'break-all' ? 'break-all' :
                                            prop === 'overflow-wrap' && val === 'break-word' ? 'break-words' :
                                              null;

    if (mapped) { classes.push(mapped); continue; }

    switch (prop) {
      case 'gap': classes.push(`gap-[${val}]`); break;
      case 'row-gap': classes.push(`gap-y-[${val}]`); break;
      case 'column-gap': classes.push(`gap-x-[${val}]`); break;
      case 'padding':
        classes.push(...parseSpacingShorthand(val, 'p', ['pt', 'pr', 'pb', 'pl']));
        break;
      case 'padding-top': classes.push(`pt-[${val}]`); break;
      case 'padding-right': classes.push(`pr-[${val}]`); break;
      case 'padding-bottom': classes.push(`pb-[${val}]`); break;
      case 'padding-left': classes.push(`pl-[${val}]`); break;
      case 'margin':
        classes.push(...parseSpacingShorthand(val, 'm', ['mt', 'mr', 'mb', 'ml']));
        break;
      case 'margin-top': classes.push(`mt-[${val}]`); break;
      case 'margin-right': classes.push(`mr-[${val}]`); break;
      case 'margin-bottom': classes.push(`mb-[${val}]`); break;
      case 'margin-left': classes.push(`ml-[${val}]`); break;
      case 'width':
        classes.push(val === '100%' ? 'w-full' : `w-[${val}]`);
        break;
      case 'height':
        classes.push(val === '100%' ? 'h-full' : val === 'auto' ? 'h-auto' : `h-[${val}]`);
        break;
      case 'min-width': classes.push(`min-w-[${val}]`); break;
      case 'min-height': classes.push(`min-h-[${val}]`); break;
      case 'max-width': classes.push(`max-w-[${val}]`); break;
      case 'max-height': classes.push(`max-h-[${val}]`); break;
      case 'font-size': classes.push(`text-[${val}]`); break;
      case 'font-weight': classes.push(`font-[${val}]`); break;
      case 'font-family':
        classes.push(`font-[${val.replace(/,\s*/g, ',').replace(/\s+/g, '_')}]`);
        break;
      case 'color': classes.push(`text-[${val}]`); break;
      case 'line-height': classes.push(`leading-[${val}]`); break;
      case 'letter-spacing': classes.push(`tracking-[${val}]`); break;
      case 'background-color': classes.push(`bg-[${val}]`); break;
      case 'border-radius': classes.push(`rounded-[${val}]`); break;
      case 'border-top-left-radius': classes.push(`rounded-tl-[${val}]`); break;
      case 'border-top-right-radius': classes.push(`rounded-tr-[${val}]`); break;
      case 'border-bottom-right-radius': classes.push(`rounded-br-[${val}]`); break;
      case 'border-bottom-left-radius': classes.push(`rounded-bl-[${val}]`); break;
      case 'border-width': classes.push(`border-[${val}]`); break;
      case 'border-color': classes.push(`border-[${val}]`); break;
      case 'border-style':
        if (BORDER_STYLE_VALUES.has(val)) classes.push(`border-${val}`);
        break;
      case 'border': {
        const m = val.match(/^(\S+)\s+(solid|dashed|dotted|double|none)\s+(.+)$/);
        if (m) { classes.push(`border-[${m[1]}]`, `border-${m[2]}`, `border-[${m[3]}]`); }
        else if (val === 'none') classes.push('border-none');
        break;
      }
      case 'opacity': classes.push(`opacity-[${val}]`); break;
      case 'top': classes.push(`top-[${val}]`); break;
      case 'right': classes.push(`right-[${val}]`); break;
      case 'bottom': classes.push(`bottom-[${val}]`); break;
      case 'left': classes.push(`left-[${val}]`); break;
      case 'z-index': classes.push(`z-[${val}]`); break;
      case 'overflow-x':
        if (['hidden', 'auto', 'scroll', 'visible'].includes(val))
          classes.push(`overflow-x-${val}`);
        break;
      case 'overflow-y':
        if (['hidden', 'auto', 'scroll', 'visible'].includes(val))
          classes.push(`overflow-y-${val}`);
        break;
      case 'aspect-ratio':
        classes.push(val === 'auto' ? 'aspect-auto' : `aspect-[${val.replace(/\s*\/\s*/g, '/')}]`);
        break;
      case 'box-shadow':
        classes.push(`shadow-[${val.replace(/\s+/g, '_')}]`);
        break;
    }
  }

  return classes;
}

// ─── TipTap Rich Text Builder ───

type TiptapMark = { type: string; attrs?: Record<string, any> };
type TiptapNode =
  | { type: 'text'; text: string; marks?: TiptapMark[] }
  | { type: 'hardBreak' };

const HTML_TAG_TO_MARK: Record<string, string> = {
  strong: 'bold', b: 'bold',
  em: 'italic', i: 'italic',
  u: 'underline', ins: 'underline',
  s: 'strike', del: 'strike',
  sub: 'subscript', sup: 'superscript',
  code: 'code', kbd: 'code',
};

function collectInlineNodes(node: Node, marks: TiptapMark[]): TiptapNode[] {
  const nodes: TiptapNode[] = [];

  for (let i = 0; i < node.childNodes.length; i++) {
    const child = node.childNodes[i];

    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent || '';
      if (text) {
        nodes.push({
          type: 'text',
          text,
          ...(marks.length > 0 ? { marks: [...marks] } : {}),
        });
      }
      continue;
    }

    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = child as Element;
    const tag = el.tagName.toLowerCase();

    if (tag === 'br') {
      nodes.push({ type: 'hardBreak' });
      continue;
    }

    if (tag === 'a') {
      const href = el.getAttribute('href') || '';
      const target = el.getAttribute('target');
      const rel = el.getAttribute('rel');
      const linkMark: TiptapMark = {
        type: 'richTextLink',
        attrs: {
          type: 'url' as const,
          url: { type: 'dynamic_text' as const, data: { content: href } },
          ...(target ? { target } : {}),
          ...(rel ? { rel } : {}),
        },
      };
      nodes.push(...collectInlineNodes(el, [...marks, linkMark]));
      continue;
    }

    const markType = HTML_TAG_TO_MARK[tag];
    if (markType) {
      nodes.push(...collectInlineNodes(el, [...marks, { type: markType }]));
    } else {
      nodes.push(...collectInlineNodes(el, marks));
    }
  }

  return nodes;
}

function buildRichTextDoc(el: Element) {
  const inlineNodes = collectInlineNodes(el, []);
  return {
    type: 'doc' as const,
    content: [{
      type: 'paragraph' as const,
      content: inlineNodes.length > 0 ? inlineNodes : [],
    }],
  };
}

// ─── Import: HTML → Layers ───

function isTextOnlyElement(el: Element): boolean {
  for (let i = 0; i < el.childNodes.length; i++) {
    const node = el.childNodes[i];
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = (node as Element).tagName.toLowerCase();
      if (tag !== 'br' && !INLINE_TEXT_TAGS.has(tag)) return false;
    }
  }
  return true;
}

const TEXT_LAYER_NAMES = new Set(['text', 'heading', 'span']);

const LAYER_NAME_LABELS: Record<string, string> = {
  heading: 'Heading',
  text: 'Text',
  span: 'Text',
};

function makeRichTextVariable(textOrDoc: string | object) {
  const content = typeof textOrDoc === 'string'
    ? getTiptapTextContent(textOrDoc)
    : textOrDoc;
  return {
    type: 'dynamic_rich_text' as const,
    data: { content },
  };
}

function makeTextLayer(text: string): Layer {
  return {
    id: generateId('lyr'),
    name: 'text',
    classes: '',
    restrictions: { editText: true },
    variables: { text: makeRichTextVariable(text) },
  };
}

function cleanDesign(design: Layer['design']): Layer['design'] | undefined {
  if (!design) return undefined;

  const cleaned: Record<string, any> = {};
  let hasValues = false;

  for (const [category, properties] of Object.entries(design)) {
    if (!properties || typeof properties !== 'object') continue;
    const nonEmpty = Object.keys(properties).length > 0;
    if (nonEmpty) {
      cleaned[category] = { isActive: true, ...properties };
      hasValues = true;
    }
  }

  return hasValues ? (cleaned as Layer['design']) : undefined;
}

function resolveImportClasses(el: Element): string {
  const classAttr = el.getAttribute('class') || '';
  const styleAttr = el.getAttribute('style') || '';

  const htmlClasses = classAttr.split(/\s+/).filter(Boolean);
  const inlineClasses = styleAttr ? styleToClasses(styleAttr) : [];

  const merged = [...htmlClasses, ...inlineClasses];
  const normalized = normalizeV3ToV4(merged);
  const resolved = resolveNamedColors(normalized);

  return resolved.join(' ');
}

function elementToLayer(el: Element): Layer | null {
  const tag = el.tagName.toLowerCase();

  if (tag === 'script' || tag === 'style' || tag === 'link' || tag === 'meta') {
    return null;
  }

  const layerName = TAG_TO_LAYER_NAME[tag] || 'div';
  const classes = resolveImportClasses(el);

  const rawDesign = classes ? classesToDesign(classes) : undefined;
  const design = cleanDesign(rawDesign);

  const layer: Layer = {
    id: generateId('lyr'),
    name: layerName,
    classes,
    ...(design ? { design } : {}),
  };

  if (HEADING_TAGS.has(tag)) {
    layer.settings = { tag };
  } else if (SEMANTIC_TAG_OVERRIDE[tag]) {
    layer.settings = { tag: SEMANTIC_TAG_OVERRIDE[tag] };
  }

  if (TEXT_LAYER_NAMES.has(layerName)) {
    layer.restrictions = { editText: true };
  }

  if (tag === 'a') {
    const href = el.getAttribute('href');
    const target = el.getAttribute('target') as LinkSettings['target'] | null;
    const rel = el.getAttribute('rel');

    if (href) {
      const linkSettings: LinkSettings = {
        type: 'url',
        url: { type: 'dynamic_text', data: { content: href } },
      };
      if (target) linkSettings.target = target;
      if (rel) linkSettings.rel = rel;
      layer.variables = { ...layer.variables, link: linkSettings };
    }
  }

  if (tag === 'img') {
    const src = el.getAttribute('src');
    const alt = el.getAttribute('alt');
    if (src) {
      layer.variables = {
        ...layer.variables,
        image: {
          src: { type: 'dynamic_text', data: { content: src } },
          alt: { type: 'dynamic_text', data: { content: alt || '' } },
        },
      };
    }
    const width = el.getAttribute('width');
    const height = el.getAttribute('height');
    if (width || height) {
      layer.attributes = {
        ...layer.attributes,
        ...(width ? { width } : {}),
        ...(height ? { height } : {}),
      };
    }
    return layer;
  }

  if (tag === 'input') {
    const type = el.getAttribute('type') || 'text';
    const placeholder = el.getAttribute('placeholder');
    const name = el.getAttribute('name');
    layer.attributes = {
      ...layer.attributes,
      type,
      ...(placeholder ? { placeholder } : {}),
      ...(name ? { name } : {}),
    };
    return layer;
  }

  if (tag === 'iframe') {
    const src = el.getAttribute('src');
    if (src) {
      layer.variables = {
        ...layer.variables,
        iframe: {
          src: { type: 'dynamic_text', data: { content: src } },
        },
      };
    }
    return layer;
  }

  if (tag === 'video' || tag === 'audio') {
    const src = el.getAttribute('src');
    if (src) {
      layer.variables = {
        ...layer.variables,
        [tag]: {
          src: { type: 'dynamic_text', data: { content: src } },
        },
      };
    }
    layer.attributes = {
      ...layer.attributes,
      controls: el.hasAttribute('controls'),
      loop: el.hasAttribute('loop'),
      muted: el.hasAttribute('muted'),
      autoplay: el.hasAttribute('autoplay'),
    };
    return layer;
  }

  if (tag === 'svg') {
    const svgString = el.outerHTML;
    layer.variables = {
      ...layer.variables,
      icon: {
        src: { type: 'static_text', data: { content: svgString } },
      },
    };
    return layer;
  }

  const customId = el.getAttribute('id');
  if (customId) {
    layer.attributes = { ...layer.attributes, id: customId };
  }

  const isTextLayer = TEXT_LAYER_NAMES.has(layerName);

  if (isTextLayer && isTextOnlyElement(el)) {
    const doc = buildRichTextDoc(el);
    const hasContent = doc.content[0].content.length > 0;
    layer.variables = {
      ...layer.variables,
      text: makeRichTextVariable(hasContent ? doc : LAYER_NAME_LABELS[layerName] || ''),
    };
    return layer;
  }

  if (!isTextLayer && isTextOnlyElement(el) && el.textContent?.trim()) {
    const doc = buildRichTextDoc(el);
    if (CONTAINER_NAMES.has(layerName)) {
      const textLayer: Layer = {
        id: generateId('lyr'),
        name: 'text',
        classes: '',
        restrictions: { editText: true },
        variables: { text: makeRichTextVariable(doc) },
      };
      layer.children = [textLayer];
    } else {
      layer.variables = {
        ...layer.variables,
        text: makeRichTextVariable(doc),
      };
    }
    return layer;
  }

  const children: Layer[] = [];
  for (let i = 0; i < el.childNodes.length; i++) {
    const node = el.childNodes[i];
    if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || '').trim();
      if (text) {
        children.push(makeTextLayer(text));
      }
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      const childLayer = elementToLayer(node as Element);
      if (childLayer) {
        children.push(childLayer);
      }
    }
  }

  if (isTextLayer && children.length === 0) {
    layer.variables = {
      ...layer.variables,
      text: makeRichTextVariable(LAYER_NAME_LABELS[layerName] || ''),
    };
    return layer;
  }

  if (children.length > 0) {
    layer.children = children;
  } else if (CONTAINER_NAMES.has(layerName)) {
    layer.children = [];
  }

  return layer;
}

/**
 * Parse an HTML string into a Ycode Layer tree.
 * Converts Tailwind classes to design properties.
 */
export function htmlToLayers(html: string): Layer[] {
  if (typeof window === 'undefined') return [];

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const layers: Layer[] = [];
  const body = doc.body;

  for (let i = 0; i < body.childNodes.length; i++) {
    const node = body.childNodes[i];
    if (node.nodeType === Node.ELEMENT_NODE) {
      const layer = elementToLayer(node as Element);
      if (layer) layers.push(layer);
    } else if (node.nodeType === Node.TEXT_NODE) {
      const text = (node.textContent || '').trim();
      if (text) {
        layers.push(makeTextLayer(text));
      }
    }
  }

  return layers;
}

// ─── Export: Layers → HTML ───

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const MARK_TO_HTML_TAG: Record<string, string> = {
  bold: 'strong', italic: 'em', underline: 'u', strike: 's',
  subscript: 'sub', superscript: 'sup', code: 'code',
};

function renderTiptapNodeToHtml(node: any): string {
  if (node.type === 'hardBreak') return '<br />';
  if (node.type !== 'text' || !node.text) return '';

  let html = escapeHtml(node.text);
  const marks: any[] = node.marks || [];

  for (let i = marks.length - 1; i >= 0; i--) {
    const mark = marks[i];
    const tag = MARK_TO_HTML_TAG[mark.type];
    if (tag) {
      html = `<${tag}>${html}</${tag}>`;
      continue;
    }
    if (mark.type === 'richTextLink') {
      const href = mark.attrs?.url?.data?.content || '#';
      const linkParts = [`href="${escapeHtml(href)}"`];
      if (mark.attrs?.target) linkParts.push(`target="${mark.attrs.target}"`);
      if (mark.attrs?.rel) linkParts.push(`rel="${escapeHtml(mark.attrs.rel)}"`);
      html = `<a ${linkParts.join(' ')}>${html}</a>`;
    }
  }

  return html;
}

function renderTiptapDocToHtml(doc: any): string {
  if (!doc || !doc.content) return '';
  return doc.content
    .map((block: any) => {
      if (!block.content) return '';
      return block.content.map(renderTiptapNodeToHtml).join('');
    })
    .join('\n');
}

function getLayerTextHtml(layer: Layer): string | null {
  const textVar = layer.variables?.text;
  if (!textVar) return null;

  if (textVar.type === 'dynamic_text') {
    return escapeHtml(textVar.data.content);
  }

  if (textVar.type === 'dynamic_rich_text') {
    return renderTiptapDocToHtml((textVar.data as any).content) || null;
  }

  return null;
}

function getVariableContent(variable: any): string {
  if (!variable || !('data' in variable)) return '';
  return (variable.data as any).content || '';
}

function resolveExportTag(layer: Layer): string {
  let tag = getLayerHtmlTag(layer);

  const linkSettings = layer.variables?.link;
  const hasLink = linkSettings?.type === 'url' && linkSettings.url?.data.content;

  if (hasLink && (layer.name === 'div' || layer.name === 'button')) {
    tag = 'a';
  }

  return tag;
}

function buildLinkAttrs(link: LinkSettings): string[] {
  const attrs: string[] = [];
  if (link.url?.data.content) {
    attrs.push(`href="${escapeHtml(link.url.data.content)}"`);
  }
  if (link.target) attrs.push(`target="${link.target}"`);
  if (link.rel) attrs.push(`rel="${escapeHtml(link.rel)}"`);
  return attrs;
}

function layerToHtmlString(layer: Layer, indent: number): string {
  const pad = '  '.repeat(indent);
  const tag = resolveExportTag(layer);
  const classes = getClassesString(layer);

  const attrs: string[] = [];
  if (classes) attrs.push(`class="${escapeHtml(classes)}"`);

  if (layer.attributes?.id) {
    attrs.push(`id="${escapeHtml(layer.attributes.id)}"`);
  }

  const linkSettings = layer.variables?.link;
  if (tag === 'a' && linkSettings) {
    attrs.push(...buildLinkAttrs(linkSettings));
  }

  if (layer.name === 'image') {
    const src = getVariableContent(layer.variables?.image?.src);
    const alt = getVariableContent(layer.variables?.image?.alt);
    if (src) attrs.push(`src="${escapeHtml(src)}"`);
    attrs.push(`alt="${escapeHtml(alt)}"`);
    if (layer.attributes?.width) attrs.push(`width="${escapeHtml(layer.attributes.width)}"`);
    if (layer.attributes?.height) attrs.push(`height="${escapeHtml(layer.attributes.height)}"`);
  }

  if (layer.name === 'input') {
    if (layer.attributes?.type) attrs.push(`type="${escapeHtml(layer.attributes.type)}"`);
    if (layer.attributes?.placeholder) attrs.push(`placeholder="${escapeHtml(layer.attributes.placeholder)}"`);
    if (layer.attributes?.name) attrs.push(`name="${escapeHtml(layer.attributes.name)}"`);
  }

  if (layer.name === 'iframe') {
    const src = getVariableContent(layer.variables?.iframe?.src);
    if (src) attrs.push(`src="${escapeHtml(src)}"`);
  }

  if (layer.name === 'video' || layer.name === 'audio') {
    const src = getVariableContent(layer.variables?.[layer.name as 'video' | 'audio']?.src);
    if (src) attrs.push(`src="${escapeHtml(src)}"`);
    if (layer.attributes?.controls) attrs.push('controls');
    if (layer.attributes?.loop) attrs.push('loop');
    if (layer.attributes?.muted) attrs.push('muted');
    if (layer.attributes?.autoplay) attrs.push('autoplay');
  }

  const attrStr = attrs.length > 0 ? ` ${attrs.join(' ')}` : '';

  if (SELF_CLOSING_TAGS.has(tag)) {
    return `${pad}<${tag}${attrStr} />`;
  }

  if (layer.name === 'icon') {
    const iconSrc = layer.variables?.icon?.src;
    if (iconSrc && iconSrc.type === 'static_text') {
      return `${pad}${(iconSrc.data as any).content}`;
    }
    return `${pad}<span${attrStr}></span>`;
  }

  const textHtml = getLayerTextHtml(layer);
  const openTag = `${pad}<${tag}${attrStr}>`;
  const closeTag = `</${tag}>`;

  if (textHtml && (!layer.children || layer.children.length === 0)) {
    return `${openTag}${textHtml}${closeTag}`;
  }

  if (!layer.children || layer.children.length === 0) {
    return `${openTag}${closeTag}`;
  }

  const childHtml = layer.children
    .map((child) => layerToHtmlString(child, indent + 1))
    .join('\n');

  return `${openTag}\n${childHtml}\n${pad}${closeTag}`;
}

/**
 * Convert a single layer and its children to HTML.
 */
export function layerToExportHtml(layer: Layer): string {
  return layerToHtmlString(layer, 0);
}
