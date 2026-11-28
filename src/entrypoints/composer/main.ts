// The comment box itself, in an extension frame on the reviewed page (MAS-75). Keys typed here
// never reach the page, so no site can take the focus or react to them. It sends the text to the
// side panel, and tells the page script (composer.ts) its height and when to close.
import type { FromPage } from '@/lib/messages';

const text = document.querySelector('textarea')!;
const save = document.querySelector<HTMLButtonElement>('.send')!;
const toPage = (m: { size: number } | 'close') => parent.postMessage({ pinpoint: m }, '*');
const send = async (m: FromPage) => {
  await browser.runtime.sendMessage(m).catch(() => {});
  toPage('close');
};

const submit = () => {
  if (text.value.trim()) void send({ type: 'pinpoint:compose-save', text: text.value.trim() });
};
text.addEventListener('input', () => {
  save.disabled = !text.value.trim();
  // One line to start, growing with the text.
  text.style.height = '20px';
  text.style.height = `${text.scrollHeight}px`;
});
text.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') void send({ type: 'pinpoint:compose-cancel' });
  // Enter sends, Shift+Enter starts a new line.
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    submit();
  }
});
save.addEventListener('click', submit);

new ResizeObserver(() => toPage({ size: document.body.offsetHeight })).observe(document.body);
window.addEventListener('focus', () => text.focus());
text.focus();
