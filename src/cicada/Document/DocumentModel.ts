import { Document, Paragraph, Run } from './Document';
import { TextStyle } from 'canvaskit-wasm';

// Interface for clipboard data, representing copied text with styles
export interface ClipboardData {
  paragraphs: {
    text: string;
    runs: Run[];
  }[];
}

/**
 * Manages a document's text and styles, supporting insertion, deletion, styling, and clipboard operations.
 * Handles Unicode text with graphemes (e.g., emojis) using Intl.Segmenter.
 */
export class DocumentModel {
  private document: Document;
  private segmenter: Intl.Segmenter;

  constructor(document: Document) {
    this.document = document;
    this.segmenter = new Intl.Segmenter();
  }

  /**
   * Validates a position (paragraph index and offset) to ensure it is within document bounds.
   * @param position - The position to validate.
   * @throws Error if the paragraph index or offset is invalid.
   */
  private validatePosition(position: { paragraphIndex: number; offset: number }): void {
    if (position.paragraphIndex < 0 || position.paragraphIndex >= this.document.paragraphs.length) {
      throw new Error(`Invalid paragraph index: ${position.paragraphIndex}`);
    }
    const paragraph = this.document.paragraphs[position.paragraphIndex];
    const graphemeCount = this.getGraphemeCount(paragraph.text);
    if (position.offset < 0 || position.offset > graphemeCount) {
      throw new Error(`Invalid offset: ${position.offset} for paragraph with ${graphemeCount} graphemes`);
    }
  }

  /**
   * Counts the number of graphemes in a text string using Intl.Segmenter.
   * @param text - The text to analyze.
   * @returns The grapheme count.
   */
  private getGraphemeCount(text: string): number {
    return [...this.segmenter.segment(text)].length;
  }

  /**
   * Slices a paragraph's text by grapheme indices.
   * @param index - Index of the paragraph.
   * @param start - Start grapheme index (inclusive, ).
   * @param end - End grapheme index (exclusive, optional).
   * @returns The sliced text.
   */
  private sliceTextByGraphemes(index: number, start: number, end?: number): string {
    const paragraph = this.document.paragraphs[index];
    if (!paragraph?.text) return '';
    const graphemes = [...this.segmenter.segment(paragraph.text)];
    const sliced = graphemes.slice(start, end).map((x) => x.segment);
    return sliced.join('');
  }

  /**
   * Compares two TextStyle objects for deep equality.
   * @param styleA - First style object.
   * @param styleB - Second style object.
   * @returns True if styles are equal, false otherwise.
   */
  private areStylesEqual(styleA: TextStyle, styleB: TextStyle): boolean {
    return JSON.stringify(styleA) === JSON.stringify(styleB);
  }

  /**
   * Merges adjacent runs with identical styles.
   * @param runs - Array of runs to merge.
   * @returns Merged array of runs.
   */
  private mergeAdjacentRuns(runs: Run[]): Run[] {
    if (runs.length <= 1) return runs;
    const merged: Run[] = [{ ...runs[0] }];
    for (let i = 1; i < runs.length; i++) {
      const lastRun = merged[merged.length - 1];
      const currentRun = runs[i];
      if (this.areStylesEqual(lastRun.style, currentRun.style)) {
        lastRun.length += currentRun.length;
      } else {
        merged.push({ ...currentRun });
      }
    }
    return merged;
  }

  /**
   * Inserts text at a specified position with a given style.
   * @param position - Where to insert the text.
   * @param text - Text to insert.
   * @param style - Style to apply to the inserted text.
   */
  public insertText(position: { paragraphIndex: number; offset: number }, text: string, style: TextStyle): void {
    this.validatePosition(position);
    text = text.normalize('NFC'); // Normalize to NFC for consistent Unicode handling

    if (text.includes('\n')) {
      this.insertTextWithNewlines(position, text, style);
      return;
    }

    const paragraph = this.document.paragraphs[position.paragraphIndex];
    const textGraphemeCount = this.getGraphemeCount(text);

    // Insert text into paragraph
    paragraph.text = paragraph.text.slice(0, position.offset) + text + paragraph.text.slice(position.offset);

    // Update or insert runs
    const { runIndex, offsetInRun } = this.findRunAtOffset(paragraph, position.offset);
    if (runIndex === -1) {
      // Append new run at the end
      paragraph.runs.push({ length: textGraphemeCount, style });
    } else {
      this.insertTextIntoRun(paragraph, runIndex, offsetInRun, textGraphemeCount, style);
    }

    this.updateRunLengths(paragraph);
  }

