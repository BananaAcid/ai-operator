declare global {
    
    type OllamaResult = {
        model: string,
        created_at: string,
        message: {
            role: string,
            content: string
        },
        done_reason: string,
        done: boolean,
        total_duration: number,
        load_duration: number,
        prompt_eval_count: number,
        prompt_eval_duration: number,
        eval_count: number,
        eval_duration: number
    }

    type OllamaResultModels = {
        models: OllamaResultModel[],
    }

    type OllamaResultModel = {
        name: string,
        size: number,
        digest: string,
        model: string,
        modified_at: string,
        details: {
            families: string[],
            family: string,
            format: string,
            parameter_size: string,
            parent_model: string,
            quantization_level: string
        }
    }

}

export {}