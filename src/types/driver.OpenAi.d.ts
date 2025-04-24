declare global {

  type OpenAiChatCompletionResult = {
    id: string;
    object: "chat.completion";
    created: number;
    model: string;
    choices: {
      index: number;
      message: {
        role: "assistant" | string;
        content: string;
        refusal: null;
        annotations: [];
      };
      logprobs: null;
      finish_reason: "stop" | string;
    }[];
    usage: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
      prompt_tokens_details: {
        cached_tokens: number;
        audio_tokens: number;
      };
      completion_tokens_details: {
        reasoning_tokens: number;
        audio_tokens: number;
        accepted_prediction_tokens: number;
        rejected_prediction_tokens: number;
      };
    };
    service_tier: string;
  };


  type OpenAiResultModels = {
    object: "list";
    data: OpenAiResultModel[];
  }

  type OpenAiResultModel = {
    id: string;
    object: "model";
    created: number;
    //** @property organization-owner, "openai", "library" for Ollama
    owned_by: "openai" | "library" | string;
  }


  type OpenAiRequest = {
    model: string;
    options: {
        temperature?: number;
    };
    messages: OpenAiMessageItem[];
    stream: boolean;
  };

  type OpenAiMessageItem = {
      role: string;
      content: string;
  };

}


export {}