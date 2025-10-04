Regenerate the complete OpenAI model specification data. Use the tables from the latest version of
https://raw.githubusercontent.com/taylorwilsdon/llm-context-limits/main/README.md as the primary source for token
limits. Confirm multimodal (Image, Audio, Video) inputs for GPT-4o and GPT-5 variants via web search. Consolidate this
data into a JSON file, using the current ISO 8601 timestamp for the created key, and write the final output to
src/openai_models.json.
 
JSON Key Definitions:

 1. created: Timestamp when the data was generated (ISO 8601 format: YYYY-MM-DDTHH:mm:ssZ).
 2. core_models: Array listing primary conversational/reasoning models.
    • model: The API model identifier used by the API endpoint (e.g., gpt-5, gpt-4o-mini).
    • name: The API model display name (e.g., GPT-5, GPT-4o mini).
    • context_window_tokens: Maximum token capacity (input + output).
    • max_output_tokens: Maximum tokens the model can generate in a single response.
    • multimodal_input: Object detailing multimodal support status.
      - image: Boolean, supports image input.
      - audio: Boolean, supports audio input.
      - video: Boolean, supports video input.
    • features: Brief descriptive text about the model's purpose.
 3. specialized_models: Array listing utility models (image gen, audio processing, embeddings, open-weight).
    • model: The API model identifier used by the API endpoint.
    • name: The API model display name.
    • category: Classification (e.g., Deep Research, Audio (TTS)).
    • token_limits: Context limit if applicable, or `null`.
    • multimodal_capability: Direction of data flow (e.g., 'Text input/Image output').
    • notes: Status or specific details.

Example JSON Structure:
```json
{
  "created": "YYYY-MM-DDTHH:mm:ssZ",
  "core_models": [
    {
      "model": "GPT-5",
      "name": "gpt-5",
      "context_window_tokens": 400000,
      "max_output_tokens": 128000,
      "multimodal_input": {
        "image": true,
        "audio": true,
        "video": true
      },
      "features": "Flagship model for coding and agentic tasks."
    }
  ],
  "specialized_models": [
    {
      "model": "dall-e-3",
      "name": "DALL·E 3",
      "category": "Image Generation",
      "token_limits": null,
      "multimodal_capability": "Text input/Image output",
      "notes": "Previous generation image generation model."
    }
  ]
}
```