import { describe, expect, beforeEach, it } from 'vitest';
import { Document } from '../Document';
import { DocumentModel } from '../DocumentModel';

describe('Document Model', () => {
    let testDoc: Document;
    let model: DocumentModel;
    
    beforeEach(() => {
        testDoc = {
            paragraphs: [
                {
                    text: "First paragraph",
                    runs: [
                        {
                            length: 15,
                            style: { fontSize: 16 }
                        }
                    ],
                    yOffset: 0
                }
            ]
        };
        model = new DocumentModel(testDoc);
    });

    describe('Text Insertion', () => {
        it('should insert text at the beginning of a paragraph and not add runs if style is the same', () => {
            model.insertText(
                { paragraphIndex: 0, offset: 0 },
                "Hello ",
                { fontSize: 16 }
            );

            const result = model.getDocument();
            expect(result.paragraphs[0].text).toBe("Hello First paragraph");
            expect(result.paragraphs[0].runs).toHaveLength(1);
            expect(result.paragraphs[0].runs[0].length).toBe(21);
        });

        it('should insert text at the beginning of a paragraph and add run if style is different', () => {
            model.insertText(
                { paragraphIndex: 0, offset: 0 },
                "Hello ",
                { fontSize: 14 }
            );

            const result = model.getDocument();
            expect(result.paragraphs[0].text).toBe("Hello First paragraph");
            expect(result.paragraphs[0].runs).toHaveLength(2);
            expect(result.paragraphs[0].runs[0].length).toBe(6);
            expect(result.paragraphs[0].runs[1].length).toBe(15);
        });

        it('should insert text in the middle of a paragraph', () => {
            model.insertText(
                { paragraphIndex: 0, offset: 5 },
                " nice",
                { fontSize: 18 }
            );

            const result = model.getDocument();
            expect(result.paragraphs[0].text).toBe("First nice paragraph");
            expect(result.paragraphs[0].runs).toHaveLength(3);
            expect(result.paragraphs[0].runs[1].style.fontSize).toBe(18);
        });

        it('should insert text at the end of a paragraph', () => {
            model.insertText(
                { paragraphIndex: 0, offset: 15 },
                " end",
                { fontSize: 16 }
            );

            const result = model.getDocument();
            expect(result.paragraphs[0].text).toBe("First paragraph end");
            expect(result.paragraphs[0].runs).toHaveLength(2);
        });

        it('should handle multi-paragraph text insertion', () => {
            model.insertText(
                { paragraphIndex: 0, offset: 5 },
                " split\nNew paragraph\nThird",
                { fontSize: 16 }
            );

            const result = model.getDocument();
            expect(result.paragraphs).toHaveLength(3);
            expect(result.paragraphs[0].text).toBe("First split");
            expect(result.paragraphs[1].text).toBe("New paragraph");
            expect(result.paragraphs[2].text).toBe("Third paragraph");
        });

        describe('Unicode Surrogate Pairs', () => {
            it('should properly handle emoji insertion', () => {
                model.insertText(
                    { paragraphIndex: 0, offset: 5 },
                    "🐻‍❄",  // polar bear emoji
                    { fontSize: 16 }
                );

                const result = model.getDocument();
                expect(result.paragraphs[0].text).toBe("First🐻‍❄ paragraph");
                expect(result.paragraphs[0].runs).toHaveLength(1);
                expect(result.paragraphs[0].runs[0].length).toBe(16);
            });

            it('should handle multiple emojis in text', () => {
                model.insertText(
                    { paragraphIndex: 0, offset: 0 },
                    "❄️✨",  // snowflake + sparkles
                    { fontSize: 16 }
                );

                const result = model.getDocument();
                expect(result.paragraphs[0].text).toBe("❄️✨First paragraph");
                expect(result.paragraphs[0].runs).toHaveLength(1);
                expect(result.paragraphs[0].runs[0].length).toBe(17);
            });

            it('should properly split runs with surrogate pairs', () => {
                model.insertText(
                    { paragraphIndex: 0, offset: 5 },
                    "🎨",  // art palette emoji
                    { fontSize: 20 }  // different font size to force run split
                );

                const result = model.getDocument();
                expect(result.paragraphs[0].text).toBe("First🎨 paragraph");
                expect(result.paragraphs[0].runs).toHaveLength(3);
                expect(result.paragraphs[0].runs[0].length).toBe(5);  // "First"
                expect(result.paragraphs[0].runs[1].length).toBe(1);  // emoji (surrogate pair)
                expect(result.paragraphs[0].runs[2].length).toBe(10);  // " paragraph"
            });
        });
    });

    describe('Text Deletion', () => {
        beforeEach(() => {
            testDoc = {
                paragraphs: [
                    {
                        text: "First paragraph",
                        runs: [{ length: 14, style: { fontSize: 16 } }],
                        yOffset: 0
                    },
                    {
                        text: "Second paragraph",
                        runs: [{ length: 15, style: { fontSize: 16 } }],
                        yOffset: 0
                    }
                ]
            };
            model = new DocumentModel(testDoc);
        });

        it('should delete text within a single paragraph', () => {
            model.deleteText(
                { paragraphIndex: 0, offset: 6 },
                { paragraphIndex: 0, offset: 10 }
            );

            const result = model.getDocument();
            expect(result.paragraphs[0].text).toBe("First graph");
            expect(result.paragraphs[0].runs).toHaveLength(1);
        });

        it('should delete text across multiple paragraphs', () => {
            model.deleteText(
                { paragraphIndex: 0, offset: 6 },
                { paragraphIndex: 1, offset: 7 }
            );

            const result = model.getDocument();
            expect(result.paragraphs).toHaveLength(1);
            expect(result.paragraphs[0].text).toBe("First paragraph");
        });

        it('should merge paragraphs when deleting paragraph boundary', () => {
            model.deleteText(
                { paragraphIndex: 0, offset: 15 },
                { paragraphIndex: 1, offset: 0 }
            );

            const result = model.getDocument();
            expect(result.paragraphs).toHaveLength(1);
            expect(result.paragraphs[0].text).toBe("First paragraphSecond paragraph");
        });

        describe('Unicode Surrogate Pairs', () => {
            beforeEach(() => {
                testDoc = {
                    paragraphs: [
                        {
                            text: "Hello ❄️ World",
                            runs: [{ length: 13, style: { fontSize: 16 } }],
                            yOffset: 0
                        },
                        {
                            text: "Next 🎈🐻‍❄ Line",
                            runs: [{ length: 13, style: { fontSize: 16 } }],
                            yOffset: 0
                        }
                    ]
                };
                model = new DocumentModel(testDoc);
            });

            it('should properly delete a single emoji', () => {
                model.deleteText(
                    { paragraphIndex: 0, offset: 6 },
                    { paragraphIndex: 0, offset: 8 }
                );

                const result = model.getDocument();
                expect(result.paragraphs[0].text).toBe("Hello World");
                expect(result.paragraphs[0].runs).toHaveLength(1);
                expect(result.paragraphs[0].runs[0].length).toBe(11);
            });

            it('should handle deletion across multiple emojis', () => {
                model.deleteText(
                    { paragraphIndex: 1, offset: 5 },
                    { paragraphIndex: 1, offset: 8 }
                );

                const result = model.getDocument();
                expect(result.paragraphs[1].text).toBe("Next Line");
                expect(result.paragraphs[1].runs).toHaveLength(1);
                expect(result.paragraphs[1].runs[0].length).toBe(9);
            });

            it('should properly merge paragraphs containing emojis', () => {
                model.deleteText(
                    { paragraphIndex: 0, offset: 13 },
                    { paragraphIndex: 1, offset: 0 }
                );

                const result = model.getDocument();
                expect(result.paragraphs).toHaveLength(1);
                expect(result.paragraphs[0].text).toBe("Hello ❄️ WorldNext 🎈🐻‍❄ Line");
                expect(result.paragraphs[0].runs).toHaveLength(1);
                expect(result.paragraphs[0].runs[0].length).toBe(25);
            });

            it('should handle deletion spanning an emoji boundary', () => {
                model.deleteText(
                    { paragraphIndex: 0, offset: 7 },
                    { paragraphIndex: 0, offset: 8 }
                );

                const result = model.getDocument();
                expect(result.paragraphs[0].text).toBe("Hello ❄️World");
                expect(result.paragraphs[0].runs).toHaveLength(1);
                expect(result.paragraphs[0].runs[0].length).toBe(12);
            });
        });
    });

    // describe('Style Application', () => {
    //     it('should apply style to text within a single run', () => {
    //         editor.applyStyle(
    //             { paragraphIndex: 0, offset: 0 },
    //             { paragraphIndex: 0, offset: 5 },
    //             { fontSize: 24 }
    //         );

    //         const result = editor.getDocument();
    //         expect(result.paragraphs[0].runs).toHaveLength(2);
    //         expect(result.paragraphs[0].runs[0].style.fontSize).toBe(24);
    //         expect(result.paragraphs[0].runs[1].style.fontSize).toBe(16);
    //     });

    //     it('should split runs when applying style to part of a run', () => {
    //         editor.applyStyle(
    //             { paragraphIndex: 0, offset: 6 },
    //             { paragraphIndex: 0, offset: 9 },
    //             { fontSize: 20 }
    //         );

    //         const result = editor.getDocument();
    //         expect(result.paragraphs[0].runs).toHaveLength(3);
    //         expect(result.paragraphs[0].runs[1].style.fontSize).toBe(20);
    //     });

    //     it('should merge adjacent runs with identical styles', () => {
    //         // First split the run
    //         editor.applyStyle(
    //             { paragraphIndex: 0, offset: 5 },
    //             { paragraphIndex: 0, offset: 9 },
    //             { fontSize: 20 }
    //         );
    //         // Then apply the same style to adjacent text
    //         editor.applyStyle(
    //             { paragraphIndex: 0, offset: 9 },
    //             { paragraphIndex: 0, offset: 14 },
    //             { fontSize: 20 }
    //         );

    //         const result = editor.getDocument();
    //         expect(result.paragraphs[0].runs).toHaveLength(2);
    //         expect(result.paragraphs[0].runs[1].length).toBe(9);
    //     });

    //     it('should apply style across multiple paragraphs', () => {
    //         // Add another paragraph first
    //         editor.insertText(
    //             { paragraphIndex: 0, offset: 14 },
    //             "\nSecond paragraph",
    //             { fontSize: 16 }
    //         );

    //         editor.applyStyle(
    //             { paragraphIndex: 0, offset: 10 },
    //             { paragraphIndex: 1, offset: 7 },
    //             { fontSize: 24 }
    //         );

    //         const result = editor.getDocument();
    //         expect(result.paragraphs).toHaveLength(2);
    //         expect(result.paragraphs[0].runs[1].style.fontSize).toBe(24);
    //         expect(result.paragraphs[1].runs[0].style.fontSize).toBe(24);
    //     });
    // });

    // describe('Clipboard Operations', () => {
    //     beforeEach(() => {
    //         testDoc = {
    //             paragraphs: [
    //                 {
    //                     text: "First paragraph with formatting",
    //                     runs: [
    //                         { length: 5, style: { fontSize: 16 } },
    //                         { length: 15, style: { fontSize: 20, fontStyle: { weight: { value: 700 } } } },
    //                         { length: 9, style: { fontSize: 16 } }
    //                     ],
    //                     yOffset: 0
    //                 },
    //                 {
    //                     text: "Second paragraph",
    //                     runs: [
    //                         { length: 15, style: { fontSize: 16 } }
    //                     ],
    //                     yOffset: 0
    //                 }
    //             ]
    //         };
    //         editor = new DocumentEditor(testDoc);
    //     });

    //     it('should copy text with formatting from single paragraph', () => {
    //         const clipboardData = editor.copyText(
    //             { paragraphIndex: 0, offset: 6 },
    //             { paragraphIndex: 0, offset: 21 }
    //         );
            
    //         expect(clipboardData.paragraphs).toHaveLength(1);
    //         expect(clipboardData.paragraphs[0].text).toBe("paragraph with");
    //         expect(clipboardData.paragraphs[0].runs).toHaveLength(2);
    //         expect(clipboardData.paragraphs[0].runs[0].style.fontSize).toBe(20);
    //     });

    //     it('should copy text with formatting across paragraphs', () => {
    //         const clipboardData = editor.copyText(
    //             { paragraphIndex: 0, offset: 20 },
    //             { paragraphIndex: 1, offset: 6 }
    //         );
            
    //         expect(clipboardData.paragraphs).toHaveLength(2);
    //         expect(clipboardData.paragraphs[0].text).toBe("formatting");
    //         expect(clipboardData.paragraphs[1].text).toBe("Second");
    //     });

    //     it('should paste text with formatting into single paragraph', () => {
    //         const clipboardData: ClipboardData = {
    //             paragraphs: [{
    //                 text: "styled text",
    //                 runs: [{
    //                     length: 6,
    //                     style: { fontSize: 24, fontStyle: { weight: { value: 700 } } }
    //                 }, {
    //                     length: 4,
    //                     style: { fontSize: 16 }
    //                 }]
    //             }]
    //         };

    //         editor.pasteText(
    //             { paragraphIndex: 0, offset: 6 },
    //             clipboardData
    //         );

    //         const result = editor.getDocument();
    //         expect(result.paragraphs[0].text).toBe("First styled text paragraph with formatting");
    //         expect(result.paragraphs[0].runs).toHaveLength(5);
    //         expect(result.paragraphs[0].runs[1].style.fontSize).toBe(24);
    //     });

    //     it('should paste multi-paragraph text with formatting', () => {
    //         const clipboardData: ClipboardData = {
    //             paragraphs: [{
    //                 text: "styled",
    //                 runs: [{
    //                     length: 6,
    //                     style: { fontSize: 24 }
    //                 }]
    //             }, {
    //                 text: "multi-paragraph",
    //                 runs: [{
    //                     length: 14,
    //                     style: { fontSize: 18 }
    //                 }]
    //             }]
    //         };

    //         editor.pasteText(
    //             { paragraphIndex: 0, offset: 6 },
    //             clipboardData
    //         );

    //         const result = editor.getDocument();
    //         expect(result.paragraphs).toHaveLength(3);
    //         expect(result.paragraphs[0].text).toBe("First styled");
    //         expect(result.paragraphs[1].text).toBe("multi-paragraph");
    //         expect(result.paragraphs[2].text).toBe("paragraph with formatting");
    //     });
    // });
});