  /**
   * Finds the run containing a given offset in a paragraph.
   * @param paragraph - The paragraph to search.
   * @param offset - Grapheme offset to find.
   * @returns Object with run index and offset within the run, or { runIndex: -1, offsetInRun: 0 } if not found.
   */
  private findRunAtOffset(paragraph: Paragraph, offset: number): { runIndex: number; offsetInRun: number } {
    let currentOffset = 0;
    for (let i = 0; i < paragraph.runs.length; i++) {
      const run = paragraph.runs[i];
      if (currentOffset + run.length > offset) {
        return { runIndex: i, offsetInRun: offset - currentOffset };
      }
      currentOffset += run.length;
    }
    return { runIndex: -1, offsetInRun: 0 };
  }

  /**
   * Inserts text into a specific run, splitting or updating runs as needed.
   * @param paragraph - The paragraph to modify.
   * @param runIndex - Index of the run to insert into.
   * @param offsetInRun - Offset within the run.
   * @param textLength - Grapheme count of the inserted text.
   * @param style - Style of the inserted text.
   */
  private insertTextIntoRun(paragraph: Paragraph, runIndex: number, offsetInRun: number, textLength: number, style: TextStyle): void {
    const run = paragraph.runs[runIndex];
    if (this.areStylesEqual(run.style, style)) {
      // Same style: extend the run
      run.length += textLength;
    } else {
      // Different style: split the run
      const newRuns: Run[] = [];
      if (offsetInRun > 0) {
        newRuns.push({ length: offsetInRun, style: run.style });
      }
      newRuns.push({ length: textLength, style });
      if (offsetInRun < run.length) {
        newRuns.push({ length: run.length - offsetInRun, style: run.style });
      }
      paragraph.runs.splice(runIndex, 1, ...newRuns);
    }
  }

  /**
   * Inserts text containing newlines, splitting into multiple paragraphs.
   * @param position - Insertion position.
   * @param text - Text with newlines.
   * @param style - Style for the inserted text.
   */
  private insertTextWithNewlines(position: { paragraphIndex: number; offset: number }, text: string, style: TextStyle): void {
    const paragraphs = text.split('\n');
    const currentParagraph = this.document.paragraphs[position.paragraphIndex];

    // Split current paragraph
    const beforeText = this.sliceTextByGraphemes(position.paragraphIndex, 0, position.offset);
    const afterText = this.sliceTextByGraphemes(position.paragraphIndex, position.offset);

    // Update first paragraph
    currentParagraph.text = beforeText + paragraphs[0];
    this.splitRunsAtOffset(currentParagraph, position.offset);

    // Create new paragraphs
    const newParagraphs: Paragraph[] = [];
    for (let i = 1; i < paragraphs.length - 1; i++) {
      newParagraphs.push({
        text: paragraphs[i],
        runs: [{ length: this.getGraphemeCount(paragraphs[i]), style }],
        yOffset: 0,
      });
    }

    // Handle last paragraph
    if (paragraphs.length > 1) {
      newParagraphs.push({
        text: paragraphs[paragraphs.length - 1] + afterText,
        runs: [{ length: this.getGraphemeCount(paragraphs[paragraphs.length - 1] + afterText), style }],
        yOffset: 0,
      });
    }

    // Insert new paragraphs
    this.document.paragraphs.splice(position.paragraphIndex + 1, 0, ...newParagraphs);
  }

