declare global {
    type PromptText = string;

    type ChatResponseSettings = { // Partial<Settings>;
        driver: string;
        model: string;
        temperature: number;
        systemPromptReady: string;
        historySaveThinking: boolean;
    }
    type ModelSelectionSettings = ChatResponseSettings; // Partial<Settings>;

    type PromptAddition = GoogleAiPromptAddition | OpenAiPromptAddition;
    type PromptAdditions = PromptAddition[] | undefined;

    type PromptAdditionError = Error;
    type ChatResponseError = Error;

    type ModelSelection = InquirerSelection;
    type AgentSelection = InquirerCheckboxSelection
    type HistorySelection = InquirerSelection;

    type ChatResponse = {
        contentRaw: string;
        history: any; // driver specific
    }

    type MessageItem = OpenAiMessageItem | GoogleAiMessageItem;

    type HistoryFile = {
        version: Settings['version'];
        historyStyle: 'openai' | 'googleai'; //drivers[any].historyStyle (history style should match the driver's key)
        history: any[];
    }
}

export {};