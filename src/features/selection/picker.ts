// Element picker running inside the reviewed page (content script). Draws its highlight in a
// shadow root so page styles cannot touch it, and swallows clicks while active so the site does
// not react to the selecting click.
import type { FromPage, PageContext } from '@/lib/messages';

const HINT = 'Click to select · ↑ parent · ↓ child · Esc cancel';

export function pageContext(el?: Element): PageContext {
  const ctx: PageContext = {
    page_url: location.href,
    page_title: document.title || undefined,
    viewport_width: window.innerWidth,
    viewport_height: window.innerHeight,
  };
  if (!el) return ctx;
  const r = el.getBoundingClientRect();
  const text = (el as HTMLElement).innerText?.replace(/\s+/g, ' ').trim();
  return {
    ...ctx,
    element_tag: el.tagName.toLowerCase(),
    element_text: text ? text.slice(0, 120) : undefined,
    element_x: Math.round(r.left + window.scrollX),
    element_y: Math.round(r.top + window.scrollY),
    element_width: Math.round(r.width),
    element_height: Math.round(r.height),
  };
}

export function createPicker(send: (m: FromPage) => void) {
  let host: HTMLElement | undefined;
  let box: HTMLElement;
  let label: HTMLElement;
  let hint: HTMLElement;
  let current: Element | undefined;
  let downStack: Element[] = []; // children left when moving up, for ↓
  let frozen = false; // selected, waiting for the side panel to take the screenshot

  function mount() {
    host = document.createElement('pinpoint-overlay');
    // A popover sits in the browser's top layer, so the highlight also shows above modal dialogs
    // that are already open (z-index alone cannot beat the top layer).
    host.setAttribute('popover', 'manual');
    host.style.cssText =
      'position:fixed;inset:0;width:100vw;height:100vh;max-width:none;max-height:none;margin:0;' +
      'border:0;padding:0;background:transparent;overflow:visible;pointer-events:none;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `
      <style>
        .box { position: fixed; border: 2px solid #2563eb; background: rgb(37 99 235 / 0.12);
               border-radius: 3px; box-sizing: border-box; transition: all 60ms ease-out; display: none; }
        .box.selected { border-color: #dc2626; background: rgb(220 38 38 / 0.10); }
        .label, .hint { position: fixed; font: 12px/1.4 system-ui, sans-serif; color: white;
               background: #1e293b; padding: 2px 6px; border-radius: 4px; white-space: nowrap; }
        .hint { bottom: 12px; left: 50%; transform: translateX(-50%); padding: 6px 10px; }
      </style>
      <div class="box"></div><div class="label"></div><div class="hint">${HINT}</div>`;
    box = root.querySelector('.box')!;
    label = root.querySelector('.label')!;
    hint = root.querySelector('.hint')!;
    document.documentElement.append(host);
    host.showPopover?.();
  }

  function draw() {
    if (!current) return;
    const r = current.getBoundingClientRect();
    Object.assign(box.style, {
      display: 'block',
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
    });
    label.textContent = `${current.tagName.toLowerCase()} · ${Math.round(r.width)}×${Math.round(r.height)}`;
    label.style.left = `${Math.max(4, r.left)}px`;
    label.style.top = `${r.top > 24 ? r.top - 22 : r.bottom + 4}px`;
  }

  function target(e: MouseEvent) {
    const el = document.elementFromPoint(e.clientX, e.clientY); // the overlay ignores the pointer
    return el && el !== document.documentElement ? el : undefined;
  }

  const swallow = (e: Event) => {
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  function onMove(e: MouseEvent) {
    if (frozen) return;
    const el = target(e);
    // After ↑ the reviewer chose a level: keep it while the pointer stays inside that element.
    if (el && downStack.length && current?.contains(el)) return;
    if (el && el !== current) {
      current = el;
      downStack = [];
      draw();
    }
  }

  function onClick(e: MouseEvent) {
    swallow(e);
    if (frozen) return;
    current ??= target(e);
    if (!current) return;
    frozen = true;
    box.classList.add('selected');
    label.style.display = 'none';
    hint.style.display = 'none';
    // Let the hint disappear from the screen before the side panel takes the screenshot.
    requestAnimationFrame(() =>
      requestAnimationFrame(() =>
        send({ type: 'pinpoint:selected', context: pageContext(current) }),
      ),
    );
  }

  function onKey(e: KeyboardEvent) {
    if (frozen) return;
    if (e.key === 'Escape') {
      swallow(e);
      stop();
      send({ type: 'pinpoint:select-cancelled' });
    } else if (
      e.key === 'ArrowUp' &&
      current?.parentElement &&
      current.parentElement !== document.documentElement
    ) {
      swallow(e);
      downStack.push(current);
      current = current.parentElement;
      draw();
    } else if (e.key === 'ArrowDown' && current) {
      swallow(e);
      const child = downStack.pop() ?? current.firstElementChild;
      if (child) current = child;
      draw();
    }
  }

  const blocked = [
    'mousedown',
    'mouseup',
    'pointerdown',
    'pointerup',
    'dblclick',
    'contextmenu',
    'submit',
  ];
  function listen(on: boolean) {
    const f = (on ? window.addEventListener : window.removeEventListener).bind(window);
    f('mousemove', onMove as EventListener, true);
    f('click', onClick as EventListener, true);
    f('keydown', onKey as EventListener, true);
    f('scroll', draw, true);
    f('resize', draw, true);
    for (const type of blocked) f(type, swallow, true);
  }

  function start() {
    stop();
    mount();
    frozen = false;
    current = undefined;
    listen(true);
  }

  function stop() {
    listen(false);
    host?.remove();
    host = undefined;
    current = undefined;
    downStack = [];
    frozen = false;
  }

  return { start, stop };
}