  /**
   * Splits runs in a paragraph at a given offset.
   * @param paragraph - Paragraph to modify.
   * @param offset - Grapheme offset to split at.
   */
  private splitRunsAtOffset(paragraph: Paragraph, offset: number): void {
    const { runIndex, offsetInRun } = this.findRunAtOffset(paragraph, offset);
    if (runIndex !== -1 && offsetInRun > 0) {
      const run = paragraph.runs[runIndex];
      if (offsetInRun < run.length) {
        paragraph.runs.splice(runIndex, 1,
          { length: offsetInRun, style: run.style },
          { length: run.length - offsetInRun, style: run.style }
        );
      }
    }
  }

  /**
   * Deletes text between two positions.
   * @param start - Start position.
   * @param end - End position.
   */
  public deleteText(start: { paragraphIndex: number; offset: number }, end: { paragraphIndex: number; offset: number }): void {
    this.validatePosition(start);
    this.validatePosition(end);
    if (start.paragraphIndex > end.paragraphIndex ||
        (start.paragraphIndex === end.paragraphIndex && start.offset > end.offset)) {
      throw new Error('Invalid range: start must be before end');
    }

    if (start.paragraphIndex === end.paragraphIndex) {
      this.deleteWithinParagraph(start.paragraphIndex, start.offset, end.offset);
    } else {
      this.deleteAcrossParagraphs(start, end);
    }
  }

  /**
   * Deletes text within a single paragraph.
   * @param paragraphIndex - Index of the paragraph.
   * @param startOffset - Start grapheme offset.
   * @param endOffset - End grapheme offset.
   */
  private deleteWithinParagraph(paragraphIndex: number, startOffset: number, endOffset: number): void {
    const paragraph = this.document.paragraphs[paragraphIndex];
    const graphemes = [...this.segmenter.segment(paragraph.text)];
    const actualStart = Math.max(0, startOffset);
    const actualEnd = Math.min(graphemes.length, endOffset);

    // Update text
    paragraph.text = graphemes.slice(0, actualStart).map((x) => x.segment).join('') +
                     graphemes.slice(actualEnd).map((x) => x.segment).join('');

    // Update runs
    this.updateRunsAfterDeletion(paragraph, actualStart, actualEnd - actualStart);
    this.updateRunLengths(paragraph);
  }

  /**
   * Deletes text across multiple paragraphs.
   * @param start - Start position.
   * @param end - End position.
   */
  private deleteAcrossParagraphs(start: { paragraphIndex: number; offset: number }, end: { paragraphIndex: number; offset: number }): void {
    const startParagraph = this.document.paragraphs[start.paragraphIndex];
    const endParagraph = this.document.paragraphs[end.paragraphIndex];

    // Combine remaining text
    const newText = this.sliceTextByGraphemes(start.paragraphIndex, 0, start.offset) +
                    this.sliceTextByGraphemes(end.paragraphIndex, end.offset);
    startParagraph.text = newText;

    // Remove paragraphs in between
    this.document.paragraphs.splice(start.paragraphIndex + 1, end.paragraphIndex - start.paragraphIndex);

    // Update runs
    this.updateRunsAfterMultiParagraphDeletion(startParagraph, start.offset, endParagraph, end.offset);
    this.updateRunLengths(startParagraph);
  }

  /**
   * Updates runs after deleting text within a paragraph.
   * @param paragraph - Paragraph to modify.
   * @param startOffset - Start grapheme offset of deletion.
   * @param length - Number of graphemes deleted.
   */
  private updateRunsAfterDeletion(paragraph: Paragraph, startOffset: number, length: number): void {
    const { runIndex: startRunIndex, offsetInRun: startOffsetInRun } = this.findRunAtOffset(paragraph, startOffset);
    const { runIndex: endRunIndex } = this.findRunAtOffset(paragraph, startOffset + length);

    if (startRunIndex === -1) return;

    const firstRun = paragraph.runs[startRunIndex];
    const lastRun = paragraph.runs[endRunIndex] || firstRun;

    if (startRunIndex === endRunIndex) {
      // Deletion within a single run
      firstRun.length -= length;
      if (firstRun.length <= 0) {
        paragraph.runs.splice(startRunIndex, 1);
      }
    } else {
      // Deletion across multiple runs
      const remainingLength = startOffsetInRun + (lastRun.length - (startOffset + length - (startOffset - startOffsetInRun)));
      if (remainingLength > 0) {
        firstRun.length = remainingLength;
        paragraph.runs.splice(startRunIndex + 1, endRunIndex - startRunIndex);
      } else {
        paragraph.runs.splice(startRunIndex, endRunIndex - startRunIndex + 1);
      }
    }
  }

