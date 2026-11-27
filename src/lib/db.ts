// Local review storage (MAS-72). Lives in extension origin: only the side panel opens it;
// the content script talks to the side panel through messages.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export type SessionStatus = 'active' | 'paused' | 'completed';
export type SubmissionStatus = 'draft' | 'submitting' | 'submitted' | 'failed' | 'unknown';

export interface ReviewSession {
  id: string;
  name?: string;
  status: SessionStatus;
  linear_team_id: string;
  linear_project_id?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

export interface FeedbackItem {
  id: string; // UUID v4, reused as the Linear issue id so a retry can never create a twin
  session_id: string;
  sequence_number: number;
  title?: string;
  description: string;
  page_url: string;
  page_title?: string;
  viewport_width: number;
  viewport_height: number;
  element_selector?: string;
  element_tag?: string;
  element_text?: string;
  element_html?: string;
  element_x?: number;
  element_y?: number;
  element_width?: number;
  element_height?: number;
  browser_name?: string;
  operating_system?: string;
  /** Left out of the next send; stays in the session for later. */
  excluded?: boolean;
  submission_status: SubmissionStatus;
  linear_issue_id?: string;
  linear_issue_identifier?: string;
  linear_issue_url?: string;
  last_submission_error?: string;
  created_at: string;
  updated_at: string;
  submitted_at?: string;
}

export interface Screenshot {
  id: string;
  feedback_item_id: string;
  image_blob: Blob;
  mime_type: string;
  width: number;
  height: number;
  created_at: string;
}

interface PinpointDB extends DBSchema {
  review_sessions: { key: string; value: ReviewSession };
  feedback_items: { key: string; value: FeedbackItem; indexes: { session_id: string } };
  screenshots: { key: string; value: Screenshot; indexes: { feedback_item_id: string } };
}

export type NewFeedback = Omit<
  FeedbackItem,
  'id' | 'sequence_number' | 'submission_status' | 'created_at' | 'updated_at'
>;
export type NewScreenshot = Pick<Screenshot, 'image_blob' | 'mime_type' | 'width' | 'height'>;

const now = () => new Date().toISOString();

let dbPromise: Promise<IDBPDatabase<PinpointDB>> | undefined;
function db() {
  dbPromise ??= openDB<PinpointDB>('pinpoint', 1, {
    upgrade(d) {
      d.createObjectStore('review_sessions', { keyPath: 'id' });
      d.createObjectStore('feedback_items', { keyPath: 'id' }).createIndex(
        'session_id',
        'session_id',
      );
      d.createObjectStore('screenshots', { keyPath: 'id' }).createIndex(
        'feedback_item_id',
        'feedback_item_id',
        { unique: true }, // at most one screenshot per feedback item
      );
    },
  });
  return dbPromise;
}

// ponytail: change notification is a BroadcastChannel plus local listeners, enough for
// side panels in several windows; no store library.
const listeners = new Set<() => void>();
const channel =
  typeof BroadcastChannel === 'undefined' ? undefined : new BroadcastChannel('pinpoint-db');
channel?.addEventListener('message', () => listeners.forEach((l) => l()));
// Node (tests) would otherwise stay alive on the open channel.
(channel as { unref?: () => void } | undefined)?.unref?.();
function changed() {
  listeners.forEach((l) => l());
  channel?.postMessage('changed');
}
export function onChange(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

// Sessions

export async function listSessions() {
  const all = await (await db()).getAll('review_sessions');
  return all.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function getSession(id: string) {
  return (await db()).get('review_sessions', id);
}

export async function createSession(
  s: Pick<ReviewSession, 'name' | 'linear_team_id' | 'linear_project_id'>,
) {
  const t = now();
  const session: ReviewSession = {
    ...s,
    id: crypto.randomUUID(),
    status: 'active',
    created_at: t,
    updated_at: t,
  };
  await activate(session);
  return session;
}

/** Saves the session as active and pauses any other active one: one review mode at a time. */
async function activate(session: ReviewSession) {
  const tx = (await db()).transaction('review_sessions', 'readwrite');
  for (const other of await tx.store.getAll()) {
    if (other.status === 'active' && other.id !== session.id) {
      await tx.store.put({ ...other, status: 'paused', updated_at: now() });
    }
  }
  await tx.store.put(session);
  await tx.done;
  changed();
}

export async function setSessionStatus(id: string, status: SessionStatus) {
  const session = await getSession(id);
  if (!session) return;
  const next: ReviewSession = {
    ...session,
    status,
    updated_at: now(),
    completed_at: status === 'completed' ? now() : undefined,
  };
  if (status === 'active') return activate(next);
  await (await db()).put('review_sessions', next);
  changed();
}

export async function renameSession(id: string, name: string) {
  const session = await getSession(id);
  if (!session) return;
  await (
    await db()
  ).put('review_sessions', { ...session, name: name || undefined, updated_at: now() });
  changed();
}

/** Deletes a session with its feedback and screenshots. Never touches Linear. */
export async function deleteSession(id: string) {
  const tx = (await db()).transaction(
    ['review_sessions', 'feedback_items', 'screenshots'],
    'readwrite',
  );
  const shots = tx.objectStore('screenshots').index('feedback_item_id');
  for (const item of await tx.objectStore('feedback_items').index('session_id').getAll(id)) {
    const shotKey = await shots.getKey(item.id);
    if (shotKey) await tx.objectStore('screenshots').delete(shotKey);
    await tx.objectStore('feedback_items').delete(item.id);
  }
  await tx.objectStore('review_sessions').delete(id);
  await tx.done;
  changed();
}

// Feedback

/** Feedback of a session in chronological order. */
export async function listFeedback(sessionId: string) {
  const items = await (await db()).getAllFromIndex('feedback_items', 'session_id', sessionId);
  return items.sort((a, b) => a.sequence_number - b.sequence_number);
}

/** Saves a feedback item and its screenshot in one transaction: both or neither. */
export async function addFeedback(data: NewFeedback, screenshot?: NewScreenshot) {
  const tx = (await db()).transaction(
    ['review_sessions', 'feedback_items', 'screenshots'],
    'readwrite',
  );
  const existing = await tx
    .objectStore('feedback_items')
    .index('session_id')
    .getAll(data.session_id);
  const t = now();
  const item: FeedbackItem = {
    ...data,
    id: crypto.randomUUID(),
    sequence_number: Math.max(0, ...existing.map((i) => i.sequence_number)) + 1,
    submission_status: 'draft',
    created_at: t,
    updated_at: t,
  };
  await tx.objectStore('feedback_items').add(item);
  if (screenshot) {
    await tx
      .objectStore('screenshots')
      .add({ ...screenshot, id: crypto.randomUUID(), feedback_item_id: item.id, created_at: t });
  }
  const session = await tx.objectStore('review_sessions').get(data.session_id);
  if (session) await tx.objectStore('review_sessions').put({ ...session, updated_at: t });
  await tx.done;
  changed();
  return item;
}

export async function updateFeedback(id: string, patch: Partial<FeedbackItem>) {
  const tx = (await db()).transaction('feedback_items', 'readwrite');
  const item = await tx.store.get(id);
  if (!item) throw new Error(`Feedback ${id} no longer exists`);
  const next = { ...item, ...patch, id, updated_at: now() };
  await tx.store.put(next);
  await tx.done;
  changed();
  return next;
}

export async function deleteFeedback(id: string) {
  const tx = (await db()).transaction(['feedback_items', 'screenshots'], 'readwrite');
  const shotKey = await tx.objectStore('screenshots').index('feedback_item_id').getKey(id);
  if (shotKey) await tx.objectStore('screenshots').delete(shotKey);
  await tx.objectStore('feedback_items').delete(id);
  await tx.done;
  changed();
}

export async function getScreenshot(feedbackItemId: string) {
  return (await db()).getFromIndex('screenshots', 'feedback_item_id', feedbackItemId);
}

/** Per session: how many comments it holds and how many reached Linear. */
export async function feedbackCounts() {
  const counts = new Map<string, { total: number; submitted: number }>();
  for (const item of await (await db()).getAll('feedback_items')) {
    const c = counts.get(item.session_id) ?? { total: 0, submitted: 0 };
    c.total++;
    if (item.submission_status === 'submitted') c.submitted++;
    counts.set(item.session_id, c);
  }
  return counts;
}

/**
 * Items left in "submitting" were interrupted (panel closed, browser crashed) after the create
 * request may have been sent. They become "unknown" so nobody retries them blindly (MAS-65).
 */
export async function markInterruptedSubmissions() {
  const tx = (await db()).transaction('feedback_items', 'readwrite');
  let count = 0;
  for (const item of await tx.store.getAll()) {
    if (item.submission_status === 'submitting') {
      count++;
      await tx.store.put({
        ...item,
        submission_status: 'unknown',
        last_submission_error:
          'Submission was interrupted. The panel closed while sending. Check Linear before sending again.',
        updated_at: now(),
      });
    }
  }
  await tx.done;
  if (count) changed();
  return count;
}
