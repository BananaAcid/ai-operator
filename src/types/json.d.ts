/*
// https://jakeginnivan.medium.com/typing-json-stringify-parse-in-typescript-5ae3b376bbbd
declare class Stringified<T> extends String {
    private ___stringified: T
}

interface JSON {
    stringify<T>(
        value: T,
        replacer?: (key: string, value: any) => any,
        space?: string | number
    ): string & Stringified<T>
    parse<T>(text: Stringified<T>, reviver?: (key: any, value: any) => any): T
    parse(text: string, reviver?: (key: any, value: any) => any): any
}
*/


// https://github.com/microsoft/TypeScript/issues/19244#issuecomment-337552457
declare global {
    type Stringified<T> = string & {
        [P in keyof T]: { "_ value": T[P] }
    };
    interface JSON {
        // stringify(value: any, replacer?: (key: string, value: any) => any, space?: string | number): string;
        stringify<T>(value: T, replacer?: (key: string, value: any) => any, space?: string | number): string & Stringified<T>;
        // parse(text: string, reviver?: (key: any, value: any) => any): any;
        parse<T>(text: Stringified<T>, reviver?: (key: any, value: any) => any): T;
    }
}

export {}