// Messages between the side panel (owns sessions and storage) and the content script (the page).

/** What the page knows at capture time. Element fields are absent for a page-level comment. */
export interface PageContext {
  page_url: string;
  page_title?: string;
  viewport_width: number;
  viewport_height: number;
  element_tag?: string;
  element_text?: string;
  /** Document coordinates in CSS pixels, scroll included. */
  element_x?: number;
  element_y?: number;
  element_width?: number;
  element_height?: number;
}

/** Side panel → content script. */
export type ToPage =
  | { type: 'pinpoint:select-start' }
  | { type: 'pinpoint:select-stop' }
  | { type: 'pinpoint:page-context' }
  | { type: 'pinpoint:ping' };

/** Content script → side panel. */
export type FromPage =
  { type: 'pinpoint:selected'; context: PageContext } | { type: 'pinpoint:select-cancelled' };

/** Background → side panel, for the keyboard shortcut. */
export type FromBackground = { type: 'pinpoint:shortcut-select' };
