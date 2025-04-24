declare global {

    type GoogleAiResultModels = {
        models: GoogleAiResultModel[];
    }
      
    type GoogleAiResultModel = {
        name: string;
        version: string;
        displayName: string;
        description: string;
        inputTokenLimit: number;
        outputTokenLimit: number;
        supportedGenerationMethods: GoogleAiResultGenerationMethod[];
        temperature?: number;
        topP?: number;
        topK?: number;
        maxTemperature?: number;
    }
      
    enum GoogleAiResultGenerationMethod {
        Array = 'Array',
    }

    type GoogleAiRequest = {
        generationConfig: {
            temperature?: number;
        };
        system_instruction: GoogleAiSystemMessageItem;
        contents: GoogleAiMessageItem[];
    }

    type GoogleAiSystemMessageItem = {
        parts: {text:string}[];
    };

    type GoogleAiMessageItem = {
        role: string;
        parts: {text:string}[];
    };

    type GoogleAiChatCompletionResult = {
        error?: {
            code: number;
            message: string;
            status: string;
        };        

        candidates: {
            content: {
                parts: {text:string}[];
            };
        }[];
    }
}

export {};