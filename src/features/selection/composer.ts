// The comment box floating next to the selected element, inside the reviewed page (MAS-75).
// Opened only after the screenshot was taken, so it never appears in it. The side panel owns
// saving: the box only sends the text back.
import type { FromPage } from '@/lib/messages';

const WIDTH = 300;
const GAP = 8;

export function createComposer(send: (m: FromPage) => void) {
  let host: HTMLElement | undefined;
  let frame = 0;

  function open(target: () => DOMRect) {
    close();
    const layer = document.createElement('pinpoint-composer');
    host = layer;
    layer.setAttribute('popover', 'manual');
    // A zero-size layer: the page stays usable around the box.
    layer.style.cssText =
      'position:fixed;inset:auto;top:0;left:0;width:0;height:0;margin:0;border:0;padding:0;' +
      'background:transparent;overflow:visible;z-index:2147483647;';
    const root = layer.attachShadow({ mode: 'closed' });
    root.innerHTML = `
      <style>
        .outline { position: fixed; border: 2px solid rgb(37 99 235 / 0.4); border-radius: 5px;
                   box-sizing: border-box; pointer-events: none; }
        .card { position: fixed; width: ${WIDTH}px; display: flex; align-items: flex-start;
                gap: 8px; font: 14px/20px system-ui, sans-serif; }
        .pin { flex: none; width: 24px; height: 24px; margin-top: 6px; background: #2563eb;
               border-radius: 50% 50% 50% 0; box-shadow: 0 2px 6px rgb(15 23 42 / 0.25); }
        .pill { flex: 1; display: flex; align-items: flex-end; gap: 6px; min-width: 0;
                padding: 5px 5px 5px 14px; background: white; border: 1.5px solid #2563eb;
                border-radius: 18px; box-shadow: 0 6px 20px rgb(15 23 42 / 0.18); }
        textarea { flex: 1; min-width: 0; height: 20px; max-height: 140px; margin: 3px 0;
                   padding: 0; border: 0; outline: 0; resize: none; overflow-y: auto;
                   font: inherit; color: #0f172a; background: transparent; }
        textarea::placeholder { color: #94a3b8; }
        .send { flex: none; width: 26px; height: 26px; border: 0; border-radius: 50%;
                display: grid; place-items: center; cursor: pointer;
                background: #2563eb; color: white; }
        .send:disabled { background: #e2e8f0; color: #94a3b8; cursor: default; }
        /* Entrance: the box rises toward the element, the pin pops, the ring fades in. */
        .card { animation: pp-rise 200ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
                transform-origin: top left; --from: 6px; }
        .card.above { transform-origin: bottom left; --from: -6px; }
        .pin { animation: pp-pop 280ms 60ms cubic-bezier(0.34, 1.56, 0.64, 1) both; }
        .outline { animation: pp-fade 200ms ease-out both; }
        @keyframes pp-rise { from { opacity: 0; transform: translateY(var(--from)) scale(0.97); } }
        @keyframes pp-pop { from { opacity: 0; transform: scale(0.4); } }
        @keyframes pp-fade { from { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) {
          .card, .pin, .outline { animation: none; }
        }
      </style>
      <div class="outline"></div>
      <div class="card">
        <div class="pin"></div>
        <div class="pill">
          <textarea rows="1" aria-label="Comment" placeholder="Add a comment"></textarea>
          <button type="button" class="send" aria-label="Save comment" disabled>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                 stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 13V3M3.5 7.5 8 3l4.5 4.5"/></svg>
          </button>
        </div>
      </div>`;
    const outline = root.querySelector<HTMLElement>('.outline')!;
    const card = root.querySelector<HTMLElement>('.card')!;
    const text = root.querySelector('textarea')!;
    const save = root.querySelector<HTMLButtonElement>('.send')!;

    const submit = () => {
      if (!text.value.trim()) return;
      send({ type: 'pinpoint:compose-save', text: text.value.trim() });
      close();
    };
    const cancel = () => {
      send({ type: 'pinpoint:compose-cancel' });
      close();
    };
    text.addEventListener('input', () => {
      save.disabled = !text.value.trim();
      // One line to start, growing with the text.
      text.style.height = '20px';
      text.style.height = `${text.scrollHeight}px`;
    });
    save.addEventListener('click', submit);
    // Typing here must not reach the site's own keyboard shortcuts.
    for (const type of ['keydown', 'keyup', 'keypress'] as const) {
      layer.addEventListener(type, (e) => {
        e.stopPropagation();
        if (type !== 'keydown') return;
        const k = e as KeyboardEvent;
        if (k.key === 'Escape') cancel();
        // Enter sends, Shift+Enter starts a new line.
        if (k.key === 'Enter' && !k.shiftKey && !k.isComposing) {
          k.preventDefault();
          submit();
        }
      });
    }

    // Below the element, above it when there is no room, always inside the window.
    const place = () => {
      const r = target();
      // A ring just outside the element, visible on any element color.
      Object.assign(outline.style, {
        left: `${r.left - 3}px`,
        top: `${r.top - 3}px`,
        width: `${r.width + 6}px`,
        height: `${r.height + 6}px`,
      });
      const h = card.offsetHeight;
      const below = r.bottom + GAP;
      const above = r.top - GAP - h;
      const top =
        below + h <= innerHeight
          ? below
          : above >= 0
            ? above
            : Math.max(GAP, innerHeight - h - GAP);
      const left = Math.min(Math.max(GAP, r.left), innerWidth - WIDTH - GAP);
      Object.assign(card.style, { top: `${top}px`, left: `${Math.max(GAP, left)}px` });
      frame = requestAnimationFrame(place); // follows scrolling and layout changes
    };

    const modal = [...document.querySelectorAll(':modal')].at(-1);
    (modal ?? document.documentElement).append(layer);
    layer.showPopover?.();
    place();
    text.focus();
  }

  function close() {
    cancelAnimationFrame(frame);
    host?.remove();
    host = undefined;
  }

  return { open, close };
}
