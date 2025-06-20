export type FontDescription = {
  filePath: string;
  runtimeFileName: string;
  fontName: string;
};

export const fonts: FontDescription[] = [
  {
    filePath:
      "node_modules/@fontsource/noto-sans/files/noto-sans-all-400-normal.woff",
    runtimeFileName: "noto-sans-regular.woff",
    fontName: "Noto Sans",
  },
  {
    filePath: "",
    runtimeFileName: "Roboto-Regular.ttf",
    fontName: "Roboto",
  },
  {
    filePath: "vendors/noto-emoji/fonts/NotoColorEmoji.ttf",
    runtimeFileName: "noto-color-emoji.ttf",
    fontName: "Noto Color Emoji",
  },
];

export const fontFamilies = fonts.map((x) => x.fontName);
