declare global {

    type promptHelper = {
        type: 'agent';
        name: string;
        definition: string;
    };

    type promptResult = {
        answerFull: string; // for thinking models debugging
        answer: string;
        helpers: promptHelper[];
        commands: string[];
        needMoreInfo: boolean;
        isEnd: boolean;
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
        version: string;
    };

    type inquirerSelection = Array<{
        name: string;
        value: string
    }>;

    type ModelSelection = inquirerSelection;
    type AgentSelection = inquirerSelection;

    type ChatResponse = {
        contentRaw: string;
        history: any; // driver specific
    }

    type MessageItem = OpenAiMessageItem | GoogleAiMessageItem;
}

export {};