  /**
   * Updates runs after deleting text across paragraphs.
   * @param startParagraph - First paragraph (resulting merged paragraph).
   * @param startOffset - Offset in the start paragraph.
   * @param endParagraph - Last paragraph before deletion.
   * @param endOffset - Offset in the end paragraph.
   */
  private updateRunsAfterMultiParagraphDeletion(
    startParagraph: Paragraph,
    startOffset: number,
    endParagraph: Paragraph,
    endOffset: number
  ): void {
    // Trim runs in start paragraph up to startOffset
    const { runIndex: startRunIndex, offsetInRun: startOffsetInRun } = this.findRunAtOffset(startParagraph, startOffset);
    if (startRunIndex !== -1) {
      const startRun = startParagraph.runs[startRunIndex];
      if (startOffsetInRun > 0) {
        startRun.length = startOffsetInRun;
        startParagraph.runs.splice(startRunIndex + 1);
      } else {
        startParagraph.runs.splice(startRunIndex);
      }
    } else {
      startParagraph.runs = [];
    }

    // Append runs from end paragraph starting from endOffset
    let globalGraphemeOffset = 0;
    for (const run of endParagraph.runs) {
      const runGraphemeCount = run.length;
      if (globalGraphemeOffset + runGraphemeCount > endOffset) {
        const runStart = Math.max(endOffset - globalGraphemeOffset, 0);
        const length = runGraphemeCount - runStart;
        if (length > 0) {
          startParagraph.runs.push({ length, style: run.style });
        }
      }
      globalGraphemeOffset += runGraphemeCount;
    }

    // Merge adjacent runs
    startParagraph.runs = this.mergeAdjacentRuns(startParagraph.runs);

    // If all runs have the same style, merge into a single run
    if (startParagraph.runs.length > 0) {
      const firstStyle = startParagraph.runs[0].style;
      const allSameStyle = startParagraph.runs.every(r => this.areStylesEqual(r.style, firstStyle));
      if (allSameStyle) {
        startParagraph.runs = [{
          length: this.getGraphemeCount(startParagraph.text),
          style: firstStyle
        }];
      }
    } else {
      // Fallback: create a single run for empty text
      startParagraph.runs = [{
        length: this.getGraphemeCount(startParagraph.text),
        style: startParagraph.runs[0]?.style || {}
      }];
    }
  }

  /**
   * Applies a style to a range of text.
   * @param start - Start position.
   * @param end - End position.
   * @param style - Partial style to apply.
   */
  public applyStyle(
    start: { paragraphIndex: number; offset: number },
    end: { paragraphIndex: number; offset: number },
    style: Partial<TextStyle>
  ): void {
    this.validatePosition(start);
    this.validatePosition(end);
    if (start.paragraphIndex > end.paragraphIndex ||
        (start.paragraphIndex === end.paragraphIndex && start.offset > end.offset)) {
      throw new Error('Invalid range: start must be before end');
    }

    if (start.paragraphIndex === end.paragraphIndex) {
      this.applyStyleToSingleParagraph(start.paragraphIndex, start.offset, end.offset, style);
    } else {
      this.applyStyleAcrossParagraphs(start, end, style);
    }
  }

