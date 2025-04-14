# BAIO - A simple AI operator for the CLI, for any LLM

![428772928-5f398dfe-5e7e-4eca-b4aa-6ea003db961f](https://github.com/user-attachments/assets/105324b0-5961-4c1e-9923-00838be0eb43)

## How this works

**It is an AI copilot for any of your terminals, on MacOS, Linux, Windows for Google's AI (Gemini), OpenAI (ChatGPT), Ollama (any LLM) and OpenAI-Compatible APIs.**

It connects directly to the REST API endpoints of Ollama, OpenAI, Google's AI and does not use the AI-Tools mechanism so it will work on any AI. The only dependencies are related to the CLI interface. (And tsx for the time being to run the bin.)

### internal process
1. Telling the AI's API (using its system prompt) to create commands and it will execute them if it writes them as `<CMD>...</CMD>` in its answers

2. Get the AI's response:
    - extract the strings within the `<CMD>...</CMD>` tags
    - execute the commands locally (for simplicity, each command is spawned in a new shell context)

3. Return the execution results as text to the API
    - ... this will work with any AI, as long as it follows the rules for creating commands and processing the results

**Note:**

Yes, a more reliable way would be to use AIs that support "tooling" (which are usually big AIs)

## Install

⚠️ Make sure, you have Node JS v23.10 or newer installed.

```bash
npm -g baio
```

Simple setup: set any API key or settings in `.baioenvrc` (see below: Env Config)
```bash
baio --open env
```

**OPTIONAL:** Auto configure with GEMINI (after you entered the KEY in `--open env`), or just run `baio` and it will guide you through the options.
```
baio --reset --config --update --no-ask

√ Updating settings in .../.baiorc ...
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

**Careful:** depending on your shell, you can not use specific characters as they have a special meaning (need escaping if possible). In such cases, just run `baio` and enter your prompt.

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


## Usage Notes

**Info:**

Subsequent starts, after `Automatically use same settings next time:` **`yes`** will just prompt and show no extra info.

### You see the commands but something is wrong

Sometimes, the command output is not formatted correctly and the AI does not get the hang of it. Just exit and prompt again (this usually happens right from the beginning or not at all).

### You do not want to execute any suggested command, but a prompt

If you unselect the suggested commands (press spacebar or a) so no command is selected anymore and you press enter, you get a text prompt to be able to provide more info (if the suggestions are crap) or to change what should happen next.

Useful if the AI wants to execute the same command over and over again or just doesn't get it right. (You could tell it to look it up online or tell it what command or file to use.)

### I want to edit the settings / env

```bash
baio --help
```

will list the paths.

These can be opened with
```
baio --open env
baio --open config
baio --open agents
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

Saving settings with `Automatically use same settings next time:` **`yes`** (or `--update`)  will directly go to the prompt on next launch, and will not ask for any options.

Or use `baio --no-ask`

### ... Ask again

If you saved the settings, but you want to be able to be asked again, use:
```bash
baio --ask
```

### Wrong shell for suggested commands

You can set the environment variable `INVOKING_SHELL` to the binary or env name of the shell to be used for execution to overwrite the currently used one (or if it constantly uses the wrong one)
See below: Env Config.

### How to get internet data

#### JSON:
To get data from a **REST API** (json from an url), tell it to get a property from the API url (this should trigger a command with `curl`).

#### Website:
To get website text content in a meaningful way (and with a little amount of tokens), install Links2 and let it call the website.

- Links2, windows download: http://links.twibright.com/download/binaries/win32/ (`links -html-numbered-links 1 -dump https://...`)
  - PowerShell: add `function links2-dump($url) { . "C:\Program Files\Links\links.exe" "-html-numbered-links" 1 -dump $url }` to your `$PROFILE` file and let it be called from the operator: `links2-dump("https://...")`
  - other OSs do have them at their default package managers

Alternative tools to install:
- elinks, download: https://github.com/rkd77/elinks/releases (`elinks -dump 1 https://...`)
- lynx,  (`lynx -width=200 -dump "https://..."`)
- readability-cli, project: https://gitlab.com/gardenappl/readability-cli (`npx readability-cli -l force --properties text-content https://...`) (has problems with stylesheets and generates errors in the output)
- browsh, project: https://www.brow.sh/docs/introduction/ (connects to a running firefox instance)

### It doesn't know how to do something

To have it do, what it can't, tell it to use PowerShell or write to a PowerShell script, then let it execute the script.


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
baio [-vhdmtaqseucr] ["prompt string"]

  -v, --version
  -h, -?, --help

  -d, --driver <api-driver>    select a driver (ollama, openai, googleai)
  -m, --model <model-name>     select a model
  -t, --temp <float>           set a temperature, e.g. 0.7 (0 for model default)

  -a, --agent <agent-name>     select an agent, a set of prompts for specific tasks
  -a *, --agent *              ask for agent with a list, even if it would not

  -q, --ask                    reconfigure to ask everything again
      --no-ask                 ... to disable
  -s, --sysenv                 allow to use the complete system environment
      --no-sysenv              ... to disable
  -e, --end                    end prompting if assumed done
      --no-end                 ... to disable

  -u, --update                 update user config (save config)
  -c, --config                 config only, do not prompt.
  
  -r, --reset                  reset (remove) config
  --reset-prompts              reset prompts only (use this after an update)

  --open <config>              open the file in the default editor or the agents path (env, config, agents)


Settings config path: ................../.baiorc
Environment config path: ................../.baioenvrc
Agents config path: ................../.baio/agents/
```


## Debugging
The following environment variables can be used to output debug info. All default to false.

```env
DEBUG_OUTPUT=<boolean>
DEBUG_APICALLS=<boolean>
DEBUG_SYSTEMPROMPT=<boolean>
DEBUG_OUTPUT_EXECUTION=<boolean>
DEBUG_OUTPUT_SYSTEMPROMPT=<boolean>
```

`DEBUG_SYSTEMPROMPT` prompts you to optionally overwrite the system prompt. And it outputs it (all of it). And it would be saved if modified and `automatically use settings next time` is selected.

### prompt triggers

To trigger these, if you are not on a prompt, you need to **unselect any command and press enter** to fall back to the prompt, **then enter** one of the following:

`/exit`, `/quit`, `/q` will exit (like CTRL+D or CTRL+C).

`/debug:response` will show what the API generated and what the tool understood.

`/debug:exec` will show what the system got returned from the shell. It might help you debug strange situations.

`/debug:get <.baiorc-key>` will get the current value of the key. If you output the system prompt, be warned: it will spam the shell output.

`/debug:set <.baiorc-key> <JSON_formatted_value>` will overwrite a setting, but will not work with useAllSysEnv (is systemPrompt is already generated with this), saveSettings (saved already).

`/debug:settings` will get all the current values of settings. Be warned: it will spam the shell output.

## Development

For development (using a `.env` within the folder), within the projects folder use:

```bash
npm start
```

For testing:
```bash
node bin/baio --reset-prompts ...
```


## `drivers.ts`

This file holds Ollama, OpenAI and Googles API in simple selfcontained files.

No dependencies are used: it uses `fetch()` to connect to the REST API endpoints of the mentioned APIs.

Feel free to use these in your own projects.


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

I am mainly using `GEMINI 2.0 Flash` for prompt engineering. Feel free to send in optimized versions as issues.


| Version | Change Description |
|---------|---|
| v1.0.11 | Argument change: `-a` to `-q`, added @agents |
| v1.0.13 | Argument added: `--open`, Fix: endIfDone:false asks for next objective |
| v1.0.15 | Changed TSX to be used implicitly from the included version |
