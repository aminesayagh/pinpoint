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
        .outline { position: fixed; border: 2px solid #2563eb; border-radius: 5px; box-sizing: border-box; pointer-events: none; }
        .card { position: fixed; width: ${WIDTH}px; box-sizing: border-box; padding: 10px;
                background: white; color: #0f172a; border-radius: 10px;
                box-shadow: 0 8px 30px rgb(15 23 42 / 0.25); font: 13px/1.4 system-ui, sans-serif; }
        textarea { width: 100%; box-sizing: border-box; min-height: 76px; resize: vertical;
                   border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px 8px;
                   font: inherit; color: inherit; background: white; }
        textarea:focus { outline: 2px solid #2563eb; outline-offset: -1px; border-color: transparent; }
        .row { display: flex; align-items: center; gap: 6px; margin-top: 8px; }
        .hint { margin-right: auto; color: #64748b; font-size: 11px; }
        button { font: inherit; border: 0; border-radius: 6px; padding: 5px 10px; cursor: pointer; }
        .save { background: #2563eb; color: white; }
        .save:disabled { opacity: 0.5; cursor: default; }
        .cancel { background: #e2e8f0; color: #0f172a; }
      </style>
      <div class="outline"></div>
      <div class="card" role="dialog" aria-label="Pinpoint comment">
        <textarea aria-label="Comment" placeholder="What is wrong, and what did you expect?"></textarea>
        <div class="row">
          <span class="hint">Ctrl+Enter to save</span>
          <button type="button" class="cancel">Cancel</button>
          <button type="button" class="save" disabled>Save</button>
        </div>
      </div>`;
    const outline = root.querySelector<HTMLElement>('.outline')!;
    const card = root.querySelector<HTMLElement>('.card')!;
    const text = root.querySelector('textarea')!;
    const save = root.querySelector<HTMLButtonElement>('.save')!;

    const submit = () => {
      if (!text.value.trim()) return;
      send({ type: 'pinpoint:compose-save', text: text.value.trim() });
      close();
    };
    const cancel = () => {
      send({ type: 'pinpoint:compose-cancel' });
      close();
    };
    text.addEventListener('input', () => (save.disabled = !text.value.trim()));
    save.addEventListener('click', submit);
    root.querySelector('.cancel')!.addEventListener('click', cancel);
    // Typing here must not reach the site's own keyboard shortcuts.
    for (const type of ['keydown', 'keyup', 'keypress'] as const) {
      layer.addEventListener(type, (e) => {
        e.stopPropagation();
        if (type !== 'keydown') return;
        const k = e as KeyboardEvent;
        if (k.key === 'Escape') cancel();
        if (k.key === 'Enter' && (k.ctrlKey || k.metaKey)) submit();
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
