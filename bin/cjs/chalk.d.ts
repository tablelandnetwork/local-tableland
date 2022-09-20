interface Chalk {
    (text: string): string;
    bold: (text: string) => string;
}
export declare const chalk: {
    [key: string]: Chalk;
};
export {};
