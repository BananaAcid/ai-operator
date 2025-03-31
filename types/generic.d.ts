declare global {

    type promptResult = {
        answerFull: string, // for thinking models debugging
        answer: string,
        commands: string[],
        needMoreInfo: boolean,
        isEnd: boolean,
    };
    
    type Settings = {
        driver: string;
        model: string;
        temperature: number;
        useAllSysEnv: boolean;
        endIfDone: boolean;
        saveSettings: boolean;
        defaultPrompt: string;
        fixitPrompt: string;
        systemPrompt: string;
    };

    type ModelSelection = {name: string, value: string}[];

    type ChatResponse = {
        contentRaw: string,
        history: any, // driver specific
    }

    type MessageItem = OpenAiMessageItem | GoogleAiMessageItem;
}

export {};