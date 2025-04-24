declare module 'copy-paste' {
    export function copy(text: string, callback?: (err: Error, text: string) => void): void;
    export function paste(callback?: (err: Error, text: string) => void): string;
}

declare module 'copy-paste/promises.js' {
    export function copy(text: string): Promise<void>;
    export function paste(): Promise<string>;
}