// Element selection inside the reviewed page (content script). While active, a transparent layer
// covers the page, so the site receives none of these clicks:
// - hover highlights the element under the pointer; a click selects it;
// - a drag draws a box and selects the smallest element that contains everything in the box.
// The layer is a popover (top layer), placed inside an open modal dialog when there is one.
import type { FromPage } from '@/lib/messages';
import { pageContext } from './context';
import type { ViewportRect } from './crop';

const DRAG_MIN = 4; // px: below this a press is a click, not a drag

export function createPicker(send: (m: FromPage) => void) {
  let host: HTMLElement | undefined;
  let onScroll: (() => void) | undefined;

  /** The page element under a point, looking through Pinpoint's layer. */
  function elementAt(x: number, y: number) {
    const el = document.elementsFromPoint(x, y).find((e) => e !== host);
    return el && el !== document.documentElement ? el : undefined;
  }

  /** Smallest element whose box contains the whole dragged box. */
  function enclosing(box: ViewportRect) {
    let el = elementAt(box.x + box.width / 2, box.y + box.height / 2);
    while (el && el !== document.body) {
      const r = el.getBoundingClientRect();
      if (
        r.left <= box.x + 1 &&
        r.top <= box.y + 1 &&
        r.right >= box.x + box.width - 1 &&
        r.bottom >= box.y + box.height - 1
      ) {
        return el;
      }
      el = el.parentElement ?? undefined;
    }
    return document.body;
  }

  function start() {
    stop();
    const layer = document.createElement('pinpoint-overlay');
    host = layer;
    layer.setAttribute('popover', 'manual');
    layer.style.cssText =
      'position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;margin:0;' +
      'border:0;padding:0;background:transparent;overflow:visible;z-index:2147483647;cursor:crosshair;';
    const root = layer.attachShadow({ mode: 'closed' });
    root.innerHTML = `
      <style>
        .target { position: fixed; display: none; border: 2px solid #2563eb; border-radius: 3px;
                  background: rgb(37 99 235 / 0.12); box-sizing: border-box; pointer-events: none; }
        .drag { position: fixed; display: none; border: 1px dashed #0f172a; pointer-events: none; }
        .label, .hint { position: fixed; font: 12px/1.4 system-ui, sans-serif; color: white;
                background: #1e293b; padding: 2px 6px; border-radius: 4px; white-space: nowrap;
                pointer-events: none; }
        .label { display: none; }
        .hint { bottom: 12px; left: 50%; transform: translateX(-50%); padding: 6px 10px; }
      </style>
      <div class="target"></div><div class="drag"></div><div class="label"></div>
      <div class="hint">Click an element, or drag a box to take the element around it · Esc cancels</div>`;
    const target = root.querySelector<HTMLElement>('.target')!;
    const drag = root.querySelector<HTMLElement>('.drag')!;
    const label = root.querySelector<HTMLElement>('.label')!;
    // An open modal dialog makes everything outside it inert: the layer goes inside the topmost one.
    const modal = [...document.querySelectorAll(':modal')].at(-1);
    (modal ?? document.documentElement).append(layer);
    layer.showPopover?.();

    let current: Element | undefined;
    let origin: { x: number; y: number } | undefined;
    let dragging = false;

    const place = (node: HTMLElement, r: ViewportRect) =>
      Object.assign(node.style, {
        display: 'block',
        left: `${r.x}px`,
        top: `${r.y}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      });

    function highlight(el: Element | undefined) {
      current = el;
      if (!el) return void (target.style.display = label.style.display = 'none');
      const r = el.getBoundingClientRect();
      place(target, { x: r.left, y: r.top, width: r.width, height: r.height });
      label.textContent = `${el.tagName.toLowerCase()} · ${Math.round(r.width)}×${Math.round(r.height)}`;
      Object.assign(label.style, {
        display: 'block',
        left: `${Math.max(4, r.left)}px`,
        top: `${r.top > 24 ? r.top - 22 : r.bottom + 4}px`,
      });
    }

    const boxTo = (e: PointerEvent): ViewportRect => ({
      x: Math.min(origin!.x, e.clientX),
      y: Math.min(origin!.y, e.clientY),
      width: Math.abs(e.clientX - origin!.x),
      height: Math.abs(e.clientY - origin!.y),
    });

    layer.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      layer.setPointerCapture(e.pointerId);
      origin = { x: e.clientX, y: e.clientY };
      dragging = false;
    });
    layer.addEventListener('pointermove', (e) => {
      if (!origin) return highlight(elementAt(e.clientX, e.clientY));
      const box = boxTo(e);
      dragging ||= box.width >= DRAG_MIN || box.height >= DRAG_MIN;
      if (!dragging) return;
      place(drag, box);
      highlight(enclosing(box));
    });
    layer.addEventListener('pointerup', (e) => {
      if (!origin) return;
      const el = dragging ? enclosing(boxTo(e)) : (current ?? elementAt(e.clientX, e.clientY));
      origin = undefined;
      drag.style.display = 'none';
      if (el) select(el);
    });
    window.addEventListener('keydown', onKey, true);
    onScroll = () => current && highlight(current);
    window.addEventListener('scroll', onScroll, true);
  }

  let lastSelected: Element | undefined;

  function select(el: Element) {
    lastSelected = el;
    // The screenshot is the element only: bring it fully on screen when it fits.
    const r = el.getBoundingClientRect();
    const fits = r.width <= window.innerWidth && r.height <= window.innerHeight;
    const cut =
      r.top < 0 || r.left < 0 || r.bottom > window.innerHeight || r.right > window.innerWidth;
    if (fits && cut) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    // Chrome screenshots the last frame it displayed: remove the layer, then wait until the page
    // without it was painted and shown (two frames are not always enough).
    if (host) host.style.display = 'none';
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        setTimeout(() => {
          const { x, y, width, height } = el.getBoundingClientRect();
          send({
            type: 'pinpoint:selected',
            context: pageContext(el),
            rect: { x, y, width, height },
          });
        }, 100),
      ),
    );
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
    if (onScroll) window.removeEventListener('scroll', onScroll, true);
    host?.remove();
    host = undefined;
  }

  // Right-click › Comment with Pinpoint: the element under the cursor, remembered here because
  // the menu click itself does not say which element it was.
  let rightClicked: Element | undefined;
  document.addEventListener(
    'contextmenu',
    (e) => {
      const target = e.composedPath()[0];
      rightClicked = target instanceof Element ? target : undefined;
    },
    true,
  );

  /** Selects the right-clicked element at once. False when there is none to select. */
  function selectRightClicked() {
    if (!rightClicked?.isConnected) return false;
    stop();
    select(rightClicked);
    return true;
  }

  /** The element chosen last: where the comment box goes. */
  const selected = () => lastSelected;

  return { start, stop, selectRightClicked, selected };
}
