// Comments → Linear issues (MAS-67). One issue per comment, created one after the other.
// The comment's id is the issue id: Linear refuses a second issue with the same id, so a retry
// after an unclear outcome can never create a twin.
import {
  getScreenshot,
  updateFeedback,
  type FeedbackItem,
  type ReviewSession,
  type Screenshot,
} from '../../lib/db.ts';
import { titleOf } from '../feedback/issue.ts';
import { sizeLabel } from '../feedback/organize.ts';
// Relative .ts imports: the unit tests run this file in Node, which has no @/ alias.
import { gql, LinearError } from './api.ts';

export interface Destination {
  teamId: string;
  projectId?: string;
  priority?: number;
  labelIds?: string[];
}

export interface CreatedIssue {
  id: string;
  identifier: string;
  url: string;
}

/** Puts the screenshot in Linear's storage; returns its URL for the issue description. */
export async function uploadScreenshot(
  apiKey: string,
  shot: Pick<Screenshot, 'image_blob' | 'mime_type'>,
  name: string,
  fetchImpl: typeof fetch = fetch,
) {
  const d = await gql<{
    fileUpload: {
      success: boolean;
      uploadFile?: {
        uploadUrl: string;
        assetUrl: string;
        headers: { key: string; value: string }[];
      };
    };
  }>(
    apiKey,
    `mutation($contentType: String!, $filename: String!, $size: Int!) {
      fileUpload(contentType: $contentType, filename: $filename, size: $size) {
        success uploadFile { uploadUrl assetUrl headers { key value } }
      }
    }`,
    { contentType: shot.mime_type, filename: name, size: shot.image_blob.size },
    fetchImpl,
  );
  const file = d.fileUpload.uploadFile;
  if (!d.fileUpload.success || !file)
    throw new LinearError('Linear refused the upload.', 'rejected');
  const headers = new Headers({
    'Content-Type': shot.mime_type,
    'Cache-Control': 'public, max-age=31536000',
  });
  file.headers.forEach(({ key, value }) => headers.set(key, value));
  let res: Response;
  try {
    res = await fetchImpl(file.uploadUrl, { method: 'PUT', headers, body: shot.image_blob });
  } catch (e) {
    throw new LinearError(`Could not upload the screenshot: ${(e as Error).message}`, 'network');
  }
  if (!res.ok) throw new LinearError(`Screenshot upload failed (HTTP ${res.status}).`, 'rejected');
  return file.assetUrl;
}

const code = (s: string) => `\`${s.replace(/`/g, "'")}\``;

/** The issue text: the reviewer's words and screenshot first, technical details folded. */
export function issueDescription(
  item: FeedbackItem,
  session: Pick<ReviewSession, 'name' | 'created_at'>,
  screenshotUrl?: string,
) {
  const page = item.page_title ? `[${item.page_title}](${item.page_url})` : item.page_url;
  const sessionName =
    session.name || `Review of ${new Date(session.created_at).toLocaleDateString()}`;
  const details = [
    `**Window:** ${item.viewport_width}×${item.viewport_height} (${sizeLabel(item.viewport_width)})`,
    item.element_selector && `**Element:** ${code(item.element_selector)}`,
    item.element_text && `**Element text:** ${item.element_text}`,
    item.element_html && `**HTML:** ${code(item.element_html)}`,
    item.element_width !== undefined &&
      `**Position on page:** x ${item.element_x}, y ${item.element_y}, ${item.element_width}×${item.element_height}`,
    (item.browser_name || item.operating_system) &&
      `**Browser:** ${[item.browser_name, item.operating_system].filter(Boolean).join(' · ')}`,
    `**Captured:** ${new Date(item.created_at).toLocaleString()}`,
    `**Review session:** ${sessionName}, comment #${item.sequence_number}`,
  ].filter(Boolean);
  return [
    item.description,
    screenshotUrl && `![Screenshot of the element](${screenshotUrl})`,
    `**Page:** ${page}`,
    `+++ Technical context\n\n${details.join('\n\n')}\n\n+++`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export async function createIssue(
  apiKey: string,
  item: FeedbackItem,
  description: string,
  to: Destination,
  fetchImpl: typeof fetch = fetch,
): Promise<CreatedIssue> {
  const d = await gql<{ issueCreate: { success: boolean; issue?: CreatedIssue } }>(
    apiKey,
    `mutation($input: IssueCreateInput!) {
      issueCreate(input: $input) { success issue { id identifier url } }
    }`,
    {
      input: {
        id: item.id,
        teamId: to.teamId,
        projectId: to.projectId,
        title: titleOf(item),
        description,
        priority: to.priority || undefined,
        labelIds: to.labelIds?.length ? to.labelIds : undefined,
      },
    },
    fetchImpl,
  );
  if (!d.issueCreate.success || !d.issueCreate.issue) {
    throw new LinearError('Linear did not create the issue.', 'rejected');
  }
  return d.issueCreate.issue;
}

export interface BatchResult {
  created: number;
  failed: number;
  unknown: number;
  stoppedBy?: string;
}

/**
 * Sends comments one by one, in the given (reading) order, saving each outcome as it happens so a
 * closed panel or a crash loses nothing:
 * - submitted: Linear confirmed the issue (its key and link are kept);
 * - failed: Linear refused, or the screenshot never got there; no issue exists, retrying is safe;
 * - unknown: no clear answer after the create request; the issue may exist (see MAS-65).
 * A refused API key stops the batch: the remaining comments stay drafts.
 */
export async function sendBatch(
  apiKey: string,
  session: Pick<ReviewSession, 'name' | 'created_at'>,
  items: FeedbackItem[],
  to: Destination,
  onProgress?: (done: number, total: number) => void,
  fetchImpl: typeof fetch = fetch,
): Promise<BatchResult> {
  const result: BatchResult = { created: 0, failed: 0, unknown: 0 };
  for (const [n, item] of items.entries()) {
    onProgress?.(n, items.length);
    let screenshotUrl: string | undefined;
    try {
      const shot = await getScreenshot(item.id);
      if (shot) {
        screenshotUrl = await uploadScreenshot(
          apiKey,
          shot,
          `pinpoint-${item.sequence_number}.png`,
          fetchImpl,
        );
      }
    } catch (e) {
      // No issue was requested yet, so this is a plain failure whatever the error.
      result.failed++;
      await updateFeedback(item.id, {
        submission_status: 'failed',
        last_submission_error: (e as Error).message,
      });
      if ((e as LinearError).kind === 'auth') return { ...result, stoppedBy: (e as Error).message };
      continue;
    }
    await updateFeedback(item.id, { submission_status: 'submitting' });
    try {
      const issue = await createIssue(
        apiKey,
        item,
        issueDescription(item, session, screenshotUrl),
        to,
        fetchImpl,
      );
      result.created++;
      await updateFeedback(item.id, {
        submission_status: 'submitted',
        linear_issue_id: issue.id,
        linear_issue_identifier: issue.identifier,
        linear_issue_url: issue.url,
        last_submission_error: undefined,
        submitted_at: new Date().toISOString(),
      });
    } catch (e) {
      const err = e as LinearError;
      const unclear = err.kind === 'network' || err.kind === 'server';
      if (unclear) result.unknown++;
      else result.failed++;
      await updateFeedback(item.id, {
        submission_status: unclear ? 'unknown' : 'failed',
        last_submission_error: err.message,
      });
      if (err.kind === 'auth') return { ...result, stoppedBy: err.message };
    }
  }
  onProgress?.(items.length, items.length);
  return result;
}
