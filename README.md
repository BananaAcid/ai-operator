# BAIO - A simple AI operator for the CLI, for any LLM

BananaAcid's Artificial Intelligence Operator - made in Germany.

![image](https://github.com/user-attachments/assets/585ffd30-1642-48c3-accd-d19eec019733)

![image](https://github.com/user-attachments/assets/67b4c1fa-e00b-4ed8-aa9e-bf0679fca094)

<details>
<summary>Screenshots of older versions</summary>
<img src="https://github.com/user-attachments/assets/105324b0-5961-4c1e-9923-00838be0eb43" />
</details>


## How this works

**It is an AI copilot for any of your terminals, on MacOS, Linux, Windows for Google's AI (Gemini), OpenAI (ChatGPT), Ollama (any LLM) and OpenAI-compatible APIs (like OpenRouter, [example list](#what-providers-can-baio-be-used-with)).**

It connects directly to the REST API endpoints of Ollama, OpenAI, Google's AI and does not use the AI-Tools mechanism so it will work on any AI. The included dependencies are related to the CLI interface only.

### internal process
1. Telling the AI's API (using its system prompt) to create commands and it will execute them if it writes them as `<CMD>...</CMD>` in its answers

2. Get the AI's response:
    - extract the strings within the `<CMD>...</CMD>` tags
    - extract content of a file to write within the `<WRITE-FILE FILEPATH="">...</WRITE-FILE>` tags
    - execute the commands locally (for simplicity, each command is spawned in a new shell context)

3. Return the execution results as text to the API
    - ... this will work with any AI, as long as it follows the rules for creating commands and processing the results

**Note:**

Yes, a more reliable way would be to use AIs that support "tooling" (which are usually means: large AIs/LLMs)

## Install

⚠️ Make sure, you have Node JS v23.10 or newer installed. ([download, check version](https://nodejs.org/en/download))

```bash
npm -g baio
```

Simple setup: set any API key or settings in `.baioenvrc` (see below: Environment Config)
```bash
baio --open env
```

**OPTIONAL:** Autoconfigure with Google's Gemini (after you entered the KEY in `baio --open env`), 
**or** just run `baio` and it will guide you through the options.
```
baio --reset --config --update --no-settings

✔ Updating settings in .../.baiorc ...
```

## Usage

If env is set, just run it:
```bash
baio
```

If it was run once and you selected `Automatically use same settings next time:` **`yes`**, you can also use:
```bash
baio "list all files"
```

**Careful:** depending on your shell, you can not use specific characters as they have a special meaning (need escaping if possible). In such cases, just run `baio` and enter your prompt in the text field.

**NOTE:** To not execute the AI provided commands, you can press <kbd>:</kbd> or <kbd>/</kbd> (or unselect any command and press enter) to fall back to a **prompt to enter more info**.

### Test usage

Test with setting an API key only for one time use:
```bash
# MacOS, Linux
GEMINI_API_KEY=abcdefg1234567890 baio

# PowerShell
$env:GEMINI_API_KEY='abcdefg1234567890' ; baio
```

without installation:
```bash
# MacOS, Linux
GEMINI_API_KEY=abcdefg1234567890 npx -y baio "list all files"

# PowerShell
$env:GEMINI_API_KEY='abcdefg1234567890' ; npx -y baio "list all files"
```

Setting the api key before running the command, will only work until the terminal is closed again.

You should add the keys to your Profile (Win, MacOS, Linux), or in the `.baioenvrc` (see below: Env Config). To open the `.baioenvrc` in an editor you can use `baio --open env`

## Info about API Keys (free)

Google AI gemini for free (and unlimited): https://aistudio.google.com/apikey (any google account needed) - this is the most powerful option.

Ollama is free anyways, just install it (https://ollama.com/download) and within this tool, just accept the default model.


## FAQ - Usage Notes

**Info:**

Subsequent starts, after `Automatically use same settings next time:` **`yes`** will just prompt and show no extra info.

### Enter multiline content

Use the prompt trigger `:w` to get a new editor window where you can enter any content.

see below: Prompt Triggers

### Save the last AI output

Use the prompt trigger `:r` to get a new editor window with last AI answer.

see below: Prompt Triggers

### You see the commands but something is wrong

Sometimes, the command output is not formatted correctly and the AI does not get the hang of it. Just exit and prompt again (this usually happens right from the beginning or not at all).

### You do not want to execute any suggested command, but a prompt

If you unselect the suggested commands (press spacebar or a) so no command is selected anymore and you press enter (or press <kbd>ESC</kbd>), you get a text prompt to be able to provide more info (if the suggestions are crap) or to change what should happen next.

Useful if the AI wants to execute the same command over and over again or just doesn't get it right. (You could tell it to look it up online or tell it what command or file to use.)

### I want to edit the settings / env

#### The current settings can be changed with

```bash
baio --settings
```

#### Editing the files (and prompts used):

```bash
baio --help
```

will list the paths.

These can be opened with
```bash
baio --open env
baio --open config
baio --open agents
baio --open history
```

### You want to do multiple tasks without losing the context

Use `--no-end` or choose `End if assumed done:` **`no`** to keep it running. It will ask what to do next if it thinks it completed a task.

### Agents

You can ask to create an `@agent`. It will ask for prompts that will make the agent and will save them in the user's home folder in `.baio/agents/`. 

Example: `create an @agent` or `create an @agent (name: ChickenTalker) where you talk like a chicken`

To be able to select an agent, while not to ask for all settings, you can use `--agent *` or `-a *`

Example: `baio -a *`

You can open the folder in your file manager to edit the files using: `baio --open agents`

### Do not ask for settings every time

Saving settings with `Automatically use same settings next time:` **`yes`**  will directly go to the prompt on next launch, and will not ask for any options.

Or use `baio --no-update`

### Edit settings

If you saved the settings, but you want to be able to be asked again, use:
```bash
baio --settings
```

### Add a file while prompting

If you want to add an image before your next prompt,
1. use the prompt trigger `/file:add <filename>`
2. prompt about this file

You can always ask Baio to read a text file, but for images you need to start with the `--file <filename>` param or during prompting the `/file:add [<filename>]` (short: `:f [<filename>]`) trigger. If you use the trigger but do not enter a filename, a file picker will show.

**Note:** More details are below in the section about Prompt Triggers

### Quota exceeded / All tokens used up for current prompt

If you reached the token limit for the current chat, you can:

1. save the current history (context) with the prompt trigger: `/history:export` (could be imported with an LLM that has a larger context)
    - use `/history:export:md` if you want a readable (Markdown) version, that can not be imported.
2. reduce the current history (context) to the last 6 (user prompt + reponse = 2): `/history:clear 6` (to be able to continue. `/:help` shows you how many entries are stored)

or 

3. clear the complete history (context): `/history:clear`
4. start over, clearing the history (context) and the current prompt: `/:clear`


**Note:** More details are below in the section about Prompt Triggers


### If you want specific commands to be automatically executed

It checks if the command in the config's list is in the beginning of the line or one of the inbuild commands (or a tool name => an MCP function).

A predefined set is in the settings "Auto execute if commands match".

#### To extend the list with more identifiers

To add more identifiers (keys), for now, you need to edit the config:

```bash
baio --open config
```

and change the key: `autoExecKeys`

see: [Manual config](#manual-config)


#### Special use

Adding an item "" will allow everything = auto accept commands.

For the inbuild commands:
- `command`
- `file.write`
- `dir.change`
- `models.getcurrent`
- `web.read` (if Links2 is missing)


### Wrong shell for suggested commands

You can set the environment variable `INVOKING_SHELL` to the binary or env name of the shell to be used for execution to overwrite the currently used one (or if it constantly uses the wrong one)
See below: Env Config.

### How to get internet data

#### JSON:
To get data from a **REST API** (json from an url), tell it to get a property from the API url (this should trigger a command with `curl`).

#### Website:
To get website text content in a meaningful way (and with a little amount of tokens), install Links2 and let it call the website.

**In case it is not installed, an internal mechanism will be used as fallback, it will not be as efficient as Links2:**
- ⚠️ producing 1/3 more tokens
- ⚠️ has problems with websites that create their content with javascript.

You can ask Baio to install it, or download it manually:
- Links2, windows download: http://links.twibright.com/download/binaries/win32/
  - (usage: `links -html-numbered-links 1 -dump https://...`)
  - **other OSs do have them at their default package managers**

### It doesn't know how to do something

To have it do, what it can't, tell it to use PowerShell or write to a PowerShell script, then let it execute the script.

### The system prompt of this version does not work for me

You can modify the system prompt yourself when opening the config (`baio --open config`). This enables you to check the previous system prompts in the git repository and copy-paste them in to to the config.

### What providers can Baio be used with?

All can be used with the OpenAI API.
But there are also specific drivers for Google and Ollama (model list is specific) for more detailed model infos and in case of google also better handling like system prompts.

Note: To get the correct URL, try finding `cURL` or `REST` or `Bash` examples for `OpenAI API` on the providers website. The correct URL should end with (but doesn't always) `/v1/chat/completions`.

- Baseten - https://www.baseten.co/
- Cloudflare Workers AI - https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/
- gpt4all - https://github.com/nomic-ai/gpt4all
- Google AI Studio - https://ai.google.dev/gemini-api/docs/openai#node.js
- Groq - https://groq.com/ - https://docs.x.ai/docs/api-reference
- Hugging Face Inference API - https://huggingface.co/docs/api-inference/tasks/chat-completion
- Jan - https://jan.ai/docs/api-server
- Lightning AI - https://lightning.ai/
- LiteLLM - https://www.litellm.ai/
- llama.cpp - https://github.com/ggml-org/llama.cpp?tab=readme-ov-file#llama-server
- llamafile - https://github.com/Mozilla-Ocho/llamafile
- LlamaIndex - https://www.llamaindex.ai/
- LM Studio - https://lmstudio.ai/
- LMDeploy - https://github.com/InternLM/lmdeploy
- LocalAI - https://localai.io/
- Mistral AI - https://mistral.ai/
- Ollama - https://github.com/ollama/ollama/blob/main/docs/openai.md
- OpenRouter - https://openrouter.ai/
- Titan ML - https://www.titanml.co/
- Vllm - https://docs.vllm.ai/en/v0.6.0/index.html
- and many more...



## Env Config
```env
OLLAMA_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=

OLLAMA_URL=
OPENAI_URL=
GEMINI_URL=

INVOKING_SHELL=
ASK_SETTINGS=
```

- `OLLAMA_API_KEY` defaults to '' and is not required for a local instance
- `OLLAMA_URL` defaults to `http://localhost:11434`
- `OPENAI_URL` defaults to the default server of OpenAI (but could be any OpenAI compatible server URL)
- `GEMINI_URL` defaults to the default server of google's API `https://generativelanguage.googleapis.com/v1beta` (not v1, because v1 is missing the systemprompt option)
- `INVOKING_SHELL` defaults to the currently used one (from which baio is called) or falls back to the system defined default one.
- `ASK_SETTINGS` defaults to the true or the selected setting (use this to always force to ask for the setting)

The Only difference when using the Ollama driver vs the OpenAI driver to connect to a Ollama instance is the details in the models selection. The Ollama driver will use the OpenAI driver for all other functions.

**Note:**

These env variables can be set at the user's home folder in `.baioenvrc` and will be loaded in the beginning. If set in `.baioenvrc`, they will overwrite any envs set in the user profile or those set before start.

To open the `.baioenvrc` in an editor you can use `baio --open env`

Or Manually:

bash:
```bash
echo "GEMINI_API_KEY=abcdefg1234567" >> $HOME/.baioenvrc
```
PowerShell:
```powershell
echo "GEMINI_API_KEY=abcdefg1234567" >> $env:USERPROFILE\.baioenvrc
```

**Note:**
You can set an env temporarily before running baio:

```bash
# MacOS, Linux
OLLAMA_API_KEY=sdfghjk45678 OLLAMA_URL=http://localhost:11434 baio

# PowerShell
$env:OLLAMA_API_KEY='sdfghjk45678' ; $env:OLLAMA_URL='http://localhost:11434' ; baio
```


### Selected settings
... are saved in the user's home folder in `.baiorc`

This where you are able to modify the system prompt and last selected settings.

## Shell arguments
```
baio [-vhdmtaseifucr] ["prompt string"]

  -v, --version
  -h, -?, --help

  -d, --driver <api-driver>      Select a driver (ollama, openai, googleai)
  -d *, --driver *               Ask for a driver with a list, even if it would not
  -m, --model <model-name>       Select a model
  -m *, --model *                Ask for a model with a list, even if it would not
  -t, --temp <float>             Set a temperature, e.g. 0.7 (0 for model default)

  -a, --agent <agent-name>, ...  Select an agent or multiple, (a set of prompts for specific tasks)
  -a *, --agent *                Ask for agent with a list, even if it would not

  -s, --sysenv                   Allow to use the complete system environment
      --no-sysenv                ... to disable
  -e, --end                      End prompting if assumed done
      --no-end                   ... to disable

  -i, --import <filename>        Import context from a history file or list files select from
  -i *, --import *               Ask for history file with a list, even if it would not

  -f, --file <filename>, ...     Add a single or multiple files to the prompt

  -u, --update                   Update user config, and automatically use the same settings next time
      --no-update                ... to disable
  -c, --config                   Do not prompt, use with other config params
  --settings                     Only shows the settings to edit

  -r, --reset                    Reset (remove) config
  --reset-prompts                Reset prompts only (use this after an update)

  --open <type>                  Open a file in the default editor or path, type: env, config, agents, history


Settings config path: ................../.baiorc
Environment config path: ................../.baioenvrc
Agents config path: ................../.baio/agents/
History config path: ................../.baio/history/
```

### Prompt Triggers

To trigger these, **_if you are not on a prompt_**,
1. you can press <kbd>:</kbd>, <kbd>/</kbd> or <kbd>ESC</kbd> to fall back to the prompt (e.g. to show the help you could type `:h`)
2. **OR**: you **unselect any command and press enter** to fall back to the prompt

**then enter** one of the following:

| Trigger | Short | Description |
|---|---|---|
| `/:help`                        | `:h`                | Shows this help. |
| `/:cmds`                        | `::`                | Return to the command selection, if possible. |
| `/:settings`                    | `:s`                | Opens settings menu to change the configuration. |
| `/:read`                        | `:r`                | Opens the default editor for a multiline input. |
| `/:write`                       | `:w`                | Opens the default editor to show the last AI response. Use to save to a file. |
| `/clip:read`                    | `:r+`, `:cr`      | Read from the clipboard and open the default editor. |
| `/clip:write`                   | `:w+`, `:cw`      | Write the the last AI response to the clipboard. |
| `/file:add [<file>]`            | `:f [<file>]`       | Adds a file to the prompt. Or shows a file selection. |
| `/history:export [<file>]`      | `:he [<file>]`      | Exports the current context to a file with date-time as name or an optional custom filename. |
| `/history:export:md [<file>]`   | `:he:md [<file>]`   | Exports the current context to a markdown file for easier reading (can not be re-imported). |
| `/history:open`                 | `:ho`               | Opens the current context in the default editor to edit. |
| `/history:open:md`              | `:ho:md`            | Opens the current context in the default editor to view it as markdown. |
| `/history:import [<file>]`      | `:hi [<file>]`      | Imports the context from a history file or shows a file selection. |
| `/history:clear [<number>]`     | `:hc [<number>]`    | Clears the current context. Optionally: positive number keeps last entries, negative cuts last entries. |
| `/:clear`                       | `:c`                | Clears the current context and current prompt (use for changing topics). |
| `/:end [<boolean>]`             |                       | Toggles end if assumed done, or turns it on (true) or off (false). |
| `/debug:result`                 |                       | Shows what the API generated and what the tool understood. |
| `/debug:exec`                   |                       | Shows what the system got returned from the shell. Helps debug strange situations. |
| `/debug:get <key>`              |                       | Gets the current value of the key (same as in baiorc). If no key is given, lists all possible keys. |
| `/debug:set <key> <value>`      |                       | Overwrites a setting. The value must be a JSON formatted value. |
| `/debug:settings [all\\|*]`     |                       | Lists all current settings without prompts. Use `all` or `*` to also show prompts. |
| `/:quit`, `/:exit`            | `:q`                | Will exit (CTRL+D or CTRL+C will also work). |


**Note:** If you want to continue, just press enter without any text, if you want to get the last command selection (if there are commands to execute) enter `::` or press <kbd>ESC</kbd>.


## Debugging
The following environment variables can be used to output debug info. All default to false.

```env
DEBUG_ERROR=<boolean>
DEBUG_OUTPUT=<boolean>
DEBUG_APICALLS=<boolean>
DEBUG_SYSTEMPROMPT=<boolean>
DEBUG_OUTPUT_MODELS=<boolean>
DEBUG_OUTPUT_MODELNAME=<boolean>
DEBUG_OUTPUT_EXECUTION=<boolean>
DEBUG_OUTPUT_SYSTEMPROMPT=<boolean>
DEBUG_APICALLS_PRETEND_ERROR=<boolean>
```

`DEBUG_ERROR` enables the details for crash related errors.

`DEBUG_SYSTEMPROMPT` prompts you to optionally overwrite the system prompt. And it outputs it (all of it). And it would be saved if modified and `automatically use settings next time` is selected.

Setting these in Powershell, here is an example: `$env:DEBUG_OUTPUT = $true ; baio ...`

They can also be set in `.baioenvrc` to active on each start of Baio.


## Manual config

### Faster startup

These options can be turned off to reduce start time:

in settings: `baio --open config`
```JSON
"precheckUpdate": true,
"precheckDriverApi": true,
"precheckLinksInstalled": true,
```

### These extra options can be tuned

in settings: `baio --open config`
```JSON
"cmdMaxLengthDisplay": 100,
"autoExecKeys": [],
"allowGeneralPrompts": false,
```

`cmdMaxLengthDisplay`: How long a command can be in the command selection. To see the fill command, you can press <kbd>e</kbd> to inspect and edit it in the command selection.

`autoExecKeys`: see above "[If you want specific commands to be automatically executed](#if-you-want-specific-commands-to-be-automatically-executed)" (Not in arguments, in settings menu only to disable and enable for now)

`allowGeneralPrompts`: Allow to answer general questions, this will also allow to loose the ultimate focus on creating commands. (Not in arguments, but in settings menu.)


## Development

For development (using a `.env` within the folder), within the projects folder use:

```bash
npm start
```

For testing:
```bash
node bin/baio --reset-prompts ...
```

### Testing the package locally (+ installation)

package in powershell, install it globally and test (get version)
```powershell
$BaioVersion = (gc .\package.json | ConvertFrom-Json).version
rm ./baio-${BaioVersion}.tgz ; npm uninstall -g baio ; npm pack ; npm install -g ./baio-${BaioVersion}.tgz
baio --version
```

test output (and inner workings)
```powershell
baio what is this folder about
```
I expect it
- to scan the folder for files
- then to read the readme
- and output a summary


### This project is developed with the following specifications in mind:
- support ollama, gemini api and openAI api
- support any OS and any SHELL inherently (do not rely on OS or shell specific stuff, or use modules that support the other OSs and shells)
- use NodeJS onboard technologies if they are available to some extend (env handling, args and others were really painful)
- use NodeJS **native `.env`** support
- use NodeJS **native type-stripping** support (TS files only use Node compatible JS)
- **no `tsconfig.json`**, rely on vscode to not need a config (I only used one to check for possible errors in v1.0.27)
- use a **single monolithic file** and try everything to keep it all readable while going for spaghetti-code (functions mainly for code grouping)
- **`tsx` to make baio work as a commandline command**, since type-stripped files are not allowed in node modules (like how baio is installed)
- no classes, try to keep the amount of functions low (but do not repeat code!), use a minimal amount of modules

**Why you ask?** Because I want to use it as testbed for code-transformations by AI. And test my argument on writing this style would require a lot of refactoring each time.

<details>
<summary>This `tsconfig.json` was used to check:</summary>

```json
{
  "compilerOptions": {
    "declaration": true,
    "declarationMap": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "inlineSources": true,
    "module": "nodenext",
    "moduleResolution": "nodenext",
    "noUncheckedIndexedAccess": true,
    "resolveJsonModule": true,
    "skipLibCheck": false,
    "sourceMap": true,
    "strict": true,
    "target": "es2024",
    "allowImportingTsExtensions": true, // required to work with NODEJS
    "noEmit": true
  }
}
```

</details>

## `drivers.ts` - AI REST APIs

This file holds Ollama, OpenAI and Google's REST API in a simple **self-contained** file.

**No dependencies** are used: it uses `fetch()` to connect to the REST API endpoints of the mentioned APIs.

Feel free to use these in your own projects.

Methods for accessing the functionality:

```typescript
getModels(settings: ModelSelectionSettings, showSimple = true): Promise<ModelSelection>
makePromptAddition(type: string, content: string, mimeType: string): GoogleAiPromptAddition|PromptAdditionError
getChatResponse(settings: ChatResponseSettings, history: any[], promptText: PromptText, promptAdditions?: PromptAdditions): Promise<ChatResponse|ChatResponseError>
```

## Helper

### Ollama: pull multiple models to install

```ps1
#!powershell

$commands = @()
$commands += {ollama pull gemma3:12b}
$commands += {ollama pull JOSIEFIED-Qwen2.5}
$commands += {ollama pull phi4}
$commands += {ollama pull deepseek-r1:8b}
$commands += {ollama pull command-r7b}

foreach($command in $commands){
    start-job $command
}

# wait for jobs, only 5 will be run in parallel, rest is waiting
While (@(Get-Job | Where { $_.State -eq "Running" }).Count -ne 0)
{  Write-Host "Waiting for background jobs..."
   Get-Job    #Just showing all the jobs
   Start-Sleep -Seconds 1
}
```

```bash
#!/bin/bash

commands=(
    "ollama pull gemma3:12b"
    "ollama pull JOSIEFIED-Qwen2.5"
    "ollama pull phi4"
    "ollama pull deepseek-r1:8b"
    "ollama pull command-r7b"
)

for cmd in "${commands[@]}"; do
    eval "$cmd" &
done

while [ $(jobs -p | wc -l) -gt 0 ]; do
    echo "Waiting for background jobs..."
    jobs
    sleep 1
done
```

## Major Changes

I am mainly using `GEMINI 2.5 Flash` for prompt engineering. Feel free to send in optimized versions as issues.

Note: The Git page for the change logs folds the commits with multiple messages.

| Version | Change Description | change logs |
|---------|---|---|
| v1.0.11 | Argument change: `-a` to `-q`, added @agents | [1.0.0...1.0.13](https://github.com/BananaAcid/ai-operator/compare/1.0.0...1.0.11) |
| v1.0.13 | Argument added: `--open`, Fix: endIfDone:false asks for next objective | [1.0.11...1.0.13](https://github.com/BananaAcid/ai-operator/compare/1.0.11...1.0.13) |
| v1.0.15 | Changed TSX to be used implicitly from the included version | [1.0.13...1.0.15](https://github.com/BananaAcid/ai-operator/compare/1.0.13...1.0.15) |
| v1.0.17 | Prompt trigger added `/history:export [<filename>]` and `/history:import [<filename>]`, Argument added: `--import` (history) | [1.0.15...1.0.17](https://github.com/BananaAcid/ai-operator/compare/1.0.15...1.0.17) |
| v1.0.19 | fixed first prompt did not accept prompt triggers, changed triggers (renamed `/:exit`, `/:quit`, `:q`), added triggers (`:h`, `:r`, `/:read`, `:w`, `/:write`, `/:end`, `/history:export:md` ), added basic support for piping in text (experimental) | [1.0.17...1.0.19](https://github.com/BananaAcid/ai-operator/compare/1.0.17...1.0.19) |
| v1.0.22 | Added copy-paste, added triggers (`:w+`, `:r+`) | [1.0.19...1.0.22](https://github.com/BananaAcid/ai-operator/compare/1.0.19...1.0.22) |
| v1.0.23 | Fixed trigger (`:r`, `:r+`), added update check, added options for faster startup, added keys to fall back to the prompt (<kbd>:</kbd> or <kbd>/</kbd> or <kbd>ESC</kbd>) | [1.0.22...1.0.23](https://github.com/BananaAcid/ai-operator/compare/1.0.22...1.0.23) |
| v1.0.24 | Added showing/editing (by pressing <kbd>w</kbd> or <kbd>right</kbd>) highlighted command (in selection) in the default editor | [1.0.23...1.0.24](https://github.com/BananaAcid/ai-operator/compare/1.0.23...1.0.24) |
| v1.0.25 | Added prompt trigger (`/history:clear`, `/:clear`), corrected help to show correct `/debug:result` trigger, better display of multiline commands and with backticks, command selection items are cropped, added `settings.cmdMaxLengthDisplay` | [1.0.24...1.0.25](https://github.com/BananaAcid/ai-operator/compare/1.0.24...1.0.25) |
| v1.0.27 | Argument added: `--file <image/text/...>` and support for adding files (text and image, ...), added fixes for possible bugs, added `precheckLinksInstalled`, fixed multiline commands in selection and progress to be single line and shortened | [1.0.25...1.0.27](https://github.com/BananaAcid/ai-operator/compare/1.0.25...1.0.27) |
| v1.0.28 | Allow `--driver *` and `--model *` only get a selection for these, api errors are recoverable and can be retried (mind QUOTA errors), reduced duplicate output (showing the command and the command itself) | [1.0.27...1.0.28](https://github.com/BananaAcid/ai-operator/compare/1.0.27...1.0.28) |
| v1.0.29 | Removed thinking blocks from history to **massively reduce token consumption** (`settings.historySaveThinking = false`), allow multiple agents by `--agent agent1 --agent agent2`, changed trigger `/debug:get` to output possible keys if no key was given, changed trigger `/debug:settings` to not show prompts by default, but `/debug:settings all` will, allowed prompt trigger `/history:clear <number>` to clear up to the provided amount in case of quota / token max, added prompt trigger `/file:add` to add a file or show a file picker | [1.0.28...1.0.29](https://github.com/BananaAcid/ai-operator/compare/1.0.28...1.0.29) |
| v1.0.30 | **Settings in a menu**, added prompt trigger `/:settings` to open settings any time and argument `--settings`, allowed `{{ENVNAME}}` in custom system prompts, deprecated `--ask`, fixed argument `--files` to `--file` (to match the help), added `settings.autoExecKeys` to allow baio auto execute commands that begin with one of the defined keywords | [1.0.29...1.0.30](https://github.com/BananaAcid/ai-operator/compare/1.0.29...1.0.30) |
| v1.0.31 | Added saving when opening menu by trigger, enabled agent selection when opening menu by trigger (not just start), menu related cleanup and fixes, fixed send files list was never cleared and always send again | [1.0.30...1.0.31](https://github.com/BananaAcid/ai-operator/compare/1.0.30...1.0.31) |
| v1.0.32 | Added **addFile** to menu on start, fix commandline `*` options to work with new settings | [1.0.31...1.0.32](https://github.com/BananaAcid/ai-operator/compare/1.0.31...1.0.32) |
| v1.0.33 | **Added direct writing of files**, this will massivly reduce tokens used due to not including the file content twice (not in the response from the system anymore needed, unless the content was edited in the selection), added a workaround for a Node23 bug | [1.0.32...1.0.33](https://github.com/BananaAcid/ai-operator/compare/1.0.32...1.0.33) |
| v1.0.34 | **Usability, Navigation, Bugfix** <br> Added trigger `::` to return to command selection, added **switching back and forth between commands/input** with pressing <kbd>ESC</kbd>, added trigger `/history:open` to edit the current context in an editor, added trigger `/history:open:md` to view the context, added `:` or `/` to input when closing commands selection with it, added switching model list to raw JSON when pressing <kbd>space</kbd> to view all detail, added **change current working directory command** (`go user folder` and alike), added the posibility to **talk with Baio about the currently available models** of the currently used provider, added a setting to **enable general prompts** (but might not always create commands), added descriptions to all settings in the settings menu | [1.0.33...1.0.34](https://github.com/BananaAcid/ai-operator/compare/1.0.33...1.0.34) |
| v1.0.35 | **Navigation** <br> Added pressing <kbd>.</kbd> to close commands selection and switch to prompt | [1.0.34...1.0.35](https://github.com/BananaAcid/ai-operator/compare/1.0.34...1.0.35) |
| v1.0.36 | **Usability** <br> Added <kbd>esc</kbd> to abort command execution and AI response and return to "enter more info", added setting menu to size to terminal height | [1.0.35...1.0.36](https://github.com/BananaAcid/ai-operator/compare/1.0.35...1.0.36) |
| v1.0.37 | **Usability** <br> Added using terminal height for model selection (Goole has 47 Models, my Ollama around 30) | [1.0.36...1.0.37](https://github.com/BananaAcid/ai-operator/compare/1.0.36...1.0.37) |
| v1.0.38 | **Bugfix** <br> Fixed `--open ...` to work also when there is no editor already open | [1.0.37...1.0.38](https://github.com/BananaAcid/ai-operator/compare/1.0.37...1.0.38) |
| v1.0.39 | **Usability** <br> Added integrated mechanism to read urls in case Links2 is not installed | [1.0.38...1.0.39](https://github.com/BananaAcid/ai-operator/compare/1.0.38...1.0.39) |
| v1.0.40 | **Bugfix** <br> Fixed selecting agents did not work, changed only really edited commands getting marked, added <kbd>esc</kbd> to abort file browsing, did some output cleanup | [1.0.39...1.0.40](https://github.com/BananaAcid/ai-operator/compare/1.0.39...1.0.40) |
| v1.0.41 | **Navigation, Usability, Bugfix** <br> Added <kbd>s</kbd> to be able to search in AI drivers and AI model list, added <kbd>esc</kbd> to cancel driver and model selection, added option to selectively disable prompt commands (internal MCP functions), added matching more reasoning blocks, fixed get-models to now get all available models, code cleanup | [1.0.40...1.0.41](https://github.com/BananaAcid/ai-operator/compare/1.0.40...1.0.41) |
| v1.0.42 | **Usability** <br> Increased start up speed, increased runtime speed, removed all execSync code, removed tsx as dependency, changed systemprompt size by removing a lot of spaces, code cleanup | [1.0.41...1.0.42](https://github.com/BananaAcid/ai-operator/compare/1.0.41...1.0.42) |