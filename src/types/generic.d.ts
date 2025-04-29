declare global {

    type PromptAdditionsTypes = 'audio' | 'image' | 'video' | 'text';

    type Prompt = {
        text: PromptText;
        additions?: PromptAdditions;
    };

    type PromptFile = {
        name: string;
        mimeType: string;
        content: string;
    }

    type PromptHelper = {
        type: 'agent';
        name: string;
        definition: string;
    } | {
        type: 'file.write';
        file: PromptFile;
    } | {
        type: 'files.write';
        files: PromptFile[];
    };

    type PromptResult = {
        answerFull: string; // for thinking models debugging
        answer: string;
        helpers: PromptHelper[];
        commands: string[];
        needMoreInfo: boolean;
        isEnd: boolean;
    };
    
    type ArgsKeys = {
        [index: string]: string|boolean|number|string[];
        version: boolean;
        help: boolean;
        driver: string;
        model: string;
        agent: string[];
        ask: boolean;
        import: string;
        config: boolean;
        reset: boolean;
        'reset-prompts': boolean;
        open: string;
        useAllSysEnv: boolean;
        endIfDone: boolean;
        saveSettings: boolean;
        temperature: number;
        file: string[];
    }

    type Settings = {
        [index: string]: string|boolean|number|string[];
        driver: string;
        model: string;
        modelName: string; // for showing in the settings
        temperature: number;
        useAllSysEnv: boolean;
        endIfDone: boolean;
        saveSettings: boolean;
        defaultPrompt: string;
        fixitPrompt: string;
        agentPrompt: string;
        fileAddPrompt: string;
        systemPrompt: string;
        version: string;

        precheckUpdate: boolean;
        precheckDriverApi: boolean;
        precheckLinksInstalled: boolean;
        cmdMaxLengthDisplay: number;
        historySaveThinking: boolean;

        autoExecKeys: string[];

        // -- do not save
        agentFiles: string[];
        agentNames: ArgsKeys['agent'];
    };

    type InquirerSelection = Array<{
        name: string;
        value: string;
    }>;

    type InquirerCheckboxSelection = Array<{
        name: string;
        value: string;
        checked: boolean; // actually optional
    }>;
}


export {};