  /**
   * Applies a style to a range within a single paragraph.
   * @param paragraphIndex - Index of the paragraph.
   * @param startOffset - Start grapheme offset.
   * @param endOffset - End grapheme offset.
   * @param style - Partial style to apply.
   */
  private applyStyleToSingleParagraph(
    paragraphIndex: number,
    startOffset: number,
    endOffset: number,
    style: Partial<TextStyle>
  ): void {
    const paragraph = this.document.paragraphs[paragraphIndex];
    const newRuns: Run[] = [];
    let currentOffset = 0;

    for (let i = 0; i < paragraph.runs.length; i++) {
      const run = paragraph.runs[i];
      const runStart = currentOffset;
      const runEnd = currentOffset + run.length;

      if (runEnd <= startOffset || runStart >= endOffset) {
        // Run is outside the range
        newRuns.push({ ...run });
      } else {
        // Run overlaps with the range
        if (runStart < startOffset) {
          newRuns.push({ length: startOffset - runStart, style: run.style });
        }
        const styleStart = Math.max(runStart, startOffset);
        const styleEnd = Math.min(runEnd, endOffset);
        newRuns.push({ length: styleEnd - styleStart, style: { ...run.style, ...style } });
        if (runEnd > endOffset) {
          newRuns.push({ length: runEnd - endOffset, style: run.style });
        }
      }
      currentOffset += run.length;
    }

    paragraph.runs = this.mergeAdjacentRuns(newRuns);
  }

  /**
   * Applies a style across multiple paragraphs.
   * @param start - Start position.
   * @param end - End position.
   * @param style - Partial style to apply.
   */
  private applyStyleAcrossParagraphs(
    start: { paragraphIndex: number; offset: number },
    end: { paragraphIndex: number; offset: number },
    style: Partial<TextStyle>
  ): void {
    // First paragraph
    this.applyStyleToSingleParagraph(
      start.paragraphIndex,
      start.offset,
      this.getGraphemeCount(this.document.paragraphs[start.paragraphIndex].text),
      style
    );

    // Middle paragraphs
    for (let i = start.paragraphIndex + 1; i < end.paragraphIndex; i++) {
      this.applyStyleToSingleParagraph(
        i,
        0,
        this.getGraphemeCount(this.document.paragraphs[i].text),
        style
      );
    }

    // Last paragraph
    this.applyStyleToSingleParagraph(end.paragraphIndex, 0, end.offset, style);
  }

  /**
   * Updates run lengths to match the paragraph's text grapheme count.
   * @param paragraph - Paragraph to update.
   */
  private updateRunLengths(paragraph: Paragraph): void {
    const graphemeCount = this.getGraphemeCount(paragraph.text);
    let currentOffset = 0;
    for (const run of paragraph.runs) {
      const nextOffset = Math.min(currentOffset + run.length, graphemeCount);
      run.length = nextOffset - currentOffset;
      currentOffset = nextOffset;
    }
    paragraph.runs = paragraph.runs.filter(run => run.length > 0);

    // Validate total run lengths
    const totalRunLength = paragraph.runs.reduce((sum, run) => sum + run.length, 0);
    if (totalRunLength !== graphemeCount) {
      console.warn('Run length mismatch', { totalRunLength, graphemeCount });
    }
  }

  /**
   * Returns the current document.
   * @returns The document object.
   */
  public getDocument(): Document {
    return this.document;
  }

  /**
   * Copies text between two positions to clipboard data.
   * @param start - Start position.
   * @param end - End position.
   * @returns Clipboard data with text and styles.
   */
  public copyText(start: { paragraphIndex: number; offset: number }, end: { paragraphIndex: number; offset: number }): ClipboardData {
    this.validatePosition(start);
    this.validatePosition(end);
    if (start.paragraphIndex > end.paragraphIndex ||
        (start.paragraphIndex === end.paragraphIndex && start.offset > end.offset)) {
      throw new Error('Invalid range: start must be before end');
    }

    const clipboardData: ClipboardData = { paragraphs: [] };

    if (start.paragraphIndex === end.paragraphIndex) {
      const paragraph = this.document.paragraphs[start.paragraphIndex];
      clipboardData.paragraphs.push(this.extractTextRange(paragraph, start.offset, end.offset));
    } else {
      // First paragraph
      const firstParagraph = this.document.paragraphs[start.paragraphIndex];
      clipboardData.paragraphs.push(
        this.extractTextRange(firstParagraph, start.offset, this.getGraphemeCount(firstParagraph.text))
      );

      // Middle paragraphs
      for (let i = start.paragraphIndex + 1; i < end.paragraphIndex; i++) {
        const paragraph = this.document.paragraphs[i];
        clipboardData.paragraphs.push({
          text: paragraph.text,
          runs: paragraph.runs.map(run => ({ ...run }))
        });
      }

      // Last paragraph
      const lastParagraph = this.document.paragraphs[end.paragraphIndex];
      clipboardData.paragraphs.push(this.extractTextRange(lastParagraph, 0, end.offset));
    }

    return clipboardData;
  }

