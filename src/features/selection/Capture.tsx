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

/** The selected element, cut out of a screenshot (data URL) of the tab. */
async function cropShot(dataUrl: string, rect: ViewportRect, viewportWidth: number) {
  const page = await (await fetch(dataUrl)).blob();
  return cropScreenshot(page, rect, viewportWidth);
}

export function Capture({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<State>({ step: 'idle' });
  const [error, setError] = useState<string>();
  const selectingTab = useRef<number>(undefined);
  // The tab showing the floating comment box, and the capture it belongs to.
  const composeTab = useRef<number>(undefined);
  // The cropped screenshot is made after the box is shown; saving waits for it.
  const shotPromise = useRef<Promise<NewScreenshot | undefined>>(Promise.resolve(undefined));
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  const closeComposer = () => {
    if (composeTab.current)
      void toPage(composeTab.current, { type: 'pinpoint:compose-close' }).catch(() => {});
    composeTab.current = undefined;
  };

  /** Saves the comment being written, from the panel form or the box on the page. */
  const saveComment = useCallback(
    async (description: string) => {
      const s = stateRef.current;
      if (s.step !== 'commenting') return;
      const shot = await shotPromise.current;
      await addFeedback(
        { ...s.context, ...environment(), session_id: sessionId, description },
        shot,
      );
      setError(undefined);
      setState({ step: 'idle', saved: true });
    },
    [sessionId],
  );

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

  useEffect(() => {
    const take = async () => {
      const stored = await browser.storage.session.get(CONTEXT_COMMENT_KEY);
      const request = stored[CONTEXT_COMMENT_KEY] as ContextCommentRequest | undefined;
      if (!request) return;
      await browser.storage.session.remove(CONTEXT_COMMENT_KEY);
      // Same as Add comment: the reviewer selects first, the comment comes after.
      if (Date.now() - request.at < 15_000) void addComment();
    };
    void take();
    const onChanged = (changes: Record<string, unknown>) => {
      if (CONTEXT_COMMENT_KEY in changes) void take();
    };
    browser.storage.session.onChanged.addListener(onChanged);
    return () => browser.storage.session.onChanged.removeListener(onChanged);
  }, [addComment]);

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
      if (m.type === 'pinpoint:compose-save' || m.type === 'pinpoint:compose-cancel') {
        if (sender.tab?.id !== composeTab.current) return;
        composeTab.current = undefined;
        if (m.type === 'pinpoint:compose-cancel') {
          setError(undefined);
          return setState({ step: 'idle' });
        }
        return void saveComment(m.text).catch((e: Error) =>
          setError(`Could not save the comment: ${(e as Error).message}`),
        );
      }
      if (!sender.tab?.id || sender.tab.id !== selectingTab.current) return;
      selectingTab.current = undefined;
      if (m.type === 'pinpoint:select-cancelled') return setState({ step: 'idle' });
      const { id, windowId } = sender.tab;
      void (async () => {
        const failed = (e: unknown) => {
          // A failed screenshot must not cost the comment.
          setError(
            `The screenshot failed (${(e as Error).message}). You can still save the comment.`,
          );
          return undefined;
        };
        // 1. The raw screenshot, while nothing of Pinpoint is on the page.
        const dataUrl = await browser.tabs
          .captureVisibleTab(windowId, { format: 'png' })
          .catch(failed);
        // 2. Right away, the comment box: it can no longer end up in the screenshot.
        await toPage(id, { type: 'pinpoint:select-stop' }).catch(() => {});
        if ((await toPage(id, { type: 'pinpoint:compose' }).catch(() => false)) === true)
          composeTab.current = id;
        // 3. The crop, while the reviewer starts typing.
        const shot = dataUrl
          ? cropShot(dataUrl, m.rect, m.context.viewport_width).catch(failed)
          : Promise.resolve(undefined);
        shotPromise.current = shot;
        setState({ step: 'commenting', context: m.context });
        const done = await shot;
        setState((s) =>
          s.step === 'commenting' && s.context === m.context ? { ...s, shot: done } : s,
        );
      })();
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, [addComment, saveComment]);

  if (state.step === 'commenting') {
    return (
      <CommentForm
        shot={state.shot}
        captureError={error}
        onSave={async (description) => {
          await saveComment(description);
          closeComposer();
        }}
        onCancel={() => {
          closeComposer();
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
