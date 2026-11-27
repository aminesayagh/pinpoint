export default defineContentScript({
  // Registered at runtime, only on sites the reviewer allowed (see lib/sites.ts).
  registration: 'runtime',
  main() {
    const w = window as { __pinpoint?: boolean };
    if (w.__pinpoint) return; // already injected in this page
    w.__pinpoint = true;
  },
});
