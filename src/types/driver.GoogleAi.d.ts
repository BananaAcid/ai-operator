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
            code: number;       // 429
            message: string;    // 'You exceeded your current quota, please check your plan and billing details. For more information on this error, head to: https://ai.google.dev/gemini-api/docs/rate-limits.'
            status: string;     // RESOURCE_EXHAUSTED
            details: Array<{
                // these 3 came together
                // '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [Array]
                // '@type': 'type.googleapis.com/google.rpc.Help', links: [Array]
                // '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '16s'
                '@type': string;
                violations?: any[];
                links?: any[];
                retryDelay?: string; // '16s'
            }>;
        };        

        candidates: {
            content: {
                parts: {text:string}[];
            };
        }[];
    }

    type GoogleAiPromptAddition = {
        type: 'text';
        content: string;
    } | {
        type: 'inline_data';
        content: {
            mime_type: string;
            data: string;
        }
    };
}

export {};