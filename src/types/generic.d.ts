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
        systemPromptReady: Settings['systemPrompt'];
    };

    // https://github.com/SBoudrias/Inquirer.js/tree/main/packages/select#choice-object
    // src: https://github.com/SBoudrias/Inquirer.js/blob/main/packages/select/src/index.ts#L46-L53
    type InquirerSelection = Array<{
        name: string;
        value: string;
        disabled?: boolean | string; // string would be disbaled and the help string
        description?: string; // under the list when the cursor highlight a given choice
    }>;

    // https://github.com/SBoudrias/Inquirer.js/blob/main/packages/checkbox/README.md#choice-object
    // src: https://github.com/SBoudrias/Inquirer.js/blob/main/packages/checkbox/src/index.ts#L62-L70
    type InquirerCheckboxSelection = Array<{
        name: string;
        value: string;
        checked: boolean; // actually optional
        disabled?: boolean | string; // string would be disbaled and the help string
        description?: string; // under the list when the cursor highlight a given choice
    }>;
}


export {};