import { Document, Paragraph, Run } from './Document';
import { TextStyle } from 'canvaskit-wasm';

// Add interface for clipboard data
export interface ClipboardData {
    paragraphs: {
        text: string;
        runs: Run[];
    }[];
}

export class DocumentModel {
    private document: Document;
    private segmenter: Intl.Segmenter;

    constructor(document: Document) {
        this.document = document;
        this.segmenter = new Intl.Segmenter();
    }

    private sliceParagraphText(index: number, start: number, end?: number): string {
        const graphemes = [...this.segmenter.segment(this.document.paragraphs[index].text)];
        const slicedGraphemes = graphemes.slice(start, end);
        return slicedGraphemes.map((x) => x.segment).join('');
    }

    insertText(position: { paragraphIndex: number; offset: number }, text: string, style: TextStyle): void {
        text = text.normalize('NFC'); // Normalize text to NFC form

        const textLength = [...this.segmenter.segment(text)].length;
        
        const paragraph = this.document.paragraphs[position.paragraphIndex];
        if (!paragraph) {
            throw new Error('Invalid paragraph index');
        }

        // Handle newlines in the inserted text
        if (text.includes('\n')) {
            this.insertMultiParagraphText(position, text, style);
            return;
        }

        // Find the run that contains the insertion point
        let currentOffset = 0;
        let runIndex = -1;
        
        for (let i = 0; i < paragraph.runs.length; i++) {
            if (currentOffset + paragraph.runs[i].length > position.offset) {
                runIndex = i;
                break;
            }
            currentOffset += paragraph.runs[i].length;
        }

        // Update the text
        paragraph.text = paragraph.text.slice(0, position.offset) + 
                        text + 
                        paragraph.text.slice(position.offset);

        if (runIndex === -1) {
            // Append as a new run at the end
            paragraph.runs.push({
                length: textLength,
                style
            });
        } else {
            // Handle the existing run and insert the new text
            const run = paragraph.runs[runIndex];

            if(this.isStyleEqual(run.style, style)) {
                // If the style is the same, just update the run length
                run.length += textLength;

            } else {
                // If the style is different, we need to split the run
                const splitPoint = position.offset - currentOffset;
                
                const newRuns: Run[] = [];
                if (splitPoint > 0) {
                    newRuns.push({
                        length: splitPoint,
                        style: run.style
                    });
                }
                
                newRuns.push({
                    length: textLength,
                    style
                });
                
                if (splitPoint < run.length) {
                    newRuns.push({
                        length: run.length - splitPoint,
                        style: run.style
                    });
                }

                paragraph.runs.splice(runIndex, 1, ...newRuns);
            }
        }

        // Update lengths of subsequent runs
        this.updateRunLengths(paragraph);
    }

    private isStyleEqual(styleA: TextStyle, styleB: TextStyle): boolean {
        // Compare styles deeply
        return Object.keys(styleA).length === Object.keys(styleB).length &&
            JSON.stringify(styleA) === JSON.stringify(styleB);
    }

    private insertMultiParagraphText(position: { paragraphIndex: number; offset: number }, text: string, style: TextStyle): void {
        const paragraphs = text.split('\n');
        const paragraph = this.document.paragraphs[position.paragraphIndex];

        // Split the current paragraph's text

        const beforeText = this.sliceParagraphText(position.paragraphIndex, 0, position.offset);
        const afterText = this.sliceParagraphText(position.paragraphIndex, position.offset);
        
        // Update the first paragraph
        paragraph.text = beforeText + paragraphs[0];
        this.updateRunsForSplit(paragraph, position.offset);
        
        // Create new paragraphs for the middle parts
        const newParagraphs: Paragraph[] = [];
        for (let i = 1; i < paragraphs.length - 1; i++) {
            newParagraphs.push({
                text: paragraphs[i],
                runs: [{
                    length: paragraphs[i].length,
                    style
                }],
                yOffset: 0
            });
        }
        
        // Create the last paragraph with the remaining text
        if (paragraphs.length > 1) {
            newParagraphs.push({
                text: paragraphs[paragraphs.length - 1] + afterText,
                runs: [{
                    length: paragraphs[paragraphs.length - 1].length + afterText.length,
                    style
                }],
                yOffset: 0
            });
        }
        
        // Insert the new paragraphs
        this.document.paragraphs.splice(
            position.paragraphIndex + 1,
            0,
            ...newParagraphs
        );
    }

