// The comment box floating next to the selected element, inside the reviewed page (MAS-75).
// Opened only after the screenshot was taken, so it never appears in it. The box is an extension
// frame (entrypoints/composer): keys typed in it never reach the page, so sites that grab typing
// for their own field (ChatGPT does) cannot take it. This script draws the ring and places the frame.

const WIDTH = 300;
const GAP = 8;
const PAD = 12; // room for the box's shadow inside the frame

export function createComposer() {
  let host: HTMLElement | undefined;
  let frame = 0;
  let onMessage: ((e: MessageEvent) => void) | undefined;

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
        iframe { position: fixed; width: ${WIDTH + 2 * PAD}px; height: ${44 + 2 * PAD}px;
                 border: 0; margin: 0; padding: 0; background: transparent; color-scheme: light; }
        /* Entrance: the box rises toward the element, the ring fades in (the pin pops, in the frame). */
        iframe { animation: pp-rise 200ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
                 transform-origin: top left; --from: 6px; }
        iframe.above { transform-origin: bottom left; --from: -6px; }
        .outline { animation: pp-fade 200ms ease-out both; }
        @keyframes pp-rise { from { opacity: 0; transform: translateY(var(--from)) scale(0.97); } }
        @keyframes pp-fade { from { opacity: 0; } }
        @media (prefers-reduced-motion: reduce) { iframe, .outline { animation: none; } }
      </style>
      <div class="outline"></div>
      <iframe title="Pinpoint comment" allowtransparency="true"></iframe>`;
    const outline = root.querySelector<HTMLElement>('.outline')!;
    const box = root.querySelector('iframe')!;
    box.src = browser.runtime.getURL('/composer.html');

    // From the frame only: its height, and "close" after it sent or cancelled the comment.
    onMessage = (e: MessageEvent) => {
      if (e.source !== box.contentWindow) return;
      const m = (e.data as { pinpoint?: { size: number } | 'close' })?.pinpoint;
      if (m === 'close') close();
      else if (m?.size) box.style.height = `${m.size}px`;
    };
    window.addEventListener('message', onMessage);

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
      const h = box.offsetHeight - 2 * PAD;
      const below = r.bottom + GAP;
      const above = r.top - GAP - h;
      const fitsBelow = below + h <= innerHeight;
      const top = fitsBelow ? below : above >= 0 ? above : Math.max(GAP, innerHeight - h - GAP);
      box.classList.toggle('above', !fitsBelow && above >= 0);
      const left = Math.max(GAP, Math.min(Math.max(GAP, r.left), innerWidth - WIDTH - GAP));
      Object.assign(box.style, { top: `${top - PAD}px`, left: `${left - PAD}px` });
      frame = requestAnimationFrame(place); // follows scrolling and layout changes
    };

    const modal = [...document.querySelectorAll(':modal')].at(-1);
    (modal ?? document.documentElement).append(layer);
    layer.showPopover?.();
    place();
    box.addEventListener('load', () => box.focus());
  }

  function close() {
    cancelAnimationFrame(frame);
    if (onMessage) window.removeEventListener('message', onMessage);
    host?.remove();
    host = undefined;
  }

  return { open, close };
}
