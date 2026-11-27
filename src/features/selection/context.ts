// What a comment records about the selected element (MAS-68). Everything here is best effort:
// pages change, and a selector or position may no longer match later.
// Data minimization: no form values, no child HTML, and only a short text.
import type { PageContext } from '@/lib/messages';

const SAFE_ATTRS = /^(id|class|role|type|name|href|src|alt|title|placeholder|for|aria-.+)$/;

/** CSS path from the nearest unique id (or the root) down to the element. */
export function selectorFor(el: Element) {
  const parts: string[] = [];
  for (let e: Element | null = el; e && e !== document.documentElement; e = e.parentElement) {
    if (e.id && document.querySelectorAll(`#${CSS.escape(e.id)}`).length === 1) {
      parts.unshift(`#${CSS.escape(e.id)}`);
      break;
    }
    const tag = e.tagName.toLowerCase();
    const twins = [...(e.parentElement?.children ?? [])].filter((c) => c.tagName === e!.tagName);
    parts.unshift(twins.length > 1 ? `${tag}:nth-of-type(${twins.indexOf(e) + 1})` : tag);
  }
  return parts.join(' > ');
}

/** The element's opening tag with harmless attributes only (no value, no data-*, no children). */
export function htmlSnippet(el: Element) {
  const attrs = [...el.attributes]
    .filter((a) => SAFE_ATTRS.test(a.name))
    .map((a) => ` ${a.name}="${a.value.slice(0, 80).replace(/"/g, '&quot;')}"`)
    .join('');
  return `<${el.tagName.toLowerCase()}${attrs}>`.slice(0, 300);
}

const clean = (s?: string | null) => s?.replace(/\s+/g, ' ').trim() || undefined;

/** Accessible name first, then visible text. Never the content of fields people type into. */
export function labelFor(el: Element) {
  const byIds = el
    .getAttribute('aria-labelledby')
    ?.split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent)
    .join(' ');
  const forLabel = el.id
    ? document.querySelector(`label[for="${CSS.escape(el.id)}"]`)?.textContent
    : undefined;
  const typed = el.matches('input, textarea, select, [contenteditable=""], [contenteditable=true]');
  const label =
    clean(el.getAttribute('aria-label')) ??
    clean(byIds) ??
    clean(forLabel) ??
    clean(el.getAttribute('alt')) ??
    clean(el.getAttribute('title')) ??
    clean(el.getAttribute('placeholder')) ??
    (typed ? undefined : clean((el as HTMLElement).innerText));
  return label?.slice(0, 120);
}

export function pageContext(el: Element): PageContext {
  const r = el.getBoundingClientRect();
  return {
    page_url: location.href,
    page_title: document.title || undefined,
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
    element_selector: selectorFor(el),
    element_tag: el.tagName.toLowerCase(),
    element_text: labelFor(el),
    element_html: htmlSnippet(el),
    // Document coordinates: scrolling is added back.
    element_x: Math.round(r.left + window.scrollX),
    element_y: Math.round(r.top + window.scrollY),
    element_width: Math.round(r.width),
    element_height: Math.round(r.height),
  };
}
