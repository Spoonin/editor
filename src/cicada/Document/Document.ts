import { TextStyle } from "canvaskit-wasm";

export interface Run {
    length: number;
    style: TextStyle;
}

export interface Paragraph {
    runs: Run[];
    text: string;
    yOffset: number;
}

export interface Document {
    paragraphs: Paragraph[];
}
