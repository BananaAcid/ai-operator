# BAIO - A simple AI operator for the CLI, for any LLM

![428772928-5f398dfe-5e7e-4eca-b4aa-6ea003db961f](https://github.com/user-attachments/assets/105324b0-5961-4c1e-9923-00838be0eb43)

## How this works

It connects directly to the REST API endpoints of Ollama, OpenAI, GoogleAI (Gemini) and does not use the AI-Tools mechanism so it will work on any AI. The only dependencies are for the CLI interface. (And tsx for the time being to run the bin.)

1. tell the api it is creating commands and will execute them if it writes them as `<CMD>...</CMD>` in its answers

2. get the AI text:
    - extract the strings within the `<CMD>...</CMD>` tags
    - execute the commands (for simplicity, each command is spawned in a new shell context)

3. return the results as text to the API
    - ... this will work with any AI, as long as it folows the rules for creating commands and processing the results

**Note:**

A more reliable way would be to use AIs that support "tooling" (which are usually big AIs)
- ... the tooling commands would be as seperate data from the test message in the JSON response

## Usage Notes

To get data from a REST api (an url), tell it to get a property from the api url (this should trigger a command with `curl`).

To get website text content in a meaningfull way, install Links2 and let it call the website.

- Links2, windows download: http://links.twibright.com/download/binaries/win32/ (`links -html-numbered-links 1 -dump https://...`)
  - powershell: add `function links2-dump($url) { . "C:\Program Files\Links\links.exe" "-html-numbered-links" 1 -dump $url }` to your `$PROFILE` file and let it be called from the operator: `links2-dump("https://...")`

Alternatives:
- elinks, download: https://github.com/rkd77/elinks/releases (`elinks -dump 1 https://...`)
- lynx, download? (`lynx -width=200 -dump "https://..."`)
- readability-cli, project: https://gitlab.com/gardenappl/readability-cli (`npx readability-cli -l force --properties text-content https://...`) (has problems with stylesheets and generates errors in the output)
- browsh, project: https://www.brow.sh/docs/introduction/ (connects to a running firefox instance)

To have it do, what it can't, tell it to use powershell or write to a powerhell script, then let it execute the script.

## Install
```bash
npm -g baio
```

use
```bash
# MacOS, Linux
GEMINI_API_KEY=abcdefg1234567890 baio

# powershell
$env:GEMINI_API_KEY='abcdefg1234567890' ; baio
```

or ask it directly (env must be set)
```bash
baio "list all files"
```

without installation:
```bash
npx -y baio "list all files"
```

Setting the api key before running the command, will only work until the terminal is closed again.

You should add the keys to your Profile (Win, MacOS, Linux), or in the `.bashenvrc` (see below: Env Config).

**Note:**

If you unselect the commands (press spacebar) and no command is left and you press enter, you get a text prompt to be able to write anything else.

Useful if the AI wants to execute the same command over and over again.

**Note 2:**

If you saved the settings, but you want to be able to be asked again, use:
```bash
# MacOS, Linux
ASK_SETTINGS=true baio

# powershell
$env:ASK_SETTINGS='true' ; baio
```

**Note 3:**

Saving settings will directly trigger the prompt on next launch, and will not ask for any options.

**Note 4:**

You can set `INVOKING_SHELL` to the binary or env name of the shell to be used for execution to overwrite the currently used one (or if it constantly uses the wrong one)


### or locally within the project folder

For development, within the projects folder use:

```bash
npm start
```

For testing:
```bash
node bin/baio
```

### `drivers.ts`

This file holds Ollama, OpenAI and Googles API in simple selfcontained files.

No dependencies are used: it uses `fetch()` to connect to the REST API endpoints of the mentioned APIs.


## Env Config
```env
OLLAMA_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=

OLLAMA_URL=
OPENAI_URL=
GEMINI_URL=

INVOKING_SHELL=
```

- `OLLAMA_API_KEY` defaults to '' and is not required for a local instance
- `OLLAMA_URL` defaults to `http://localhost:11434`
- `OPENAI_URL` defaults to the default server of OpenAI (but could be any OpenAI compatible server URL)
- `GEMINI_URL` defaults to the default server of google's API `https://generativelanguage.googleapis.com/v1beta` (not v1, because v1 is missing the systemprompt option)
- `INVOKING_SHELL` defaults to the currently used one (from which baio is called) or falls back to the system defined default one.

The Only difference when using the Ollama driver vs the OpenAI driver to connect to a Ollama instance is the details in the models selection. The Ollama driver will use the OpenAI driver for all other functions.

**Note:**

These env variables can be set at the user's homefolder in `.baioenvrc` and will be loaded in the beginning.

bash:
```bash
echo "GEMINI_API_KEY=abcdefg1234567" >> $HOME/.baioenvrc
```
powershell:
```powershell
echo "GEMINI_API_KEY=abcdefg1234567" >> $env:USERPROFILE\.baioenvrc
```

### Selected settings
... are saved in the user's home folder in `.baiorc`

This where you are able to modify the system prompt and last selected settings.

## Shell arguments
```
baio [-vhdmtaseucr] ["prompt string"]

  -v, --version
  -h, -?, --help
  
  -d, --driver <api-driver>        select driver (ollama, openai, googleai)
  -m, --model <model-name>         select model
  -t, --temp <int>                 temperature
  
  -a, --ask                        reconfigure to ask everything again
      --no-ask                     ... to disable
  -s, --sysenv                     allow to use the complete system environment
      --no-sysenv                  ... to disable
  -e, --end                        end promping if assumed done
      --no-end                     ... to disable
  
  -u, --update                     update user config (save config)
  -c, --config                     config only, do not prompt.
  -r, --reset                      reset (remove) config


Settings config path: ................../.baiorc
Environment config path: ................../.baioenvrc
```


## Debugging
The folowing environemnt variables can be used to output debug info. All default to false.

```env
DEBUG_OUTPUT=<boolean>
DEBUG_APICALLS=<boolean>
DEBUG_SYSTEMPROMPT=<boolean>
DEBUG_OUTPUT_SYSTEMPROMPT=<boolean>
```

`DEBUG_SYSTEMPROMPT` prompts you to optionally overwrite the system prompt. And it outputs it (all of it). And it would be saved if modified and `automatically use settings next time` is selected.

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