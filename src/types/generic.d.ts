declare global {

    type PromptAdditionsTypes = 'audio' | 'image' | 'video' | 'text';

    type Prompt = {
        text: PromptText;
        additions?: PromptAdditions;
    };

    type PromptFile = {
        path: string;
        mimeType: string;
        content: string;
    }

    type PromptCommand = {
        type: 'command';
        userModified?: boolean;
        line: string;
    } | {
        type: 'file.write';
        userModified?: boolean; // is a "tainted" flag: if user modifies the content after ai response and before saving
        file: PromptFile;
    } | {
        type: 'dir.change';
        userModified?: boolean; // is a "tainted" flag: if user modifies the content after ai response and before saving
        dir: string;
    } | {
        type: 'models.getcurrent';
        userModified?: boolean;
        filter: string;
    } | {
        type: 'web.read';
        userModified?: boolean;
        url: string;
    } | {
        type: 'baio.help';
        userModified?: boolean;
    } | {
        type: 'context.compact';
        userModified?: boolean;
    }
    /* | {
        type: 'agent';
        userModified?: boolean;
        agent: {
            name: string;
            definition: string;
        };
    }*/;

    // utility type to extract a union member based on a property value
    type PromptCommandByType<K extends PromptCommand['type']> = Extract<PromptCommand, { type: K }>;

    // the interface for the internal "MCP"-like commands
    type PromptCommandObject<T extends PromptCommand> = {
        description: string;                                // internal short description
        syntax: string;                                     // internal example of the commmand usage
        prompt: string | undefined;                         // the prompt to integrate into the systemPrompt which is send to the AI to make it use the command, undefined means no prompt == internal command
        caption: (command: T) => string;                    // what caption to use for the command, when asking to user to execute
        contentIsEditable: boolean;                         // allow editing the content or params of the command, when asking to user to execute
        content: (command: T, content?: string) => string;  // what content to use for editing the command
        regex: RegExp;                                      // what to test the AI result for to find the command
        handleMd: (groups: RegExpGroups) => Promise<{command: T, replacementString: string}>;   // what to replace the syntax with in the AI result before showing to the user
        exec: (command: T, signal?: AbortSignal) => Promise<{result: string, updateSystemPrompt: boolean, needMoreInfo: boolean}>;  // how to execute the command
    }

    // the internal "MCP"-like commands object
    // only types defined in PromptCommand are allowed as keys!
    type PromptCommandObjects = {
        [K in PromptCommand['type']] : PromptCommandObject<PromptCommandByType<K>>;
    };

    type DoCommandsResult = {
        answer: string, 
        needMoreInfo: boolean
    };


    type PromptResult = {
        answerFull: string; // for thinking models debugging
        answer: string;
        commands: PromptCommand[];
        needMoreInfo: boolean;
        isEnd: boolean;
        totalTokenUsage: number | null;
    };
    
    type ArgsKeys = {
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
        settings: boolean;
    }

    type Settings = SettingsBlacklisted & SettingsChached & {
        driver: string;
        model: string;
        temperature: number;
        useAllSysEnv: boolean;
        endIfDone: boolean;
        saveSettings: boolean;
        autoExecKeys: string[];
        promptCommandsDisabled: string[];

        precheckUpdate: boolean;
        precheckDriverApi: boolean;
        precheckLinksInstalled: boolean;
        cmdMaxLengthDisplay: number;
        historySaveThinking: boolean;

        allowGeneralPrompts: boolean;

        defaultPrompt: string;
        fixitPrompt: string;
        agentPrompt: string;
        fileAddPrompt: string;
        compactPrompt: string;
        generalPrompt: string;
        systemPrompt: string;
    };
    
    type SettingsChached = {
        version: string;   // for config file compatibility
        modelData: {
            modelName: string; // for showing in the settings and help only - no functional use
            modelMeta: ModelMeta;
            systemInstructionsAsPrompt?: boolean,
            hasThinking?: boolean,
        };
    }
    
    // blacklisted - temporary runtime values - do not save
    // .. also update index.ts -> SETTINGS_BLACKLIST
    type SettingsBlacklisted = {
        addedFiles: Array<{file: string, type: string, mime: string}>; // keep track of added files (paths)
        agentFiles: string[];
        agentNames: ArgsKeys['agent'];
        systemPromptReady: Settings['systemPrompt'];
    }

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


    type RegExpGroups = Exclude<RegExpExecArray['groups'], undefined>;
}


export {};