  /**
   * Extracts a range of text and runs from a paragraph.
   * @param paragraph - Paragraph to extract from.
   * @param startOffset - Start grapheme offset.
   * @param endOffset - End grapheme offset.
   * @returns Object with text and runs.
   */
  private extractTextRange(paragraph: Paragraph, startOffset: number, endOffset: number): { text: string; runs: Run[] } {
    const text = paragraph.text.slice(startOffset, endOffset).trim();
    const runs: Run[] = [];

    const { runIndex: startRunIndex } = this.findRunAtOffset(paragraph, startOffset);
    const { runIndex: endRunIndex } = this.findRunAtOffset(paragraph, endOffset);

    if (startRunIndex === -1) {
      return {
        text,
        runs: [{ length: this.getGraphemeCount(text), style: paragraph.runs[0]?.style || {} }]
      };
    }

    let currentOffset = 0;
    for (let i = startRunIndex; i <= (endRunIndex >= 0 ? endRunIndex : paragraph.runs.length - 1); i++) {
      const run = paragraph.runs[i];
      const runStart = Math.max(0, startOffset - currentOffset);
      const runEnd = Math.min(run.length, endOffset - currentOffset);
      if (runEnd > runStart) {
        runs.push({
          length: runEnd - runStart,
          style: { ...run.style }
        });
      }
      currentOffset += run.length;
    }

    return { text, runs };
  }

//   /**
//    * Pastes clipboard data at a specified position.
//    * @param position - Paste position.
//    * @param clipboardData - Clipboard data to paste.
//    */
//   public pasteText(position: { paragraphIndex: number; offset: number }, clipboardData: ClipboardData): void {
//     this.validatePosition(position);
//     if (!clipboardData?.paragraphs?.length) return;

//     // Validate clipboard data
//     for (const para of clipboardData.paragraphs) {
//       if (!para.text || !para.runs?.length) {
//         throw new Error('Invalid clipboard data: missing text or runs');
//       }
//       const runLengthSum = para.runs.reduce((sum, run) => sum + run.length, 0);
//       const textLength = this.getGraphemeCount(para.text);
//       if (runLengthSum !== textLength) {
//         throw new Error('Invalid clipboard data: run lengths do not match text length');
//       }
//     }

//     if (clipboardData.paragraphs.length === 1) {
//       // Single paragraph paste
//       this.pasteSingleParagraph(position, clipboardData.paragraphs[0]);
//     } else {
//       // Multi-paragraph paste
//       this.pasteMultipleParagraphs(position, clipboardData.paragraphs);
//     }
//   }

//   /**
//    * Pastes a single paragraph from clipboard data.
//    * @param position - Paste position.
//    * @param pasteContent - Clipboard paragraph content.
//    */
//   private pasteSingleParagraph(position: { paragraphIndex: number; offset: number }, pasteContent: { text: string; runs: Run[] }): void {
//     const paragraph = this.document.paragraphs[position.paragraphIndex];

//     // Split text
//     const beforeText = paragraph.text.slice(0, position.offset);
//     const afterText = paragraph.text.slice(position.offset);

//     // Update text
//     paragraph.text = beforeText + pasteContent.text + afterText;

//     // Update runs
//     this.insertRunsAtOffset(paragraph, position.offset, pasteContent.runs.map(run => ({ ...run })));
//     this.updateRunLengths(paragraph);
//   }

//   /**
//    * Pastes multiple paragraphs from clipboard data.
//    * @param position - Paste position.
//    * @param clipboardParagraphs - Array of clipboard paragraph content.
//    */
//   private pasteMultipleParagraphs(position: { paragraphIndex: number; offset: number }, clipboardParagraphs: { text: string; runs: Run[] }[]): void {
//     const currentParagraph = this.document.paragraphs[position.paragraphIndex];

//     // Split current paragraph
//     const beforeText = currentParagraph.text.slice(0, position.offset);
//     const afterText = currentParagraph.text.slice(position.offset);

//     // Update first paragraph
//     currentParagraph.text = beforeText + clipboardParagraphs[0].text;
//     this.splitRunsAtOffset(currentParagraph, position.offset);
//     this.insertRunsAtOffset(currentParagraph, position.offset, clipboardParagraphs[0].runs.map(run => ({ ...run })));
//     this.updateRunLengths(currentParagraph);

//     // Create new paragraphs for middle content
//     const newParagraphs: Paragraph[] = [];
//     for (let i = 1; i < clipboardParagraphs.length - 1; i++) {
//       newParagraphs.push({
//         text: clipboardParagraphs[i].text,
//         runs: clipboardParagraphs[i].runs.map(run => ({ ...run })),
//         yOffset: 0
//       });
//     }

//     // Create last paragraph
//     if (clipboardParagraphs.length > 1) {
//       const lastClipboardParagraph = clipboardParagraphs[clipboardParagraphs.length - 1];
//       newParagraphs.push({
//         text: lastClipboardParagraph.text + afterText,
//         runs: lastClipboardParagraph.runs.map(run => ({ ...run })),
//         yOffset: 0
//       });

//       // If afterText exists, append runs from the original paragraph
//       if (afterText) {
//         const { runIndex } = this.findRunAtOffset(currentParagraph, position.offset);
//         if (runIndex !== -1) {
//           const remainingRuns = currentParagraph.runs.slice(runIndex).map(run => ({ ...run }));
//           newParagraphs[newParagraphs.length - 1].runs.push(...remainingRuns);
//         }
//         this.updateRunLengths(newParagraphs[newParagraphs.length - 1]);
//       }
//     }

//     // Insert new paragraphs
//     this.document.paragraphs.splice(position.paragraphIndex + 1, 0, ...newParagraphs);
//   }

//   /**
//    * Inserts runs at a specified offset in a paragraph.
//    * @param paragraph - Paragraph to modify.
//    * @param offset - Grapheme offset to insert at.
//    * @param runsToInsert - Runs to insert.
//    */
//   private insertRunsAtOffset(paragraph: Paragraph, offset: number, runsToInsert: Run[]): void {
//     const { runIndex, offsetInRun } = this.findRunAtOffset(paragraph, offset);
//     const newRuns: Run[] = [];

//     // Add runs before insertion point
//     for (let i = 0; i < runIndex; i++) {
//       newRuns.push({ ...paragraph.runs[i] });
//     }

//     // Split current run if needed
//     if (runIndex !== -1) {
//       const currentRun = paragraph.runs[runIndex];
//       if (offsetInRun > 0) {
//         newRuns.push({ length: offsetInRun, style: currentRun.style });
//       }
//       newRuns.push(...runsToInsert.map(run => ({ ...run })));
//       if (offsetInRun < currentRun.length) {
//         newRuns.push({ length: currentRun.length - offsetInRun, style: currentRun.style });
//       }
//       // Add remaining runs
//       for (let i = runIndex + 1; i < paragraph.runs.length; i++) {
//         newRuns.push({ ...paragraph.runs[i] });
//       }
//     } else {
//       // Append at the end
//       newRuns.push(...runsToInsert.map(run => ({ ...run })));
//     }

//     paragraph.runs = this.mergeAdjacentRuns(newRuns);
//   }
}