    deleteText(start: { paragraphIndex: number; offset: number }, end: { paragraphIndex: number; offset: number }): void {
        if (start.paragraphIndex === end.paragraphIndex) {
            this.deleteSingleParagraph(start.paragraphIndex, start.offset, end.offset);
        } else {
            this.deleteMultiParagraph(start, end);
        }
    }

    private deleteSingleParagraph(paragraphIndex: number, start: number, end: number): void {
        const paragraph = this.document.paragraphs[paragraphIndex];
        if (!paragraph) {
            throw new Error('Invalid paragraph index');
        }

        const paragraphGraphemes = [...this.segmenter.segment(paragraph.text)];
        const actualStart = Math.max(0, start);
        const actualEnd = Math.min(paragraphGraphemes.length, end);

        

        paragraph.text = paragraphGraphemes.slice(0, actualStart).map((x)=>x.segment).join('') +
                        paragraphGraphemes.slice(actualEnd).map((x)=>x.segment).join('');
        this.updateRunsForDeletion(paragraph, actualStart, actualEnd - actualStart);
        this.updateRunLengths(paragraph);
    }

    private deleteMultiParagraph(start: { paragraphIndex: number; offset: number }, end: { paragraphIndex: number; offset: number }): void {
        // Get the start and end paragraphs
        const startParagraph = this.document.paragraphs[start.paragraphIndex];
        const endParagraph = this.document.paragraphs[end.paragraphIndex];

        // Combine the remaining text
        const newText = this.sliceParagraphText(start.paragraphIndex, 0, start.offset) + this.sliceParagraphText(end.paragraphIndex, end.offset);
        startParagraph.text = newText;

        // Remove the paragraphs in between
        this.document.paragraphs.splice(
            start.paragraphIndex + 1,
            end.paragraphIndex - start.paragraphIndex
        );

        // Update the runs in the combined paragraph
        this.updateRunsForMultiParagraphDeletion(startParagraph, start.offset, endParagraph, end.offset);
        this.updateRunLengths(startParagraph);
    }

    private updateRunLengths(paragraph: Paragraph): void {
        let currentOffset = 0;
        for (const run of paragraph.runs) {
            // Update run length based on the actual text length it covers
            const nextOffset = Math.min(currentOffset + run.length, [...this.segmenter.segment(paragraph.text)].length);
            run.length = nextOffset - currentOffset;
            currentOffset = nextOffset;
        }

        // Remove any zero-length runs
        paragraph.runs = paragraph.runs.filter(run => run.length > 0);
    }

    applyStyle(start: { paragraphIndex: number; offset: number }, end: { paragraphIndex: number; offset: number }, style: Partial<TextStyle>): void {
        if (start.paragraphIndex === end.paragraphIndex) {
            this.applySingleParagraphStyle(start.paragraphIndex, start.offset, end.offset, style);
        } else {
            this.applyMultiParagraphStyle(start, end, style);
        }
    }

    private applySingleParagraphStyle(paragraphIndex: number, start: number, end: number, style: Partial<TextStyle>): void {
        const paragraph = this.document.paragraphs[paragraphIndex];
        let currentOffset = 0;
        let startRunIndex = -1;
        let endRunIndex = -1;

        // Find affected runs
        for (let i = 0; i < paragraph.runs.length; i++) {
            const run = paragraph.runs[i];
            if (startRunIndex === -1 && currentOffset + run.length > start) {
                startRunIndex = i;
            }
            if (endRunIndex === -1 && currentOffset + run.length >= end) {
                endRunIndex = i;
                break;
            }
            currentOffset += run.length;
        }

        if (startRunIndex === -1) {
            return;
        }

        // Split and update the runs
        const newRuns: Run[] = [];
        currentOffset = 0;

        for (let i = 0; i < paragraph.runs.length; i++) {
            const run = paragraph.runs[i];
            
            if (i < startRunIndex || i > endRunIndex) {
                newRuns.push(run);
                continue;
            }

            if (i === startRunIndex) {
                const startOffset = start - currentOffset;
                if (startOffset > 0) {
                    newRuns.push({
                        length: startOffset,
                        style: run.style
                    });
                }
            }

            if (i === endRunIndex) {
                const endOffset = end - currentOffset;
                newRuns.push({
                    length: endOffset - (i === startRunIndex ? start - currentOffset : 0),
                    style: { ...run.style, ...style }
                });
                
                if (endOffset < run.length) {
                    newRuns.push({
                        length: run.length - endOffset,
                        style: run.style
                    });
                }
            } else if (i >= startRunIndex && i < endRunIndex) {
                newRuns.push({
                    length: run.length,
                    style: { ...run.style, ...style }
                });
            }

            currentOffset += run.length;
        }

        paragraph.runs = this.mergeAdjacentRuns(newRuns);
    }

