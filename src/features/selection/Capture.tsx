import { Button, Label, TextArea, TextField } from '@heroui/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addFeedback, type NewScreenshot } from '@/lib/db';
import type { FromBackground, FromPage, PageContext, ToPage } from '@/lib/messages';
import { reachPage } from '@/lib/sites';

type State =
  | { step: 'idle' }
  | { step: 'selecting'; tabId: number }
  | { step: 'commenting'; context: PageContext; shot?: NewScreenshot; saved: number };

async function activeTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  return tab;
}

const toPage = (tabId: number, m: ToPage) => browser.tabs.sendMessage(tabId, m);

/** Screenshot of the visible part of the tab, as it is right now (open menus included). */
async function screenshot(windowId: number): Promise<NewScreenshot> {
  const dataUrl = await browser.tabs.captureVisibleTab(windowId, { format: 'png' });
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  return { image_blob: blob, mime_type: 'image/png', width: bitmap.width, height: bitmap.height };
}

/** A failed screenshot must not cost the comment: report it and go on without one. */
async function shotOrError(windowId: number, setError: (m: string) => void) {
  try {
    return await screenshot(windowId);
  } catch (e) {
    setError(`The screenshot failed (${(e as Error).message}). You can still save the comment.`);
    return undefined;
  }
}

/** Select an element (or the whole page) in the current tab and save comments on it. */
export function Capture({ sessionId }: { sessionId: string }) {
  const [state, setState] = useState<State>({ step: 'idle' });
  const [error, setError] = useState<string>();
  const selectingTab = useRef<number>(undefined);

  const startSelect = useCallback(async () => {
    setError(undefined);
    const tab = await activeTab();
    try {
      if (!(await reachPage(tab ?? {}))) {
        return setError(
          'Pinpoint needs access to this site. Open a website and allow it when Chrome asks.',
        );
      }
      await toPage(tab!.id!, { type: 'pinpoint:select-start' });
      selectingTab.current = tab!.id;
      setState({ step: 'selecting', tabId: tab!.id! });
    } catch (e) {
      setError(`Could not start selecting: ${(e as Error).message}`);
    }
  }, []);

  async function commentOnPage() {
    setError(undefined);
    const tab = await activeTab();
    try {
      if (!(await reachPage(tab ?? {}))) {
        return setError(
          'Pinpoint needs access to this site. Open a website and allow it when Chrome asks.',
        );
      }
      const context = (await toPage(tab!.id!, { type: 'pinpoint:page-context' })) as PageContext;
      setState({
        step: 'commenting',
        context,
        shot: await shotOrError(tab!.windowId, setError),
        saved: 0,
      });
    } catch (e) {
      setError(`Could not read the page: ${(e as Error).message}`);
    }
  }

  function cancel() {
    if (selectingTab.current)
      void toPage(selectingTab.current, { type: 'pinpoint:select-stop' }).catch(() => {});
    selectingTab.current = undefined;
    setState({ step: 'idle' });
  }

  // Messages from the page (element chosen, Esc) and from the keyboard shortcut.
  useEffect(() => {
    const onMessage = (m: FromPage | FromBackground, sender: Browser.runtime.MessageSender) => {
      if (m.type === 'pinpoint:shortcut-select') return void startSelect();
      if (!sender.tab?.id || sender.tab.id !== selectingTab.current) return;
      selectingTab.current = undefined;
      if (m.type === 'pinpoint:select-cancelled') return setState({ step: 'idle' });
      if (m.type === 'pinpoint:selected') {
        const { id, windowId } = sender.tab;
        void (async () => {
          const shot = await shotOrError(windowId, setError); // before removing the highlight
          await toPage(id, { type: 'pinpoint:select-stop' }).catch(() => {});
          setState({ step: 'commenting', context: m.context, shot, saved: 0 });
        })();
      }
    };
    browser.runtime.onMessage.addListener(onMessage);
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, [startSelect]);

  if (state.step === 'commenting') {
    return (
      <CommentForm
        state={state}
        onSave={async (description) => {
          await addFeedback({ ...state.context, session_id: sessionId, description }, state.shot);
          setState({ ...state, saved: state.saved + 1 });
        }}
        onDone={() => {
          setError(undefined);
          setState({ step: 'idle' });
        }}
        captureError={error}
      />
    );
  }

  return (
    <section className="flex flex-col gap-2">
      {state.step === 'selecting' ? (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-accent/10 px-3 py-2 text-sm">
          <span>Click an element in the page. ↑ ↓ change the level, Esc cancels.</span>
          <Button size="sm" variant="ghost" onPress={cancel}>
            Cancel
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button onPress={() => void startSelect()}>Select element</Button>
          <Button variant="secondary" onPress={() => void commentOnPage()}>
            Comment on page
          </Button>
        </div>
      )}
      <p className="text-xs text-muted">Shortcut: Alt+Shift+S selects an element.</p>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </section>
  );
}

function CommentForm({
  state,
  onSave,
  onDone,
  captureError,
}: {
  state: Extract<State, { step: 'commenting' }>;
  onSave: (description: string) => Promise<void>;
  onDone: () => void;
  captureError?: string;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  const { context: c, shot, saved } = state;
  const shotUrl = useMemo(() => (shot ? URL.createObjectURL(shot.image_blob) : undefined), [shot]);
  useEffect(() => () => void (shotUrl && URL.revokeObjectURL(shotUrl)), [shotUrl]);

  const target = c.element_tag
    ? `<${c.element_tag}>${c.element_text ? ` “${c.element_text.slice(0, 40)}”` : ''} · ${c.element_width}×${c.element_height}`
    : 'The whole page';

  async function save() {
    try {
      await onSave(text.trim());
      setText('');
      setError(undefined);
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
      <p className="text-sm">
        <strong>{target}</strong>
        <br />
        <span className="text-xs text-muted">
          {c.page_url} · viewport {c.viewport_width}×{c.viewport_height}
        </span>
      </p>
      {captureError && (
        <p role="alert" className="text-sm text-warning">
          {captureError}
        </p>
      )}
      {shotUrl && (
        <img
          src={shotUrl}
          alt="Screenshot taken at selection"
          className="rounded border border-default"
        />
      )}
      {saved > 0 && (
        <p className="text-sm text-success">
          {saved} comment{saved > 1 ? 's' : ''} saved as draft. Write another one here, or press
          Done.
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
        <Button variant="secondary" onPress={onDone}>
          {saved ? 'Done' : 'Cancel'}
        </Button>
      </div>
    </form>
  );
}
