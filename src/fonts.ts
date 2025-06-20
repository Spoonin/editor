import { CanvasKit, FontMgr } from "canvaskit-wasm";

export async function preloadFonts() {
    const fonts = [
        '/noto-sans-regular.woff',
        '/Roboto-Regular.ttf',
        '/noto-color-emoji.ttf'
    ];

    await Promise.all(fonts.map(async (font) => {
        const response = await fetch(font);
        await response.arrayBuffer();
    }));
}

export async function loadFonts(kit: CanvasKit): Promise<FontMgr> {
    const fonts = await Promise.all([
        fetch('/noto-sans-regular.woff').then(response => response.arrayBuffer()),
        fetch('/Roboto-Regular.ttf').then(response => response.arrayBuffer()),
        fetch('/noto-color-emoji.ttf').then(response => response.arrayBuffer())
    ]);

    const fontMgr = kit.FontMgr.FromData(...fonts) as FontMgr;
    if (!fontMgr) {
        throw new Error('Could not load fonts');
    }

    return fontMgr;
}
