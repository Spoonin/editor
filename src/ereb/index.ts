import "../index.css";
import CanvasKitInit, { CanvasKit, ParagraphBuilder, Surface } from "canvaskit-wasm";
import { loadFonts, preloadFonts } from "../fonts";
import { testDocument } from "./testData/test";

let canvasToDisplayWidth = 300;
let canvasToDisplayHeight = 250;
let needRender = true;
let scrollY = 0;
let totalDocumentHeight = 0;

const debounce = (callback: Function, wait: number) => {
    let timeoutId: ReturnType<typeof setTimeout>;
    return (...args: any[]) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        callback(...args);
      }, wait);
    };
}

function onResize(entries: ResizeObserverEntry[]) {
    for (const entry of entries) {
        let width;
        let height;
        let dpr = window.devicePixelRatio;
        if (entry.devicePixelContentBoxSize) {
            width = entry.devicePixelContentBoxSize[0].inlineSize;
            height = entry.devicePixelContentBoxSize[0].blockSize;
            dpr = 1; // it's already in width and height
        } else if (entry.contentBoxSize) {
            if (entry.contentBoxSize[0]) {
                width = entry.contentBoxSize[0].inlineSize;
                height = entry.contentBoxSize[0].blockSize;
            } else {
                width = (entry.contentBoxSize as unknown as ResizeObserverSize).inlineSize;
                height = (entry.contentBoxSize as unknown as ResizeObserverSize).blockSize;
            }
        } else {
            width = entry.contentRect.width;
            height = entry.contentRect.height;
        }
        canvasToDisplayWidth = Math.round(width * dpr);
        canvasToDisplayHeight = Math.round(height * dpr);
    }
}

const canvas = document.getElementById('editor') as HTMLCanvasElement;

function render(kit: CanvasKit, builder: ParagraphBuilder, surface?: Surface) {
    if (!surface) {
        surface = kit.MakeWebGLCanvasSurface('editor') as Surface;
    }

    if (resizeCanvasToDisplaySize(canvas)) {
        surface = kit.MakeWebGLCanvasSurface('editor') as Surface;
        needRender = true;
    }

    if (needRender) {
        surface.getCanvas().clear(kit.WHITE);
        const canvas = surface.getCanvas();

        // Save current state for clipping
        canvas.save();
        
        // Apply scroll transformation
        canvas.translate(0, scrollY);
        
        // Calculate total height while rendering
        totalDocumentHeight = 0;

        // Render each paragraph
        let yOffset = 10;
        testDocument.paragraphs.forEach((paragraph) => {
            builder.reset();
            
            // Apply each formatting run within the paragraph
            let paragraphStart = 0;
            for (const run of paragraph.runs) {
                const style = {
                    ...run.style,
                    color: kit.BLACK,
                    fontFamilies: ['Roboto', 'Noto Color Emoji'],
                    decoration: kit.NoDecoration,
                    decorationThickness: 1,
                    decorationStyle: kit.DecorationStyle.Solid,
                    letterSpacing: 0.5,
                    wordSpacing: 0,
                    heightMultiplier: 1.3,
                    halfLeading: false,
                    fontSize: (run.style.fontSize || 14) * devicePixelRatio,
                    fontStyle: {
                        weight: run.style.fontStyle?.weight ?? kit.FontWeight.Normal,
                        width: kit.FontWidth.Normal,
                        slant: kit.FontSlant.Upright,
                    }
                };
                builder.pushStyle(style);
                builder.addText(paragraph.text.substring(paragraphStart, paragraphStart + run.length));
                paragraphStart += run.length;
                builder.pop();
            }

            const paragraphObj = builder.build();
            paragraphObj.layout(surface!.width() - 20);
            
            canvas.drawParagraph(paragraphObj, 10, yOffset + paragraph.yOffset);
            
            const paragraphHeight = paragraphObj.getHeight() + 10;
            yOffset += paragraphHeight;
            totalDocumentHeight += paragraphHeight;
            paragraphObj.delete();
        });

        // Draw scroll indicators if content is larger than viewport
        if (totalDocumentHeight > canvasToDisplayHeight) {
            canvas.restore(); // Restore to draw scrollbar without scroll transform
            
            // Draw scroll track and thumb
            const scrollTrack = new kit.Paint();
            scrollTrack.setColor(kit.Color(200, 200, 200, 0.5));
            canvas.drawRect(
                [surface.width() - 12, 0, surface.width(), canvasToDisplayHeight],
                scrollTrack
            );

            const viewableRatio = canvasToDisplayHeight / totalDocumentHeight;
            const thumbHeight = Math.max(30, canvasToDisplayHeight * viewableRatio);
            const scrollRatio = -scrollY / (totalDocumentHeight - canvasToDisplayHeight);
            const thumbY = scrollRatio * (canvasToDisplayHeight - thumbHeight);

            const scrollThumb = new kit.Paint();
            scrollThumb.setColor(kit.Color(150, 150, 150, 0.8));
            canvas.drawRect(
                [surface.width() - 12, thumbY, surface.width(), thumbY + thumbHeight],
                scrollThumb
            );

            scrollTrack.delete();
            scrollThumb.delete();
        }
        
        needRender = false;
    }

    surface.requestAnimationFrame(() => render(kit, builder, surface));
}

function resizeCanvasToDisplaySize(canvas: HTMLCanvasElement) {
    const needResize = canvas.width !== canvasToDisplayWidth ||
        canvas.height !== canvasToDisplayHeight;

    if (needResize) {
        canvas.width = canvasToDisplayWidth;
        canvas.height = canvasToDisplayHeight;
    }

    return needResize;
}

// Add input event listeners
if (canvas) {
    canvas.addEventListener('wheel', (e) => {
        e.preventDefault();
        const delta = e.deltaY;
        
        // Calculate the maximum scroll value
        const maxScroll = -(totalDocumentHeight - canvasToDisplayHeight);
        
        // Update scroll position with boundaries
        scrollY = Math.min(0, Math.max(maxScroll, scrollY - delta));
        
        needRender = true;
    }, { passive: false });

    const resizeObserver = new ResizeObserver(debounce(onResize, 250));
    resizeObserver.observe(canvas, { box: 'content-box' });
}

async function main() {
    preloadFonts();
    const kit = await CanvasKitInit({
        locateFile: (file) => 'https://unpkg.com/canvaskit-wasm@0.39.1/bin/' + file
    });

    const fontMgr = await loadFonts(kit);

    const paraStyle = new kit.ParagraphStyle({
        textStyle: {
            color: kit.BLACK,
            fontFamilies: ['Noto Sans', 'Roboto', 'Noto Color Emoji'],
            fontSize: 14,
        },
        textAlign: kit.TextAlign.Left,
    });

    const builder = kit.ParagraphBuilder.Make(paraStyle, fontMgr);
    render(kit, builder);

    // Make canvas focusable
    canvas?.setAttribute('tabindex', '0');
    canvas?.focus();
}

main();


