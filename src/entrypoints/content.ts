import { createPicker } from '@/features/selection/picker';
import type { FromPage, ToPage } from '@/lib/messages';

export default defineContentScript({
  // Registered at runtime, only on sites the reviewer allowed (see lib/sites.ts).
  registration: 'runtime',
  main() {
    const w = window as { __pinpoint?: boolean };
    if (w.__pinpoint) return; // already injected in this page
    w.__pinpoint = true;

    const picker = createPicker((m: FromPage) => void browser.runtime.sendMessage(m));
    browser.runtime.onMessage.addListener((m: ToPage, _sender, reply) => {
      if (m.type === 'pinpoint:select-start') picker.start();
      if (m.type === 'pinpoint:select-stop') picker.stop();
      if (m.type === 'pinpoint:select-right-clicked')
        return void reply(picker.selectRightClicked());
      reply(true); // ack, so the side panel knows the script is here
    });
  },
});
