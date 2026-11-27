import { Button, Label, TextArea, TextField } from '@heroui/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { addFeedback, type NewScreenshot } from '@/lib/db';
import {
  CONTEXT_COMMENT_KEY,
  type ContextCommentRequest,
  type FromBackground,
  type FromPage,
  type PageContext,
  type ToPage,
} from '@/lib/messages';
import { reachPage } from '@/lib/sites';
import { Thumbnail } from '@/features/feedback/Thumbnail';
import { cropScreenshot, type ViewportRect } from './crop';

// One action in a session: Add comment = select an element (click, or drag a box), then write.
type State =
  | { step: 'idle'; saved?: boolean }
  | { step: 'selecting' }
  | { step: 'commenting'; context: PageContext; shot?: NewScreenshot };

/** Browser and OS of the reviewer, e.g. "Chrome 142" and "Windows". */
function environment() {
  const ua = (navigator as Navigator & { userAgentData?: NavigatorUAData }).userAgentData;
  const brand = ua?.brands.find((b) => !/Not.A.Brand|Chromium/i.test(b.brand)) ?? ua?.brands[0];
  return {
    browser_name: brand ? `${brand.brand} ${brand.version}` : undefined,
    operating_system: ua?.platform || undefined,
  };
}
interface NavigatorUAData {
  brands: { brand: string; version: string }[];
  platform: string;
}

const toPage = (tabId: number, m: ToPage) => browser.tabs.sendMessage(tabId, m);

/** The selected element, cut out of a screenshot of the tab as it is right now. */
async function elementShot(windowId: number, rect: ViewportRect, viewportWidth: number) {
  const dataUrl = await browser.tabs.captureVisibleTab(windowId, { format: 'png' });
  const page = await (await fetch(dataUrl)).blob();
  return cropScreenshot(page, rect, viewportWidth);
}

export function Capture({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<State>({ step: 'idle' });
  const [error, setError] = useState<string>();
  const selectingTab = useRef<number>(undefined);

  const addComment = useCallback(async () => {
    setError(undefined);
    const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
    try {
      if (!tab?.id || !(await reachPage(tab))) {
        return setError(
          'Pinpoint needs access to this site. Open a website and allow it when Chrome asks.',
        );
      }
      await toPage(tab.id, { type: 'pinpoint:select-start' });
      selectingTab.current = tab.id;
      setState({ step: 'selecting' });
    } catch (e) {
      setError(`Could not start selecting: ${(e as Error).message}`);
    }
  }, []);

  /** Right-click › Comment with Pinpoint: the right-clicked element, or normal selection. */
  const commentOnRightClicked = useCallback(
    async (tabId: number) => {
      setError(undefined);
      selectingTab.current = tabId;
      setState({ step: 'selecting' });
      const selected = await toPage(tabId, { type: 'pinpoint:select-right-clicked' }).catch(
        () => false,
      );
      // No script on that site yet (or nothing remembered): ask for access, then select by hand.
      if (selected !== true) await addComment();
    },
    [addComment],
  );

  useEffect(() => {
    const take = async () => {
      const stored = await browser.storage.session.get(CONTEXT_COMMENT_KEY);
      const request = stored[CONTEXT_COMMENT_KEY] as ContextCommentRequest | undefined;
      if (!request) return;
      await browser.storage.session.remove(CONTEXT_COMMENT_KEY);
      if (Date.now() - request.at < 15_000) void commentOnRightClicked(request.tabId);
    };
    void take();
    const onChanged = (changes: Record<string, unknown>) => {
      if (CONTEXT_COMMENT_KEY in changes) void take();
    };
    browser.storage.session.onChanged.addListener(onChanged);
    return () => browser.storage.session.onChanged.removeListener(onChanged);
  }, [commentOnRightClicked]);

  function cancel() {
    if (selectingTab.current)
      void toPage(selectingTab.current, { type: 'pinpoint:select-stop' }).catch(() => {});
    selectingTab.current = undefined;
    setState({ step: 'idle' });
  }

  // Messages from the page (element chosen, Esc) and from the keyboard shortcut.
  useEffect(() => {
    const onMessage = (m: FromPage | FromBackground, sender: Browser.runtime.MessageSender) => {
      if (m.type === 'pinpoint:shortcut-select') return void addComment();
      if (!sender.tab?.id || sender.tab.id !== selectingTab.current) return;
      selectingTab.current = undefined;
      if (m.type === 'pinpoint:select-cancelled') return setState({ step: 'idle' });
      const { id, windowId } = sender.tab;
      void (async () => {
        let shot: NewScreenshot | undefined;
        try {
          shot = await elementShot(windowId, m.rect, m.context.viewport_width);
        } catch (e) {
          // A failed screenshot must not cost the comment.
          setError(
            `The screenshot failed (${(e as Error).message}). You can still save the comment.`,
          );
        }
        await toPage(id, { type: 'pinpoint:select-stop' }).catch(() => {});
        setState({ step: 'commenting', context: m.context, shot });
      })();
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, [addComment]);

  if (state.step === 'commenting') {
    return (
      <CommentForm
        shot={state.shot}
        captureError={error}
        onSave={async (description) => {
          await addFeedback(
            { ...state.context, ...environment(), session_id: sessionId, description },
            state.shot,
          );
          setError(undefined);
          setState({ step: 'idle', saved: true });
        }}
        onCancel={() => {
          setError(undefined);
          setState({ step: 'idle' });
        }}
      />
    );
  }

  return (
    <section className="flex flex-col gap-2">
      {state.step === 'selecting' ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm">
          <span>Click an element, or drag a box to take the element around it. Esc cancels.</span>
          <Button size="sm" variant="ghost" onPress={cancel}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button className="self-start" onPress={() => void addComment()}>
          Add comment
        </Button>
      )}
      {state.step === 'idle' && state.saved && (
        <p className="text-sm text-success">Comment saved as draft.</p>
      )}
      <p className="text-xs text-muted">
        Shortcut: Alt+Shift+S, or right-click › Comment with Pinpoint
      </p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}

function CommentForm({
  shot,
  captureError,
  onSave,
  onCancel,
}: {
  shot?: NewScreenshot;
  captureError?: string;
  onSave: (description: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();

  async function save() {
    try {
      await onSave(text.trim());
    } catch (e) {
      // The text stays in the box, so nothing is lost.
      setError(`Could not save the comment: ${(e as Error).message}`);
    }
  }

  return (
    <form
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      {shot && <Thumbnail image={shot.image_blob} alt="Screenshot of the selected element" />}
      {captureError && (
        <p role="alert" className="text-sm text-warning">
          {captureError}
        </p>
      )}
      <TextField value={text} onChange={setText} autoFocus>
        <Label>Comment</Label>
        <TextArea placeholder="What is wrong, and what did you expect?" rows={4} />
      </TextField>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" isDisabled={!text.trim()}>
          Save comment
        </Button>
        <Button variant="secondary" onPress={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
