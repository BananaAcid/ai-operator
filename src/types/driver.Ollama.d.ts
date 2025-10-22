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
    
    
    
    type OllamaResultModelMeta ={
        /** A list of capabilities supported by the model. */
        capabilities: Array<"completion" | "vision" | string>;
        /** Detailed information about the model and quantization. */
        details: {
            /** An array of model family names (e.g., ["gemma3"]). */
            families: string[];
            /** The primary model family name (e.g., "gemma3"). */
            family: string;
            /** The file format (e.g., "gguf"). */
            format: string;
            /** The size of the parameters (e.g., "4.3B"). */
            parameter_size: string;
            /** The name of the parent model, if applicable (e.g., ""). */
            parent_model: string;
            /** The quantization level of the model (e.g., "Q4_K_M"). */
            quantization_level: string;
        };
        /** The full text of the model's license. */
        license: string;
        /** Detailed metadata parameters of the model. */
        model_info: {
            [key: string]: string | number;
        };
        /** The content of the Modelfile used to generate/run the model. */
        modelfile: string;
        /** The timestamp when the model was last modified. */
        modified_at: string; // ISO 8601 string
        /** The text representation of the model's configured parameters. */
        parameters: string;
        /** The prompt template used by the model. */
        template: string;
        /** A list of tensors contained within the model file, including their name, shape, and type. */
        tensors: {
            /** The name of the tensor (e.g., "blk.0.attn_q.weight"). */
            name: string;
            /** The shape of the tensor as an array of dimensions (e.g., [2560, 2048]). */
            shape: number[];
            /** The quantization type of the tensor. */
            type: "F16" | "F32" | "Q6_K" | "Q4_K" | string;
        }[];
    }
}

export {}