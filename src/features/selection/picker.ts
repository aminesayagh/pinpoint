// Marquee selection inside the reviewed page (content script). While active, a transparent layer
// covers the page: the reviewer drags a box around what they want to comment on, and the site
// receives none of those clicks. The layer is a popover so it sits above open modal dialogs.
import type { FromPage, PageContext } from '@/lib/messages';
import type { ViewportRect } from './crop';

const MIN_SIZE = 4; // px: smaller drags are treated as stray clicks

/** Smallest element that fully contains the box: best-effort context for the comment. */
function enclosingElement(rect: ViewportRect): Element {
  let el = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
  while (el && el !== document.body && el !== document.documentElement) {
    const r = el.getBoundingClientRect();
    const contains =
      r.left <= rect.x + 1 &&
      r.top <= rect.y + 1 &&
      r.right >= rect.x + rect.width - 1 &&
      r.bottom >= rect.y + rect.height - 1;
    if (contains) return el;
    el = el.parentElement;
  }
  return document.body;
}

/** The selected region (document coordinates) and the element around it. */
export function pageContext(rect: ViewportRect): PageContext {
  const el = enclosingElement(rect);
  const text = (el as HTMLElement).innerText?.replace(/\s+/g, ' ').trim();
  return {
    page_url: location.href,
    page_title: document.title || undefined,
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
    element_tag: el.tagName.toLowerCase(),
    element_text: text ? text.slice(0, 120) : undefined,
    element_x: Math.round(rect.x + window.scrollX),
    element_y: Math.round(rect.y + window.scrollY),
    element_width: Math.round(rect.width),
    element_height: Math.round(rect.height),
  };
}

export function createPicker(send: (m: FromPage) => void) {
  let host: HTMLElement | undefined;

  function start() {
    stop();
    host = document.createElement('pinpoint-overlay');
    host.setAttribute('popover', 'manual');
    host.style.cssText =
      'position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;margin:0;' +
      'border:0;padding:0;background:transparent;overflow:visible;z-index:2147483647;cursor:crosshair;';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `
      <style>
        .layer { position: fixed; inset: 0; background: rgb(15 23 42 / 0.08); }
        .box { position: fixed; display: none; border: 2px dashed #2563eb;
               background: rgb(37 99 235 / 0.10); box-sizing: border-box; }
        .hint { position: fixed; bottom: 12px; left: 50%; transform: translateX(-50%);
                font: 12px/1.4 system-ui, sans-serif; color: white; background: #1e293b;
                padding: 6px 10px; border-radius: 4px; white-space: nowrap; pointer-events: none; }
      </style>
      <div class="layer"></div><div class="box"></div>
      <div class="hint">Drag a box around what you want to comment on · Esc cancels</div>`;
    const box = root.querySelector<HTMLElement>('.box')!;
    // An open modal dialog makes everything outside it inert, so the layer goes inside the
    // topmost one to keep receiving the drag.
    const modal = [...document.querySelectorAll(':modal')].at(-1);
    (modal ?? document.documentElement).append(host);
    host.showPopover?.();

    let origin: { x: number; y: number } | undefined;
    const rectTo = (e: PointerEvent): ViewportRect => ({
      x: Math.min(origin!.x, e.clientX),
      y: Math.min(origin!.y, e.clientY),
      width: Math.abs(e.clientX - origin!.x),
      height: Math.abs(e.clientY - origin!.y),
    });

    host.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      host!.setPointerCapture(e.pointerId);
      origin = { x: e.clientX, y: e.clientY };
    });
    host.addEventListener('pointermove', (e) => {
      if (!origin) return;
      const r = rectTo(e);
      Object.assign(box.style, {
        display: 'block',
        left: `${r.x}px`,
        top: `${r.y}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      });
    });
    host.addEventListener('pointerup', (e) => {
      if (!origin) return;
      const rect = rectTo(e);
      origin = undefined;
      box.style.display = 'none';
      if (rect.width < MIN_SIZE || rect.height < MIN_SIZE) return;
      // The screenshot is the last frame Chrome displayed: remove the layer, then wait until the
      // page without it was painted and shown (two frames are not always enough).
      host!.style.display = 'none';
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          setTimeout(
            () => send({ type: 'pinpoint:selected', context: pageContext(rect), rect }),
            100,
          ),
        ),
      );
    });
    window.addEventListener('keydown', onKey, true);
  }

  function onKey(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !host || host.style.display === 'none') return;
    e.preventDefault();
    e.stopImmediatePropagation();
    stop();
    send({ type: 'pinpoint:select-cancelled' });
  }

  function stop() {
    window.removeEventListener('keydown', onKey, true);
    host?.remove();
    host = undefined;
  }

  return { start, stop };
}
