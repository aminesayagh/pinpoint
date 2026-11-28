import type { ViewportRect } from '@/features/selection/crop';

// Messages between the side panel (owns sessions and storage) and the content script (the page).

/** What the page knows about the selected element at capture time. */
export interface PageContext {
  page_url: string;
  page_title?: string;
  viewport_width: number;
  viewport_height: number;
  element_selector?: string;
  element_tag?: string;
  /** Accessible name or visible text, short. */
  element_text?: string;
  /** Opening tag only, safe attributes. */
  element_html?: string;
  /** Document coordinates in CSS pixels, scroll included. */
  element_x?: number;
  element_y?: number;
  element_width?: number;
  element_height?: number;
}

/** Side panel → content script. */
export type ToPage =
  { type: 'pinpoint:select-start' } | { type: 'pinpoint:select-stop' } | { type: 'pinpoint:ping' };

/** Content script → side panel. */
export type FromPage =
  /** `rect`: the selected element in the viewport (CSS px), ready for the screenshot. */
  | { type: 'pinpoint:selected'; context: PageContext; rect: ViewportRect }
  | { type: 'pinpoint:select-cancelled' };

/**
 * Background → side panel, through chrome.storage.session: the panel may still be opening when
 * the menu is clicked, so it picks the request up when it starts. Older than 15 s is ignored.
 */
export const CONTEXT_COMMENT_KEY = 'pinpoint_context_comment';
export interface ContextCommentRequest {
  at: number;
}

/** Background → side panel, for the keyboard shortcut. */
export type FromBackground = { type: 'pinpoint:shortcut-select' };
