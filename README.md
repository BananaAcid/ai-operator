# BAIO - A simple NodeJS AI operator for commandline

![image](https://gist.github.com/user-attachments/assets/5f398dfe-5e7e-4eca-b4aa-6ea003db961f)

## How this works

It connects directly to the REST API endpoints of Ollama, OpenAI, GoogleAI (Gemini). The only dependencies are for the CLI interface.

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

To get website text content in a meaningfull way, get lynx and "lynx -width=200 -dump "https://geofon.gfz-potsdam.de/eqinfo/list.php" > text.txt" or to screen.

To have it do, what it can't, tell it to use powershell or write to a powerhell script, then let it execute the script.


## Install
```bash
npm -g baio
```

use
```bash
baio
```

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


### or locally within the project folder

```bash
npm start
```

## Config
```env
OLLAMA_API_KEY=
OPENAI_API_KEY=
GEMINI_API_KEY=

OLLAMA_URL=
OPENAI_URL=
```

- `OLLAMA_API_KEY` is not required for a local instance
- `OLLAMA_URL` defaults to `http://localhost:11434`
- `OPENAI_URL` defaults to the default server of OpenAI

The Only difference when using the Ollama driver vs the OpenAI driver to connect to a Ollama instance is the details in the models selection. The Ollama driver will use the OpenAI driver for all other functions.

### Selected settings
... are saved in the user's home folder in `.baiorc`

This where you are able to modify the system prompt and last selected settings.

## Helper

### Ollama / powershell pull multiple models to install them

```ps1
$commands = @()
$commands += {ollama pull deepseek-r1:8b}
$commands += {ollama pull deepseek-r1:14b}
$commands += {ollama pull phi4}
$commands += {ollama pull exaone-deep}
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