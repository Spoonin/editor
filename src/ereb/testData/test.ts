import { Document, Paragraph, Run } from "../Document/Document";

// Helper function to create a paragraph with styled runs
function createStyledParagraph(text: string, runs: { length: number; style: any }[]): Paragraph {
    const paragraph ={ text, runs: [] as Run[], yOffset: 0 };
    paragraph.runs = runs;
    return paragraph;
}

// Create paragraphs using the new implementation
const paragraph = createStyledParagraph(
    "Killing Commendatore (Japanese: 騎士団長殺し, Hepburn: Kishidanchō-goroshi) is a 2017 novel written by Japanese writer Haruki Murakami. It was first published in two volumes–The Idea Made Visible, (Arawareru idea hen) and The Shifting Metaphor ( Utsurou metafā hen), respectively–by Shinchosha in Japan on 24 February 2017. The first volume was released in English on 19 September 2017 by Harvill Secker in the UK and Alfred A. Knopf in the US, while the second volume was released on 17 October 2017. The novel is a metaphysical mystery that follows a portrait painter who moves to a remote mountain village after his wife leaves him. He becomes embroiled in a series of strange events involving a mysterious neighbor, a missing cat, and a ghostly figure from the past.",
    [
        {
            length: 2,
            style: { fontSize: 24, fontStyle: { weight: { value: 600 } } }
        },
        {
            length: 762,
            style: { fontSize: 22 } 
        }
    ]
);

const paragraph1 = createStyledParagraph(
    "The Evolution of Modern Computing Systems ❄️",
    [
        {
            length: 43,
            style: { fontSize: 32, fontStyle: { weight: { value: 700 } } }
        }
    ]
);

const paragraph2 = createStyledParagraph(
    "In quantum computing, the relationship between qubits and classical bits represents a fundamental paradigm shift. While a classical bit exists in either state |0⟩ or |1⟩, a qubit can exist in a superposition α|0⟩ + β|1⟩, where |α|² + |β|² = 1. This property leads to exponential growth in computational possibilities, as n qubits can represent 2ⁿ states simultaneously. Recent breakthroughs in error correction have achieved coherence times exceeding 1000μs, marking a significant milestone in quantum computing development. The implementation of Shor's algorithm on a 256-qubit system demonstrated the potential to factor large numbers efficiently, challenging current cryptographic systems based on RSA encryption.",
    [
        {
            length: 89,
            style: { fontSize: 18, fontStyle: { weight: { value: 500 } } }
        },
        {
            length: 627,
            style: { fontSize: 16 }
        }
    ]
);

// Create and export the document using the new implementation
export const testDocument: Document = {
    paragraphs: [
      paragraph,
      paragraph1,
      paragraph2,
]};