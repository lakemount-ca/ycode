import React from 'react';

const VOID_TAGS = new Set(['meta', 'link', 'base']);

const HTML_TO_REACT_ATTRS: Record<string, string> = {
  'class': 'className',
  'for': 'htmlFor',
  'crossorigin': 'crossOrigin',
  'charset': 'charSet',
  'http-equiv': 'httpEquiv',
  'tabindex': 'tabIndex',
  'nomodule': 'noModule',
  'referrerpolicy': 'referrerPolicy',
  'fetchpriority': 'fetchPriority',
};

const BOOLEAN_ATTRS = new Set([
  'async', 'defer', 'disabled', 'hidden', 'nomodule',
  'readonly', 'required', 'reversed', 'scoped',
]);

const TAG_REGEX =
  /<(meta|link|base)(\s(?:[^>"']|"[^"]*"|'[^']*')*)?\s*\/?>|<(style|script|title|noscript)(\s[^>]*)?>[\s\S]*?<\/\3\s*>/gi;

function parseAttributes(attrString: string): Record<string, unknown> {
  const attrs: Record<string, unknown> = {};
  const regex = /([\w-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
  let match;
  while ((match = regex.exec(attrString)) !== null) {
    const rawName = match[1];
    const value = match[2] ?? match[3] ?? match[4];
    const reactName = HTML_TO_REACT_ATTRS[rawName.toLowerCase()] || rawName;

    if (BOOLEAN_ATTRS.has(rawName.toLowerCase())) {
      attrs[reactName] = true;
    } else {
      attrs[reactName] = value ?? '';
    }
  }
  return attrs;
}

function extractInnerHtml(full: string, tag: string): string {
  const innerMatch = full.match(
    new RegExp(`<${tag}[^>]*>([\\s\\S]*)<\\/${tag}\\s*>`, 'i'),
  );
  return innerMatch ? innerMatch[1] : '';
}

/** Parse an HTML string of head elements into React elements (for use inside a real <head> tag). */
export function parseHeadHtml(html: string): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  TAG_REGEX.lastIndex = 0;

  let match;
  let key = 0;

  while ((match = TAG_REGEX.exec(html)) !== null) {
    const voidTag = match[1]?.toLowerCase();
    const voidAttrStr = match[2] || '';
    const pairedTag = match[3]?.toLowerCase();
    const pairedAttrStr = match[4] || '';

    if (voidTag) {
      const attrs = parseAttributes(voidAttrStr.trim());
      elements.push(React.createElement(voidTag, { key: key++, ...attrs }));
    } else if (pairedTag) {
      const attrs = parseAttributes(pairedAttrStr.trim());
      const inner = extractInnerHtml(match[0], pairedTag);

      if (pairedTag === 'title') {
        elements.push(React.createElement('title', { key: key++ }, inner));
      } else {
        elements.push(
          React.createElement(pairedTag, {
            key: key++,
            ...attrs,
            dangerouslySetInnerHTML: { __html: inner },
          }),
        );
      }
    }
  }

  return elements;
}
