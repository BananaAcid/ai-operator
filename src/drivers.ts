/**
 * This file contains the drivers for the different APIs
 *
 * Each driver has some url config, and functions that fetches the models and answers from the API
 *
 * These functions are really similar, since the REST API ofthe services just differs only a bit.
 * But enough to be annoying.
 *
 * Yes Ollama could use the same OpenAPI REST call, but would lack infos that could be useful because the models run locally.
 */

const DEBUG_OUTPUT = globalThis.DEBUG_OUTPUT;
const DEBUG_APICALLS = globalThis.DEBUG_APICALLS;

//* import types
import './types/generic.d.ts';
import './types/driver.Ollama.d.ts';
import './types/driver.OpenAi.d.ts';
import './types/driver.GoogleAi.d.ts';
import './types/json.d.ts';


const drivers = {

    ollama: {
        name: 'Ollama',
        urlTest: 'http://localhost:11434/',
        urlChat: 'http://localhost:11434/v1/chat/completions', // OpenAI comaptible API
        urlModels: 'http://localhost:11434/api/tags',  // more details about the models
        defaultModel: 'goekdenizguelmez/JOSIEFIED-Qwen2.5:latest', // default model
        apiKey: () => process.env.OLLAMA_API_KEY, // ollama local does not need a key, but you could use a hosted service, that requires a key
        historyStyle: 'openai',


        getUrl(url: string): string {
            if (process.env.OLLAMA_URL)
                return url.replace('http://localhost:11434', process.env.OLLAMA_URL);
            else
                return url;
        },

        async getModels(settings: Settings): Promise<ModelSelection> {
            const response = await fetch(this.getUrl(this.urlModels), {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey()}` } : {}),
                },
            }).then(response => response.json()).catch(error => console.error(error)) as OllamaResultModels | undefined;

            const models = response?.models || [];

            DEBUG_OUTPUT && console.log('models', models);

            // more details about the models
            let modelSelection: ModelSelection = models.map(model => ({ name: `${model.details.family} : ${model.details.parameter_size} (${(model.size / (1024 * 1024 * 1024)).toFixed(2)} GB) --- ${model.name}`, value: model.name }));

            return modelSelection;
        },

        // same as openai
        makePromptAddition(type: string, mimeType: string, content: string): OpenAiPromptAddition | PromptAdditionError {
            return drivers.openai.makePromptAddition.call(this, type, mimeType, content);
        },

        // same as openai
        async getChatResponse(settings: Settings, history: any[], promptText: PromptText, promptAdditions?: PromptAdditions): Promise<ChatResponse> {
            // just reuse the openai driver in the Ollama driver's context
            return drivers.openai.getChatResponse.call(this, settings, history, promptText, promptAdditions);
        },
    },

    openai: {
        name: 'OpenAI',
        urlTest: 'https://api.openai.com/',
        urlChat: 'https://api.openai.com/v1/chat/completions',
        urlModels: 'https://api.openai.com/v1/models',
        defaultModel: 'gpt-3.5-turbo',
        apiKey: () => process.env.OPENAI_API_KEY,
        historyStyle: 'openai',


        getUrl(url: string): string {
            if (process.env.OPENAI_URL)
                return url.replace('https://api.openai.com', process.env.OPENAI_URL);
            else
                return url;
        },

        async getModels(settings: Settings): Promise<ModelSelection> {
            const response = await fetch(this.getUrl(this.urlModels), {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey()}` } : {}),
                },
            }).then(response => response.json()).catch(error => console.error(error)) as OpenAiResultModels | undefined;

            const models = response?.data || [];

            DEBUG_OUTPUT && console.log('models', models);

            let modelSelection: ModelSelection = models.map(model => ({ name: `${model.id} (${model.owned_by})`, value: model.id }));

            return modelSelection;
        },

        // https://platform.openai.com/docs/guides/images-vision?api-mode=responses#giving-a-model-images-as-input
        makePromptAddition(type: string, mimeType: string, content: string): OpenAiPromptAddition | PromptAdditionError {
            let result: OpenAiPromptAddition|PromptAdditionError;
            
            if (type === 'text')
                result = { type: 'text', content: content };
            else if (type === 'image')
                result = { type: 'input_image', content: { image_url: `data:${mimeType};base65,` + content, detail: 'auto' } };
            else
                result = new Error(`Unsupported prompt addition type: ${type}`);

            return result;
        },

        async getChatResponse(settings: Settings, history: any[], promptText: PromptText, promptAdditions?: PromptAdditions): Promise<ChatResponse> {
            let resultOrig:any;

            const response = await fetch(this.urlChat, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',

                    ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {}),
                },
                body: JSON.stringify<OpenAiRequest>({
                    model: settings.model || this.defaultModel,
                    options: {
                        ...(settings.temperature > 0 ? { temperature: settings.temperature } : {}),
                    },

                    messages: [
                        ...history,
                        { role: 'system', content: settings.systemPrompt },
                        ...(promptAdditions ?? []).map(item => ({ role: 'user', content: item.content })), // Map additional content to user role
                        { role: 'user', content: promptText ?? '' },
                    ],

                    stream: false,
                }),
            }).then(response => (resultOrig = response).json()).catch(error => console.error(error, { resultOrig })) as OpenAiChatCompletionResult;

            if (!response) process.exit(2);

            DEBUG_APICALLS && console.log('DEBUG_APICALLS', 'API response', this.urlChat, response);

            if (!response.choices?.[0]) {
                console.error('No response from AI service');
                return {
                    contentRaw: '',
                    history: history,
                }
            }

            let responseMessage = response.choices[0]!.message;

            const newHistory = [
                ...history,
                ...(promptAdditions ?? []).map(item => ({ role: 'user', content: item.content })), // Add additional content to history
                { role: 'user', content: promptText ?? '' },
                { role: responseMessage.role /* == 'asistent' */, content: responseMessage.content }
            ];

            return {
                contentRaw: responseMessage.content,
                history: newHistory,
            }
        },

    },


    googleai: {
        // public interfaces of the google ai services: https://github.com/googleapis/googleapis/tree/master/google/ai/generativelanguage

        name: 'Google AI',
        urlTest: 'https://generativelanguage.googleapis.com/v1beta/models/?key=', // unlucky: there is no test endpoint
        urlChat: 'https://generativelanguage.googleapis.com/v1beta/models/{{model}}:generateContent?key=',
        urlModels: 'https://generativelanguage.googleapis.com/v1beta/models/?key=',
        defaultModel: 'gemini-2.0-flash',
        apiKey: () => process.env.GEMINI_API_KEY,
        historyStyle: 'googleai',


        getUrl(url: string, model = ''): string {
            if (process.env.GEMINI_URL)
                url = url.replace('https://generativelanguage.googleapis.com/v1beta', process.env.GEMINI_URL);

            return url.replaceAll('{{model}}', model) + this.apiKey();
        },

        async getModels(settings: Settings): Promise<ModelSelection> {
            const response = await fetch(this.getUrl(this.urlModels), {
                method: 'GET',
            }).then(response => response.json()).catch(error => console.error(error)) as GoogleAiResultModels | undefined;

            const models = response?.models || [];

            DEBUG_OUTPUT && console.log('models', response);

            let modelSelection: ModelSelection = models.map(model => ({ name: `${model.displayName} (${model.description})`, value: model.name.replace(/^models\//, '') }));

            return modelSelection;
        },

        // https://ai.google.dev/gemini-api/docs/text-generation?hl=en#image-input
        makePromptAddition(type: string, mimeType: string, content: string): GoogleAiPromptAddition | PromptAdditionError {
            let result: GoogleAiPromptAddition|undefined;

            if (type === 'text')
                result = { type: 'text', content: content };
            else
                result = { type: 'inline_data', content: { mime_type: mimeType, data: content } };

            return result;
        },

        async getChatResponse(settings: Settings, history: any[], promptText: PromptText, promptAdditions?: PromptAdditions): Promise<ChatResponse> {
            let resultOrig:any;

            const response = await fetch(this.getUrl(this.urlChat, settings.model || this.defaultModel), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify<GoogleAiRequest>({
                    generationConfig: {
                        ...(settings.temperature > 0 ? { temperature: settings.temperature } : {}),
                    },

                    // https://ai.google.dev/gemini-api/docs/text-generation#system-instructions
                    system_instruction: {
                        parts: [{ text: settings.systemPrompt }]
                    },

                    contents: [
                        ...history,
                        {
                            role: 'user',
                            parts: [
                                ...(promptAdditions ?? []).map(item => ({ [item.type]: item.content })),
                                { text: promptText ?? '' },
                            ]
                        },
                    ],
                }),
            }).then(response => (resultOrig = response).json()).catch(error => console.error(error, { resultOrig })) as GoogleAiChatCompletionResult;

            if (!response) process.exit(2);

            DEBUG_APICALLS && console.log('DEBUG_APICALLS', 'API response', this.getUrl(this.urlChat), response);

            if (response.error) {
                console.error(response.error);
                process.exit(3);
            }

            if (!response.candidates?.[0]) {
                console.error('No response from AI service');
                return {
                    contentRaw: '',
                    history: history,
                }
            }

            let responseMessage = response.candidates[0].content.parts[0];

            const newHistory = [
                ...history,
                {
                    role: 'user',
                    parts: [
                        ...(promptAdditions ?? []).map(item => ({ [item.type]: item.content })),
                        { text: promptText ?? '' },
                    ]
                },
                response.candidates[0].content // Add the model's response part
            ];

            return {
                contentRaw: responseMessage?.text ?? '',
                history: newHistory,
            }
        },

    },

};


export default drivers as { [index: string]: typeof drivers[keyof typeof drivers] };