    private applyMultiParagraphStyle(start: { paragraphIndex: number; offset: number }, end: { paragraphIndex: number; offset: number }, style: Partial<TextStyle>): void {
        // Apply style to first paragraph
        this.applySingleParagraphStyle(
            start.paragraphIndex,
            start.offset,
            this.document.paragraphs[start.paragraphIndex].text.length,
            style
        );

        // Apply style to middle paragraphs
        for (let i = start.paragraphIndex + 1; i < end.paragraphIndex; i++) {
            this.applySingleParagraphStyle(
                i,
                0,
                this.document.paragraphs[i].text.length,
                style
            );
        }

        // Apply style to last paragraph
        this.applySingleParagraphStyle(
            end.paragraphIndex,
            0,
            end.offset,
            style
        );
    }

    private mergeAdjacentRuns(runs: Run[]): Run[] {
        if (runs.length <= 1) return runs;

        const merged: Run[] = [runs[0]];
        
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

    private areStylesEqual(style1: TextStyle, style2: TextStyle): boolean {
        // Deep comparison of style objects
        return JSON.stringify(style1) === JSON.stringify(style2);
    }

    getDocument(): Document {
        return this.document;
    }

    copyText(start: { paragraphIndex: number; offset: number }, end: { paragraphIndex: number; offset: number }): ClipboardData {
        const clipboardData: ClipboardData = { paragraphs: [] };

        if (start.paragraphIndex === end.paragraphIndex) {
            // Copy from single paragraph
            const paragraph = this.document.paragraphs[start.paragraphIndex];
            clipboardData.paragraphs.push(this.extractParagraphContent(paragraph, start.offset, end.offset));
        } else {
            // Copy first paragraph
            const firstParagraph = this.document.paragraphs[start.paragraphIndex];
            clipboardData.paragraphs.push(
                this.extractParagraphContent(firstParagraph, start.offset, firstParagraph.text.length)
            );

            // Copy middle paragraphs
            for (let i = start.paragraphIndex + 1; i < end.paragraphIndex; i++) {
                const paragraph = this.document.paragraphs[i];
                clipboardData.paragraphs.push({
                    text: paragraph.text,
                    runs: [...paragraph.runs]
                });
            }

            // Copy last paragraph
            const lastParagraph = this.document.paragraphs[end.paragraphIndex];
            clipboardData.paragraphs.push(
                this.extractParagraphContent(lastParagraph, 0, end.offset)
            );
        }

        return clipboardData;
    }

    pasteText(position: { paragraphIndex: number; offset: number }, clipboardData: ClipboardData): void {
        if (clipboardData.paragraphs.length === 0) {
            return;
        }

        // For single paragraph paste
        if (clipboardData.paragraphs.length === 1) {
            const paragraph = this.document.paragraphs[position.paragraphIndex];
            const pasteContent = clipboardData.paragraphs[0];
            
            // Split the current paragraph's text
            const beforeText = paragraph.text.slice(0, position.offset);
            const afterText = paragraph.text.slice(position.offset);
            
            // Update text
            paragraph.text = beforeText + pasteContent.text + afterText;
            
            // Update runs
            this.insertRunsAtOffset(paragraph, position.offset, pasteContent.runs);
            return;
        }

        // For multi-paragraph paste
        const currentParagraph = this.document.paragraphs[position.paragraphIndex];
        const beforeText = currentParagraph.text.slice(0, position.offset);
        const afterText = currentParagraph.text.slice(position.offset);

        // Update first paragraph
        currentParagraph.text = beforeText + clipboardData.paragraphs[0].text;
        this.updateRunsForPaste(currentParagraph, position.offset, clipboardData.paragraphs[0].runs);

        // Create new paragraphs for middle content
        const newParagraphs: Paragraph[] = [];
        for (let i = 1; i < clipboardData.paragraphs.length - 1; i++) {
            newParagraphs.push({
                text: clipboardData.paragraphs[i].text,
                runs: [...clipboardData.paragraphs[i].runs],
                yOffset: 0
            });
        }

        // Create last paragraph with remaining content
        const lastClipboardParagraph = clipboardData.paragraphs[clipboardData.paragraphs.length - 1];
        newParagraphs.push({
            text: lastClipboardParagraph.text + afterText,
            runs: [...lastClipboardParagraph.runs],
            yOffset: 0
        });

        // Insert all new paragraphs
        this.document.paragraphs.splice(
            position.paragraphIndex + 1,
            0,
            ...newParagraphs
        );
    }

    private updateRunsForSplit(paragraph: Paragraph, splitPoint: number): void {
        let currentOffset = 0;
        let runIndex = 0;
        
        // Find the run containing the split point
        while (runIndex < paragraph.runs.length && currentOffset + paragraph.runs[runIndex].length <= splitPoint) {
            currentOffset += paragraph.runs[runIndex].length;
            runIndex++;
        }

        if (runIndex < paragraph.runs.length) {
            const run = paragraph.runs[runIndex];
            const runSplitPoint = splitPoint - currentOffset;
            
            if (runSplitPoint > 0 && runSplitPoint < run.length) {
                // Split the run into two parts
                paragraph.runs.splice(runIndex, 1,
                    { length: runSplitPoint, style: run.style },
                    { length: run.length - runSplitPoint, style: run.style }
                );
            }
        }
    }

    private updateRunsForDeletion(paragraph: Paragraph, start: number, length: number): void {
        let currentOffset = 0;
        let startRunIndex = -1;
        let endRunIndex = -1;
        
        // Find affected runs
        for (let i = 0; i < paragraph.runs.length; i++) {
            const run = paragraph.runs[i];
            if (startRunIndex === -1 && currentOffset + run.length > start) {
                startRunIndex = i;
            }
            if (endRunIndex === -1 && currentOffset + run.length >= start + length) {
                endRunIndex = i;
                break;
            }
            currentOffset += run.length;
        }

        if (startRunIndex === -1) {
            return;
        }

        // Calculate actual length to delete based on surrogate pairs
        const deletedText = paragraph.text.slice(start, start + length);
        const actualLength = deletedText.length;
        
        // Update run lengths and merge if needed
        const firstRun = paragraph.runs[startRunIndex];
        const lastRun = paragraph.runs[endRunIndex] || firstRun;
        const startOffset = start - (currentOffset - firstRun.length);
        const endOffset = (start + length) - (currentOffset - lastRun.length);

        if (startRunIndex === endRunIndex) {
            // Deletion within a single run
            firstRun.length -= actualLength;
            if (firstRun.length <= 0) {
                paragraph.runs.splice(startRunIndex, 1);
            }
        } else {
            // Deletion across multiple runs
            const remainingLength = startOffset + (lastRun.length - endOffset);
            if (remainingLength > 0) {
                firstRun.length = remainingLength;
                paragraph.runs.splice(startRunIndex + 1, endRunIndex - startRunIndex);
            } else {
                paragraph.runs.splice(startRunIndex, endRunIndex - startRunIndex + 1);
            }
        }
    }

    private updateRunsForMultiParagraphDeletion(startPara: Paragraph, startOffset: number, endPara: Paragraph, endOffset: number): void {
        // Trim runs in start paragraph up to startOffset
        let currentOffset = 0;
        let startRunIndex = -1;
        for (let i = 0; i < startPara.runs.length; i++) {
            const run = startPara.runs[i];
            if (currentOffset + run.length > startOffset) {
                startRunIndex = i;
                break;
            }
            currentOffset += run.length;
        }

        if (startRunIndex !== -1) {
            const startRun = startPara.runs[startRunIndex];
            const startSplitOffset = startOffset - currentOffset;
            if (startSplitOffset > 0) {
                startRun.length = startSplitOffset;
                startPara.runs.splice(startRunIndex + 1);
            } else {
                startPara.runs.splice(startRunIndex);
            }
        } else {
            startPara.runs = [];
        }

        // Append runs from end paragraph starting from endOffset
        let globalGraphemeOffset = 0;
        for (const run of endPara.runs) {
            const runGraphemeCount = run.length;
            if (globalGraphemeOffset + runGraphemeCount > endOffset) {
                const runStart = Math.max(endOffset - globalGraphemeOffset, 0);
                const runEnd = runGraphemeCount;
                const length = runEnd - runStart;
                if (length > 0) {
                    startPara.runs.push({
                        length: length,
                        style: run.style
                    });
                }
            }
            globalGraphemeOffset += runGraphemeCount;
        }

        // Merge adjacent runs with the same style
        startPara.runs = this.mergeAdjacentRuns(startPara.runs);

        // If all runs have the same style, merge into a single run
        if (startPara.runs.length > 0) {
            const firstStyle = JSON.stringify(startPara.runs[0].style);
            const allSameStyle = startPara.runs.every(r => JSON.stringify(r.style) === firstStyle);
            if (allSameStyle) {
                startPara.runs = [{
                    length: [...this.segmenter.segment(startPara.text)].length,
                    style: startPara.runs[0].style
                }];
            }
        } else {
            // If no runs remain, create a single run for the entire text
            startPara.runs = [{
                length: [...this.segmenter.segment(startPara.text)].length,
                style: startPara.runs[0]?.style || {}
            }];
        }
    }

    private insertRunsAtOffset(paragraph: Paragraph, offset: number, runsToInsert: Run[]): void {
        let currentOffset = 0;
        let runIndex = 0;
        
        // Find the run containing the insertion point
        while (runIndex < paragraph.runs.length && currentOffset + paragraph.runs[runIndex].length <= offset) {
            currentOffset += paragraph.runs[runIndex].length;
            runIndex++;
        }

        const newRuns: Run[] = [];
        
        // Add runs before insertion point
        for (let i = 0; i < runIndex; i++) {
            newRuns.push({ ...paragraph.runs[i] });
        }

        // Split current run if needed
        if (runIndex < paragraph.runs.length) {
            const currentRun = paragraph.runs[runIndex];
            const splitPoint = offset - currentOffset;
            
            if (splitPoint > 0) {
                newRuns.push({
                    length: splitPoint,
                    style: currentRun.style
                });
            }

            // Add inserted runs
            newRuns.push(...runsToInsert);

            if (splitPoint < currentRun.length) {
                newRuns.push({
                    length: currentRun.length - splitPoint,
                    style: currentRun.style
                });
            }

            // Add remaining runs
            newRuns.push(...paragraph.runs.slice(runIndex + 1));
        } else {
            // Append at the end
            newRuns.push(...runsToInsert);
        }

        paragraph.runs = this.mergeAdjacentRuns(newRuns);
    }

    private updateRunsForPaste(paragraph: Paragraph, offset: number, pastedRuns: Run[]): void {
        this.updateRunsForSplit(paragraph, offset);
        this.insertRunsAtOffset(paragraph, offset, pastedRuns);
    }

    private extractParagraphContent(paragraph: Paragraph, start: number, end: number): { text: string; runs: Run[] } {
        const text = paragraph.text.slice(start, end).trim(); // Trim to handle spacing issues
        const runs: Run[] = [];
        
        let currentOffset = 0;
        let startRunIndex = -1;
        let endRunIndex = -1;
        
        // Find affected runs
        for (let i = 0; i < paragraph.runs.length; i++) {
            const run = paragraph.runs[i];
            if (startRunIndex === -1 && currentOffset + run.length > start) {
                startRunIndex = i;
            }
            if (endRunIndex === -1 && currentOffset + run.length >= end) {
                endRunIndex = i;
                break;
            }
            currentOffset += run.length;
        }

        if (startRunIndex === -1) {
            return { text, runs: [{ length: text.length, style: paragraph.runs[0]?.style || {} }] };
        }

        // Extract runs
        currentOffset = 0;
        for (let i = startRunIndex; i <= endRunIndex; i++) {
            const run = paragraph.runs[i];
            const runStart = Math.max(0, start - currentOffset);
            const runEnd = Math.min(run.length, end - currentOffset);
            
            if (runEnd > runStart) {
                const length = runEnd - runStart;
                if (length > 0) {
                    runs.push({
                        length,
                        style: { ...run.style }
                    });
                }
            }
            
            currentOffset += run.length;
        }

        return { text, runs };
    }
}