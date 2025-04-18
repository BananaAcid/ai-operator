declare global {

    type Prompt = string;

    type PromptAdditions = Array<{
        type: 'text' | 'image',
        content: string;
    }> | undefined;

    type PromptHelper = {
        type: 'agent';
        name: string;
        definition: string;
    };

    type PromptResult = {
        answerFull: string; // for thinking models debugging
        answer: string;
        helpers: PromptHelper[];
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

    type InquirerSelection = Array<{
        name: string;
        value: string
    }>;

    type ModelSelection = InquirerSelection;
    type AgentSelection = InquirerSelection;
    type HistorySelection = InquirerSelection;

    type ChatResponse = {
        contentRaw: string;
        history: any; // driver specific
    }

    type MessageItem = OpenAiMessageItem | GoogleAiMessageItem;

    type HistoryFile = {
        version: Settings['version'];
        historyStyle: any; //drivers[any].historyStyle (history style should match the driver's key)
        history: any[];
    }
}

export {};