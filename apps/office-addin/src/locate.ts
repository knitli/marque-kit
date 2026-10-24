// SPDX-FileCopyrightText: 2026 Knitli Inc.
//
// SPDX-License-Identifier: LicenseRef-MarqueCommercialLicense

/**
 * From the engine's spans to Word's paragraphs. The engine reads the document as
 * its paragraphs joined by "\n" and answers in UTF-8 byte offsets into that text.
 * Word can't make a range from an offset; it finds text by search. So a span is
 * given back as its paragraph, the text it covers, and which occurrence of that
 * text in the paragraph it is.
 */

/** A span in Word's terms. `text` is '' for a place with nothing written, such as a missing portion mark. */
export interface Place {
  paragraph: number;
  text: string;
  nth: number;
}

const bytes = (s: string): number => new TextEncoder().encode(s).length;

/** The place a byte span [start, end) of `paragraphs.join('\n')` covers, or null when
 *  it isn't inside one paragraph or doesn't fall on a character boundary. */
export function locate(paragraphs: string[], [start, end]: [number, number]): Place | null {
  let at = 0;
  for (const [i, p] of paragraphs.entries()) {
    const n = bytes(p);
    if (start >= at && end <= at + n && start <= end) {
      const enc = new TextEncoder().encode(p);
      const dec = new TextDecoder('utf-8', { fatal: true });
      try {
        const from = dec.decode(enc.subarray(0, start - at)).length;
        const text = dec.decode(enc.subarray(start - at, end - at));
        let nth = 0;
        for (let k = p.indexOf(text); text && k !== -1 && k < from; k = p.indexOf(text, k + 1)) nth++;
        return { paragraph: i, text, nth };
      } catch {
        return null; // a span that splits a character is not one the engine sent
      }
    }
    at += n + 1; // the "\n" between paragraphs
  }
  return null;
}

/** The paragraph a byte offset falls in, or -1. */
export function paragraphAt(paragraphs: string[], offset: number): number {
  let at = 0;
  for (const [i, p] of paragraphs.entries()) {
    const n = bytes(p);
    if (offset >= at && offset <= at + n) return i;
    at += n + 1;
  }
  return -1;
}
