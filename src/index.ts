/**
 * BAIO - A simple AI operator for the CLI, for any LLM
 * 
 * @author Nabil Redmann <repo@bananaacid.de>
 * @license MIT
 */


//* node imports
import packageJSON from '../package.json' with { type: 'json' };
import path from 'node:path';
import { writeFile, readFile, unlink, glob, mkdir, open as fsOpen, rm } from 'node:fs/promises';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import fs from 'node:fs';
import util from 'node:util';
import { setTimeout } from 'node:timers/promises';

import child_process from 'node:child_process';
import { promisify } from 'node:util';
const execAsync = promisify(child_process.exec); // yes, it is async, but common error-first callback style and a promise

import cliMd from 'cli-markdown';
import launchEditorX from 'launch-editor';
import open from 'open';
import clipboard from 'copy-paste/promises.js';
import mime from 'mime';
import { NodeHtmlMarkdown } from 'node-html-markdown';

import colors from 'yoctocolors-cjs'; // installed by @inquirer/prompts
import figures from '@inquirer/figures'; // installed by @inquirer/prompts
import { input, select, Separator, editor, checkbox } from '@inquirer/prompts';
import { isSpaceKey } from '@inquirer/core';
import checkboxWithActions from './libs/@inquirer-contrib/checkbox-with-actions.ts';
import inputWithActions from './libs/@inquirer-contrib/input-with-actions.ts';
import selectWithActions from './libs/@inquirer-contrib/select-with-actions.ts';
//! import {spinner as spinnerX, type ResultStatus as SpinnerXResultStatus} from './libs/@inquirer-contrib/spinner-with-actions.ts';
import { default as tgl } from 'inquirer-toggle';
//@ts-ignore
const toggle = tgl.default;
import fileSelector from 'inquirer-file-selector';

import isUnicodeSupported from 'is-unicode-supported';  // as long as yoctoSpinner has a hardcoded check
import cliSpinners from 'cli-spinners'; // imported by @inquirer/core
import yoctoSpinner from 'yocto-spinner';
const spinner = yoctoSpinner({text: '', ...(isUnicodeSupported() ? {spinner: cliSpinners.dots} : {})}); // do not care about non-unicode terminals, always force dots


//* (try to) handle errors
//* catch ctrl+c and show no error on exit, fix it for the toggle prompt
process.on('uncaughtException', (error) => { if (error instanceof Error && (error.name === 'ExitPromptError' || error.message.indexOf('User force closed the prompt') >= 0)) { process.exit(0); } else { console.error(colors.red(figures.cross), error.name + ':', error.message); /* Rethrow unknown errors */ if (!!process.env.DEBUG_ERROR) throw error; } });
//? process.on('warning', (warning) => { if (warning.message.indexOf('unsettled top-level await') == -1) console.warn(warning.name, warning.message); });
//? process.removeAllListeners('warning');


//* File + Paths
const RC_ENVFILE = path.join(os.homedir(), '.baioenvrc');
const RC_FILE = path.join(os.homedir(), '.baiorc');
const RC_PATH = path.join(os.homedir(), '.baio');
const RC_AGENTS_PATH = path.join(RC_PATH, 'agents');
const RC_HISTORY_PATH = path.join(RC_PATH, 'history');
const PROCESS_PATH_INITIAL = process.cwd();


//* get user dot env
// node:parseEnv sucks really badly.
(await readFile(RC_ENVFILE, 'utf-8').catch(_ => ''))
.split('\n').map(line => line.trim()).filter(line => line.length > 0 && !line.startsWith('#'))
.map(line => line.split(/=(.*)/).map(part => part.trim()) )
.filter(([key,val]) => key && val)
.forEach(([key,val]) => process.env[key!.toUpperCase().replaceAll(' ', '_')] = val);


//* set DEBUG consts
const DEBUG_ERROR = !!process.env.DEBUG_ERROR;
const DEBUG_OUTPUT = !!process.env.DEBUG_OUTPUT;
const DEBUG_APICALLS = !!process.env.DEBUG_APICALLS;
const DEBUG_SYSTEMPROMPT = !!process.env.DEBUG_SYSTEMPROMPT;
const DEBUG_OUTPUT_MODELS = !!process.env.DEBUG_OUTPUT_MODELS;
const DEBUG_OUTPUT_MODELNAME = !!process.env.DEBUG_OUTPUT_MODELNAME;
const DEBUG_OUTPUT_EXECUTION = !!process.env.DEBUG_OUTPUT_EXECUTION;
const DEBUG_OUTPUT_SYSTEMPROMPT = !!process.env.DEBUG_OUTPUT_SYSTEMPROMPT;
const DEBUG_APICALLS_PRETEND_ERROR = !!process.env.DEBUG_APICALLS_PRETEND_ERROR;


//* project imports
import drivers from './drivers.ts';  // ext .ts is required by NodeJS (with TS support)


//* import types
import './types/cli-markdown.d.ts';
import './types/copy-paste.d.ts';
import './types/generic.d.ts';
import './types/drivers.d.ts';
import './types/driver.Ollama.d.ts';
import './types/driver.OpenAi.d.ts';
import './types/driver.GoogleAi.d.ts';
import './types/json.d.ts';
type Driver = typeof drivers[keyof typeof drivers];


//* type helpers
function isSettingsKey(key: string|undefined): key is keyof Settings { return (key !== undefined && key in settings); }


//* extend basic types
declare global { interface String { trimBlock(left?: number): string; } }
String.prototype.trimBlock = function (left = 0): string {
    return this.split('\n').map(line => ' '.repeat(left) + line.trim()).join('\n');
};

//* defs
const AUTOEXEC_KEYS = ['links', 'curl', 'wget', 'Invoke-WebRequest', 'iwr', 'web.read']; // dir, ls, gci, Get-ChildItem ?
const SETTINGS_BLACKLIST: Array<keyof SettingsBlacklisted> = ['addedFiles', 'agentFiles', 'agentNames', 'systemPromptReady']; // keys not to save


//* TTY input overwrite
let TTY_INTERFACE:any = {};


//* get args (partly settings)
const args = await new Promise<ReturnType<typeof parseArgs>>(resolve => resolve(parseArgs({
    allowPositionals: true,
    options: {
        version: { short: 'v', type: 'boolean' },
        help:    { short: 'h', type: 'boolean' },
        help2:   { short: '?', type: 'boolean' },
        
        driver:  { short: 'd', type: 'string'  },
        model:   { short: 'm', type: 'string'  },
        temp:    { short: 't', type: 'string'  },

        agent:   { short: 'a', type: 'string',  multiple: true },

        ask:     { short: 'q', type: 'boolean' },  //! TODO --- deprecated
        sysenv:  { short: 's', type: 'boolean' },
        end:     { short: 'e', type: 'boolean' },

        import:  { short: 'i', type: 'string'  }, // history import

        config:  { short: 'c', type: 'boolean' },
        update:  { short: 'u', type: 'boolean' },
        'settings':      {     type: 'boolean' },

        reset:   { short: 'r', type: 'boolean' },
        'reset-prompts': {     type: 'boolean' },

        open:    {             type: 'string'  },
        file:    { short: 'f', type: 'string', multiple: true },
    }, 
    //tokens: true,
    allowNegative: true,
    args: process.argv.slice(2)
}))).catch(error => { console.error(colors.red(figures.cross), error.message); process.exit(1); });
const argsReMap: Record<string, string> = {
    sysenv: 'useAllSysEnv',
    end: 'endIfDone',
    update: 'saveSettings',
    temp: 'temperature',
    help2: 'help',
};
//! .values always includes all options with their default values, only .tokens does not but is missing the values.
//!   And options does not allow for a key name (only long and short arg name)
//! ---->   default values make them always be set and always be true and can not be changed. Writing the param with --no-acbd does set them to false but changes their names
//!  ... and no support for numbers
//let settingsArgs;
//? 1. get all token .name from .tokens[] with reduce (not all do have a name), 2. then get matching value from .values{} 
//~ settingsArgs = args.tokens!.filter(token => token.kind === 'option').reduce((acc, token) => ({ ...acc, [token.name]: args.values[token.name] }), {});
//? 3. remap ( keys of args.options and argsReMap-values but without argsReMap-keys (which are remapped) )
let settingsArgs:Partial<ArgsKeys> = Object.entries(args.values).reduce((acc, [k, v]) => ({ ...acc, [argsReMap[k] || k]: v }), {});
//* get the prompt, the non-options
const argsPrompt = args.positionals.join(' ').trim();

// console.log( args, settingsArgs); process.exit(9999);


//* load saved settings
let settingsSaved: Partial<Settings>|undefined;
if (settingsArgs.reset)
    await unlink(RC_FILE).catch(_ => undefined);
else
    settingsSaved = await readFile(RC_FILE, 'utf-8').then(c => c ? JSON.parse(c): undefined).catch(_ => undefined) as Settings;


//* default settings
let settingsDefault: Settings = {
    driver: 'googleai',
    model: '',              // BEST: gemma3:12b (12.2B)  FASTEST: goekdenizguelmez/JOSIEFIED-Qwen2.5:latest (7.6B)   IS OK: phi4:latest (14.7B)
    temperature: 0,         // use something like 0.7

    useAllSysEnv: false,    // use all system environment variables in the system prompt
    endIfDone: true,        // don't allow the AI to end the conversation (it would, if it thinks it is done)

    saveSettings: false,    // (--update) save settings to the .baiorc file -- if this is true, the settings will not be asked

    autoExecKeys: AUTOEXEC_KEYS, // allow execution if command is in here

    /** Optimizations **/
    precheckUpdate: true,       // (speedup if false) try to reach the npm registry to check for an update
    precheckDriverApi: true,    // (speedup if false) try to reach the driver api to check if it is available
    precheckLinksInstalled: true,   // (speedup if false) try to check if links is installed and if it is available
    cmdMaxLengthDisplay: 100,   // set the maximum length of a command to display
    historySaveThinking: false, // save the thinking block to the history

    allowGeneralPrompts: false, // Allow to answer general questions, this will also allow to loose the ultimate focus on creating commands

    /** Prompts **/
    defaultPrompt: 'show me a table of all files in the current directory',

    agentPrompt: '**Very important master rules, that must be followed and can overrule the rules from before:**',

    fileAddPrompt: 'The next file is from the local filesystem: {{filepath}}\nAnd its content:',

    fixitPrompt: `
        Something went wrong! Analyze the previous output carefully.

        It seems like the GOAL was to output a command. Check if a command was ATTEMPTED, even if it's not correctly formatted.

        If a command was attempted, DOUBLE-CHECK the output for the \`<CMD>command_here</CMD>\` formatting:
            *   Are the <CMD> and </CMD> tags present and correctly spelled?
            *   Is there any extra text or whitespace inside the tags that should be removed?
            *   Do not use fenced code blocks (\`\`\`) for executable commands.
            *   Is the cammand promperly escaped so that it can be executed?
            If the formatting is incorrect, REWRITE the output with the CORRECT \`<CMD>command_here</CMD>\` formatting. Only output the corrected answer and do not add any additional descriptions.

        If not:
        Ensure all steps are followed, results are validated, and commands are properly executed.
        Reevaluate the goal after each action and make sure to append <END/> only when the task is fully completed.
        Try again with a different approach, and if more information is needed, request it.
    `,

    generalPrompt: `
        You are also proficient in coding for the commandline and software in general.
        If you are asked for non commandline or coding tasks, you act as a general assistant.
    `,

    systemPrompt: `
        Your name is Baio.
        You are a helpful AI operator that generates and validates command-line commands. 
        You create commandline commands for your system and validate the result. The commands will automatically be executed on the host system with the next prompt by your doing.
        You want to solve the users prompt with concise and meaningful commandline commands and avoid guessing or duplicates and supply executable commands that will be executed.
        {{generalPrompt}}

        ### Your System Information:
        - User: {{process_env_USERNAME}}
        - OS: {{process_env_OS}}
            - Plattform: {{process_platform}}
            - Architecture: {{process_arch}}
        - Computer Name: {{process_env_COMPUTERNAME}}
        - **Default Shell (used for execution)**: {{invokingShell}}
        - **Fallback Shell (only used for execution if default is unknown):** {{process_env_SHELL}}
        - Installed PowerShell: {{process_env_POSH_SHELL}}, version {{process_env_POSH_SHELL_VERSION}}
        - User's Home Directory (user home folder): {{process_env_HOME}}
        - Current Working Directory (cwd, here you are always): {{process_cwd}}
        - Currently active AI Provider ("driver"): {{currentDriver}}
        - Currently active AI Model: {{currentModel}}
        {{linksIsInstalled}}
        {{useAllSysEnv}}

        ### Initial Prompt:
        - First check what OS and Shell for execution you have available, check in "Your System Information" for Default Shell and Fallback Shell.
        - Do **not** use <END/> in the initial prompt.

        ### Output Rules:
        - Explain **briefly** what you are doing and what each command does.
        - Never explain, what Tags you are using to execute commands.
        {{promptCommands}}
        - **DO NOT** use fenced code blocks (\`\`\`) for executable commands. Instead, always use:  
            \`<CMD>command_here</CMD>\`
        - **If multiple commands need to be executed in sequence, combine them into one <CMD>** to maintain the shell context.  
        - Example (incorrect):  
            \`<CMD>cd /myfolder</CMD>\`
            \`<CMD>touch file.txt</CMD>\`
        - Example (correct):  
            \`<CMD>cd myfolder && touch file.txt</CMD>\`
        - Example (correct):
            \`<CMD>cd myfolder
            touch file.txt</CMD>\`
        - The commands must work in the current shell for execution, commands of another shell do not work. But you can call another shell, that is available, to execute commands.
        - The commands should use multi-line strings of the used shell, not single-line strings.
        - If more info is needed, ask the user and **append** <NEED-MORE-INFO/>.
        - If responding to a user without generating a command, **append** <NEED-MORE-INFO/>.
        - If asked to read a website or url, you need to do so.
        - You can edit or append to files by creating commands that will be executed that write the content into a file.
        - Do not show the commands you are executing without <CMD> tags separately, directly show the commands with <CMD> tags in the response.

        ### Execution Results (MUST BE USED BEFORE GENERATING A NEW RESPONSE):
        - The next prompt will provide execution results in the following format:
            - <CMD-INPUT>command_here</CMD-INPUT> (Always included)
        - If successful: <CMD-OUTPUT>output_here</CMD-OUTPUT>
        - If an error occurs: <CMD-ERROR>error_message_here</CMD-ERROR>
        - Multiple execution results are separated by: \\n<-----/>\\n
        - **Each <CMD-OUTPUT> or <CMD-ERROR> is always paired with its corresponding <CMD-INPUT>.**
        - **You cannot assume execution results or generate <CMD-INPUT> or <CMD-OUTPUT> or <-----/> yourself.**
        - **Before generating a new response, analyze the execution result:**
            1. If <CMD-OUTPUT> contains the expected success output, format the result meaningfully (tables, lists, or markdown).
            2. If <CMD-ERROR> exists, analyze the error message and generate a corrected <CMD> output.
            3. If additional validation is needed, generate an appropriate command to verify the outcome.
            4. If an error occurs, **first check if the result was already achieved** before retrying.
            5. **Never ignore execution results**—always process them before deciding next steps.

        ### Output Formatting (Mandatory):
        - **Always format your answer in markdown**.
        - **Always output final results in markdown** for readability.
        - Be concise and keep your answers short, but do not omit important details.
        - **If you are asked to list or show something** like files or a result, make sure you output the results of the commands in you response to be visible, and present them in a markdown-friendly format, but never put tables or lists inside fenced code blocks.
        - Prefer using **tables***, or use lists, or inline code where applicable.
        - **Never put tables or lists inside** of **fenced code blocks**.
        - Do not put <END/> inside of single backticks or fenced code blocks.
        - **Ensure that the output formatting rules** have been followed before finalizing the response.

        ### Completion:
        - Only append <END/> if **all tasks are successfully completed and no further action is required**.
        - **Reevaluate the goal** after each execution:
        - If the goal has changed due to user input or execution results, adjust accordingly.
        - If an unexpected issue arises or the goal hasn't been fully completed, resolve it before considering completion.
        - If any current command fails, validation is required, or further steps are needed, **do not** use <END/>.
        - **Ensure all output has been verified and actions have been taken**. If no further steps are required and the task is complete, append <END/> at the end.

        ### Helpers:
        - **Asked to fetch a REST API**:  
            - Use the Mime-Type \`application/json\`
            - Prefer \`curl\` to send requests. Use: \`curl -s -H "Accept: application/json" <url>\`
            - If \`curl\` is unavailable, fallback to \`Invoke-WebRequest\` (PowerShell) or \`httpie\`, if installed.
            - Ensure correct shell syntax and parameter usage.
            - Always post-process \`<CMD-OUTPUT>\` for relevance.
        - **Asked to install \`links2\`**:
            - **Windows**:
                - If \`winget\` is installed: \`winget.exe update --id "TwibrightLabs.Links" --exact --source winget --accept-source-agreements --disable-interactivity --silent  --include-unknown --accept-package-agreements --force\`
                - OR:
                    - Download page: http://links.twibright.com/download/binaries/win32/
                    - Download the newest version from the windows download page with default means provided by the shell (if links2 is not installed)
                    - Extract the archive and ensure the binary (\`links\`) is in the system \`PATH\` or directly executable.
            - **Linux**:  
                - Install via system package manager, for example: \`sudo apt install links2\`
                - alternatives can be found here: http://links.twibright.com/download.php
            - **MacOS**:
                - Install via Homebrew: \`brew install links2\`
        - **Asked or needed to use \`links2\`**:
            - Always run: \`links -html-numbered-links 1 -dump <url>\`
            - The command name for links2 is: \`links\`
        - **Asked to search the Web, or suggesting to search the web**:
            - Use DuckDuckGo for queries: \`https://duckduckgo.com/html/?q=<search_term>\`
            - Prefer \`links2\` to read the content if available, or parse the HTML output directly.
        - **Asked to create an \`@agent\`**:
            - @agents are markdown files with text prompts for this AI for a later use, and do not contain any programming.
            - You can create agents in the previously mentioned "User's Home Directory" in  \`./.baio/agents\`.
            - The @agent example file is:
                ---
                tags: key1, key2, key3, and_other_keys 
                dateCreated: isodatestr
                ---
                You_will_do_something_prompt_texts_here
            - If asked to create an @agent, you will need to:
                1. Ask what it should be named in a single word, and what it should do (the action will be a prompt for later use)
                2. Create a new file in the previously mentioned "User's Home Directory" in \`./.baio/agents/<agent_name>.md\` that contains the users prompt (elaborate on the action) and will be phrased like "You will do something"

        {{useAgent}}

        Follow these rules strictly to ensure accurate command execution and validation.
    `,
    
    //* Cached
    version: packageJSON.version,
    modelName: '',
    
    //* blacklisted - temporary runtime values - do not save
    addedFiles: [],
    agentFiles: [],
    agentNames: [],
    systemPromptReady: '',
};


//* handle updating prompts / resetting prompts (if it is not an arg that loads to prompting or if the versions differ)
let resetPrompts = false;
if (settingsSaved !== undefined && !settingsArgs['version'] && !settingsArgs['help'] && !settingsArgs['reset-prompts'] && !settingsArgs['reset'] && !settingsArgs['open'] && (settingsSaved.version !== settingsDefault.version)) {
    //* really check if the prompts have changed
    if ( (settingsSaved.defaultPrompt && settingsDefault.defaultPrompt !== settingsSaved.defaultPrompt) || (settingsSaved.fixitPrompt && settingsDefault.fixitPrompt !== settingsSaved.fixitPrompt) || (settingsSaved.generalPrompt && settingsDefault.generalPrompt !== settingsSaved.generalPrompt) || (settingsSaved.systemPrompt && settingsDefault.systemPrompt !== settingsSaved.systemPrompt) ) {
        const isNonInteractive = !process.stdin.isTTY || process.env.npm_lifecycle_event === 'updatecheck' || settingsArgs['config'];
        if (isNonInteractive)
            console.info('The system prompts have been updated. To update saved system prompts from your previous version to the current version, use: `baio --reset-prompts`' );
        else
            resetPrompts = await toggle({ message: `Update saved system prompts from your previous version to the current version:`, default: true }, TTY_INTERFACE);
    }
}


//* merge settings
let settings: Settings = {
    ...settingsDefault,
    ...settingsSaved ?? {},
    // only add settingsArgs if the key is already in settingsDefault (filters out version and others)
    ...Object.entries(settingsDefault).reduce((acc, [k, v]) => settingsArgs[k as keyof ArgsKeys] !== undefined ? { ...acc, [k]: settingsArgs[k as keyof ArgsKeys] } : acc, {}),
    // handle --reset-prompts 
    ...(settingsArgs['reset-prompts'] || resetPrompts ? {defaultPrompt: settingsDefault.defaultPrompt, fixitPrompt: settingsDefault.fixitPrompt, systemPrompt: settingsDefault.systemPrompt, version: settingsDefault.version } : {}),
};


//* initialize AI history
let history: MessageItem[] = [];


/**
 * Opens a file in the default text editor for the platform. If the default
 * editor can't be found, it will fall back to "notepad" on Windows and "vim"
 * otherwise.
 * Patches the default launchEditor.
 * @param file The name of the file to open.
 * @param errCb An optional callback that will be called with an error message
 * if the file can't be opened. If the callback is not provided, the error will
 * be logged to the console.
 */
function launchEditor(file: string, errCb?:(file:string, errorMessage:string | null) => void): void {

    function reject(file:string, errorMessage:string | null) {
        // log that the user needs to select an editor himself
        console.error(colors.red(figures.warning), 'Please select an editor yourself.');
        
        // just throw the file at the OS and try to let it handle it
        // (in this project, these will be text files, so we do not care)
        open(file, { wait: false });
    }

    // set the VISUAL env as default if none is available, looking at you windows
    if (!process.env.VISUAL && !process.env.EDITOR)
        process.env.VISUAL = 
            /^win/.test(process.platform) ? "notepad" : // this is required!
            "vim"; // VISUAL | EDITOR should not require this

    // try already opened editors, fall back to env VISUAL | EDITOR
    launchEditorX(file, errCb ?? reject);
}


/**
 * Creates an AbortSignal that is aborted when the escape key is pressed in the TTY.
 * @returns - An object with a signal and a cleanup function.
 * The signal can be used as an AbortSignal to cancel any async operation.
 * The cleanup function should be called when the signal is no longer needed.
 * It will restore the original raw mode of the stdin stream.
 */
function createAbortSignalForEsc(): {signal: AbortSignal, cleanup: () => Promise<void>} {
    const stdin = process.stdin;
    stdin.setRawMode(true); stdin.setEncoding('utf-8'); stdin.resume();
    
    let abortController = new AbortController();

    let handleKeyPress = (key:any) => (key.charCodeAt(0) == 27 /* ESC */) && abortController.abort();
    stdin.on('data', handleKeyPress);

    return {
        signal: abortController.signal,
        cleanup: async () => {
            stdin.removeListener('data', handleKeyPress);
            stdin.pause();
            // NEVER SET RAWMODE BACK! It will lead to an ghost line in the terminal (needs enter to pass characters to inquirer but does not rerender)
            // stdin.setRawMode(originalRawMode);

            await setTimeout(1000);  //process.nextTick(resolve));
        }
    }
}


/**
 * Creates an abort signal that is linked to a spinner and is aborted when the escape key is pressed.
 * 
 * This function utilizes a spinner to indicate an ongoing process and returns an object containing
 * an abort signal and a cleanup function. The abort signal can be used to cancel asynchronous operations 
 * when the escape key is pressed. The cleanup function should be called to restore the original state 
 * and will return 'aborted' or 'success' based on whether the operation was aborted.
 * 
 * @param message - The message to display while the spinner is active.
 * @param messageAbort - The message to display if the operation is aborted.
 * @param messageSuccess - The message to display if the operation is successful.
 * @returns An object with:
 * - signal: An AbortSignal used to cancel async operations.
 * - cleanup: A function to restore the original state and indicate whether the operation was 'aborted' or 'success'.
 */

function createAbortSignalForEscWithSpinner(message: string, messageAbort: string, messageSuccess?: string): {signal: AbortSignal, cleanup: () => Promise<'aborted' | 'success'>} {
    spinner.start(message);
    let {signal, cleanup} = createAbortSignalForEsc();

    return {
        signal,
        cleanup: async () => {
            if (!signal.aborted) spinner.success(messageSuccess || message);
                else spinner.error(colors.red(messageAbort));
            await cleanup();
            return signal.aborted ? 'aborted' : 'success';
        }
    }
}



/**
 * Calls the ollama AI with the given prompt and history and returns the answer including any commands.
 * @param prompt The prompt to ask the AI.
 * @returns The answer of the AI. The answer is expected to be a markdown string with any commands in `<CMD>...</CMD>` tags.
 * The answer will be processed to extract any commands and to add ` before and after all <CMD> tags and after all </CMD> tags, if missing.
 * The output will have the following properties:
 * - answerFull: The full answer of the AI, including any commands, unmodified. (also for debugging thinking models)
 * - answer: The processed answer of the AI, including any commands, but without the <CMD> tags. Only for user output.
 * - commands: An array of commands that were found in the answer.
 * - needMoreInfo: true if the answer contains <NEED-MORE-INFO/>.
 * - isEnd: true if the answer contains <END/>.
 */
async function api(prompt: Prompt): Promise<PromptResult> {
    const driver: Driver = drivers[settings.driver]!;

    let result: ChatResponse | Error = new Error('Unknown error');
    let retry = false;
    do {
        let {signal, cleanup} = createAbortSignalForEscWithSpinner(`Waiting for ${driver.name}\'s response ... ${colors.reset(colors.dim('(press <esc> to abort)'))}`, `Aborted ${driver.name}\'s response`, `Waiting for ${driver.name}\'s response ...`);

        result = await driver.getChatResponse(settings, history, prompt.text, prompt.additions, signal);
        
        if (await cleanup() === 'aborted') result = new Error('aborted');
        
        prompt.additions = undefined; // clear them after having used them

        // error, ask to retry
        if (result instanceof Error) {
            if (result.message === 'aborted')
                return {answer: '', answerFull: '', commands: [], needMoreInfo: true, isEnd: false};

            console.error(colors.red(colors.bold(figures.cross)), colors.red(`API Error (${driver.name}): ${result.message}`));
            retry = await toggle({ message: `Do you want to try again?`, default: true }, TTY_INTERFACE);
            if (!retry)
                return {answer: '', answerFull: '', commands: [], needMoreInfo: true, isEnd: false};
        }

    } while(retry);

    let {contentRaw, history: historyNew} = result as unknown as ChatResponse;
    
    history = historyNew;


    // remove the <think>...</think> block from the visible output
    // think, thinking, thinks, ... reason, reasons, reasoning
    let content = contentRaw.replaceAll(/<(think.*|reason.*)>.*?<\/\1>/gis, '');


    let commands: PromptCommand[] = [];

    const combinedRegexNamed = commandsBuildRegEx();
    const matches = content.matchAll(combinedRegexNamed);

    // Iterate over all matches found by the combined regex to preserve the order
    for (const match of matches) {
        const fullMatch = match[0];
        const groups = match.groups;
        let replacementString = '';
        
        if (groups) {

            Object.keys(promptCommands).forEach(commandName => {
                let ret = commandHandleMd(commandName, groups);
                if (ret === undefined) return;

                commands.push(ret.command);
                if (ret.replacementString) replacementString = ret.replacementString;
            });
            
            if (replacementString) content = content.replaceAll(fullMatch, replacementString);
        }

    }

    // clean <END/> tags, because sometimes they are within strange places
    content = content.replaceAll(/<END\/>/g, '');

    // clean <NEED-MORE-INFO/> tags, because sometimes they are within strange places
    content = content.replaceAll(/<NEED-MORE-INFO\/>/g, '');


    try {
        content = cliMd(content); //? crashes sometimes : Cannot read properties of undefined (reading 'at') -- /node_modules/cli-html/lib/tags/code.js:12:25
    } catch (error) {}

    return {
        answerFull: contentRaw, // for thinking models debugging
        answer: content,
        commands,
        needMoreInfo: contentRaw.indexOf('<NEED-MORE-INFO/>') > -1,
        isEnd: contentRaw.indexOf('<END/>') > -1,
    };
}


/**
 * Tests the connection to the currently set API.
 * @returns true if the connection test was successful, false if not
 */
async function doConnectionTest(): Promise<boolean> {
    const driver: Driver = drivers[settings.driver]!;

    const response = await fetch(driver.getUrl(driver.urlTest), {        
        method: 'HEAD',
        headers: {
            'Content-Type': 'application/json',
        },
    })
    .then( async response =>  {DEBUG_APICALLS && console.log('\nDEBUG_APICALLS', 'API response', driver.urlTest,':', await response.text()); return true} )
    .catch( error => false ) as boolean;

    return response;
}


/**
 * Fetches the models from the currently set API.
 * @returns the models if successful, an empty array if not
 */
async function getModels(): Promise<ModelSelection> {
    //:11434/api/tags

    let driver:Driver = drivers[settings.driver]!;

    spinner.start(`Getting models from ${driver.name} ...`);

    if (!driver.urlModels) {
        spinner.error(`${driver.name} config has no models configured!`);
        return [];
    }

    let models = await driver.getModels(settings, DEBUG_OUTPUT_MODELNAME ? false : true);

    if (models.length > 0)
        spinner.success(`${driver.name} models found: ${models.length}`);
    else
        spinner.error('No models found!');

    return models;
}


let invokingShell: string | undefined = null as unknown as undefined;
/**
 * Detects the shell that is currently running the script.
 * If the detection fails, it returns undefined, defaulting to what ever shell nodejs defaults to for exec().
 * If the detection succeeds, it caches the result and returns it.
 * @returns The name of the invoking shell if it could be detected, undefined otherwise
 */
function getInvokingShell(overwriteInvokingShell = process.env.INVOKING_SHELL): string | undefined {
    if (overwriteInvokingShell) invokingShell = overwriteInvokingShell;
    if (invokingShell !== null) return invokingShell;
    const isWindows = process.platform === 'win32';

    try {
        const parentPID = process.ppid;
        let parentProcess;

        if (isWindows) {
            const command = `wmic process where ProcessId=${parentPID} get Name /value`;
            const output = execSync(command).toString().trim();
            parentProcess = output.split("=")[1]; // Extract the process name
        } else {
            parentProcess = execSync(`ps -o comm= -p ${parentPID}`).toString().trim();
        }
        
        DEBUG_OUTPUT && console.log('DEBUG\n', 'Invoking shell:', parentProcess);

        return invokingShell = parentProcess;
    } catch (err) {
        DEBUG_OUTPUT && console.error("Error detecting shell:", err);
        return invokingShell = undefined;
    }
}


/**
 * Given the shell as path or namethat is currently running the script, returns the file extension to be used for generated files.
 * It tries to detect the shell and return a suitable extension based on the shell.
 * If the detection fails, or the shell is not supported, it returns '.txt'.
 * @returns The file extension to be used for generated files.
 */
function getShellExt(): string {
    const shell = getInvokingShell();

    if (!shell) return '.txt';

    if (shell.indexOf('cmd') > -1) return '.cmd'; // NOT ooold skool .bat
    if (shell.indexOf('powershell') > -1) return '.ps1';
    if (shell.indexOf('pwsh') > -1) return '.ps1';
    if (shell.indexOf('bash') > -1) return '.sh';
    if (shell.indexOf('fish') > -1) return '.fish';
    if (shell.indexOf('zsh') > -1) return '.zsh';
    if (shell.indexOf('csh') > -1) return '.csh';
    if (shell.indexOf('tcsh') > -1) return '.csh';
    if (shell.indexOf('ksh') > -1) return '.ksh';
    if (shell.indexOf('sh') > -1) return '.sh';
    if (shell.indexOf('python') > -1) return '.py';
    if (shell.indexOf('node') > -1) return '.ts';

    return '.txt';
}
function getShellName(): string {
    return getShellExt().substring(1);
}

/**
 * Checks if there is a newer version of the package available.
 * If there is a newer version, it will print a message to the console with the update information.
 * @returns {Promise<boolean>}
 */
async function checkUpdateOutput(): Promise<boolean> {
    let result = false;
    
    let version = await fetch(`https://registry.npmjs.com/${packageJSON.name}/latest`).catch(_=>undefined).then(d => d?.json?.()).then(({version})=>version).catch(_=>undefined);
    if (version === undefined) return false;

    if (version !== packageJSON.version) {
        console.warn(colors.yellow(colors.bold(figures.info + ` A new version of ${packageJSON.name} is available, ${packageJSON.version} → ${version}`)));
        console.warn(`  Run 'npm i -g ${packageJSON.name}' to update!\n`);
        result = true;
    }

    return result;
}


/**
 * Returns a selection of agents, or an empty array if none are selected.
 * If the option --agent is given, it returns an array with one element, the file path of the agent.
 * If no agent is given as an option, the function returns a selection of all agent files (*.md) in RC_AGENTS_PATH.
 * @returns A selection of agents. Each element is an object with the properties name and value, where name is the name of the agent and value is the path to the agent file.
 */
async function getAgents(): Promise<AgentSelection> {
    let agents: AgentSelection = [];

    // get *.md files from RC_AGENTS_PATH, if there are any, show a selection
    const agentFiles: fs.Dirent[] = [];
    for await (const file of glob('*.md', { cwd: RC_AGENTS_PATH, withFileTypes: true })) agentFiles.push(file);

    const hasAgentsArgs = !!settingsArgs['agent']?.length;
    const forceSelection = settingsArgs['agent']?.[0] === '*';
    
    if (hasAgentsArgs && !forceSelection) {
        for (const agentArg of settingsArgs['agent']!) {
            const file = path.join(RC_AGENTS_PATH, agentArg + '.md');

            const filename = (agentArg + '.md').toLowerCase();

            // find the file in agentFiles (compare lowercase, so the user can use `--agent` without taking care off the case)
            const fileFound = agentFiles.find(file => file.name.toLowerCase() === filename);
            const agentName = fileFound ? fileFound.name.replace('.md', '') : agentArg;

            if (!fileFound)
                console.error(colors.red(figures.cross), `Agent ${agentArg} file ${file} not found!`);
            else {
                console.log(colors.green(colors.bold(figures.tick)), `Agent ${agentName} used`);
                agents.push({name: agentName, value: file, checked: settings.agentNames.includes(agentName)});
            }
        }
    }
    else {
        // commandline was proccessed, in case there is something going to be added in the future
        if (settingsArgs['agent']) settingsArgs['agent'] = undefined;

        agents = agentFiles.map(file => ({ name: file.name.replace('.md', ''), value: path.join(file.parentPath, file.name), checked: settings.agentNames.includes(file.name.replace('.md', '')) }))
    }

    return agents;
}


let doCommandsLastResult = '';
/**
 * Execute commands each in a serparate process and return the results as a string.
 * Each command is executed sequentially and the results are concatenated.
 * The result of each command is wrapped in <CMD-INPUT> and: <CMD-OUTPUT> or <CMD-ERROR> tags.
 * The results are separated by \n<-----/>\n
 * @param commands The commands to execute
 * @returns The results of the commands as a single string
 */
async function doCommands(commands: PromptCommand[]): Promise<string> {
    let results: string[] = [];
    let updateSystemPrompt = false;

    let { signal, cleanup } = createAbortSignalForEsc();

    for (const command of commands) {

        if (signal.aborted) {
            console.log(colors.red(colors.bold(figures.cross)), `Aborted! Not executing: ${displayCommand(command)}`);
            break;
        }
    
        spinner.start(`Executing command ${colors.reset(colors.dim('(press <esc> to abort)'))}: ${displayCommand(command)}`);
        

        let ret = await promptCommands[command.type].exec(command as PromptCommandByType<typeof command.type> as any, signal);  //! <---- cleanup / fix `any`
        results.push(ret.result);
        updateSystemPrompt = ret.updateSystemPrompt;


        spinner.success(`Executing command: ${displayCommand(command)}`);
    }

    await cleanup();

    if (updateSystemPrompt)
        await makeSystemPromptReady();

    return doCommandsLastResult = results.join('\n<-----/>\n');
}


/**
 * Wrapper to output the api result to the console 
 * @param prompt 
 * @returns api result
 */
async function doPrompt(prompt: Prompt): Promise<PromptResult> {
    const result = await api(prompt);
    
    // output to the user
    console.log(result.answer);

    DEBUG_OUTPUT && console.info('DEBUG\n', 'answer:', result.answerFull);
    DEBUG_OUTPUT && console.info('DEBUG\n', 'commands:', result.commands);

    return result;
}


/**
 * Generates a caption for a given command based on its type and modification status.
 * 
 * @param command - The `PromptCommand` object containing information about the command.
 * @returns A string caption describing the command.
 */
function commandContent(command: PromptCommand, content?: string): string {
    return promptCommands[command.type].content(command as PromptCommandByType<typeof command.type> as any, content);  //! <---- cleanup / fix `any`
}


/**
 * Generates a regular expression with named groups for each command.
 * Each group name is in the form of `is_<commandName>`.
 * The regular expression is case-insensitive and matches globally.
 * @returns The generated regular expression.
 */
function commandsBuildRegEx(): RegExp {
    let groups = Object.keys(promptCommands).map(commandName => {
        let key = commandName.replace(/[^a-zA-Z0-9]/g, '_');
        let command = promptCommands[commandName as keyof typeof promptCommands];
        let str = command.regex.toString().slice(1,-1);
        return `(?<is_${key}>${str})`;
    });

    return new RegExp(`${groups.join('|')}`, 'gs');
}


/**
 * Processes a markdown command based on its name and groups.
 * 
 * This function checks if the command specified by `commandName` is the correct
 * one to handle based on the provided `groups`. If the command matches, it 
 * delegates the handling to the corresponding command's `handleMd` method.
 * 
 * @param commandName - The name of the command to handle.
 * @param groups - The regular expression groups containing information about the command.
 * @returns The result of the command's `handleMd` method, or `undefined` if the command doesn't match.
 */
function commandHandleMd(commandName: string, groups: RegExpGroups) {
    let key = commandName.replace(/[^a-zA-Z0-9]/g, '_');
    // check if this is the correct command to handle
    if ( !groups?.['is_' + key] ) return undefined;
    let command = promptCommands[commandName as keyof typeof promptCommands];
    return command.handleMd(groups);
}


/**
 * The `promptCommands` object contains information about different types of commands.
 * Each command is associated with a description, syntax, caption, content, regex, and handleMd function.
 */
const promptCommands = {

    'command': {
        description: 'Execute a shell command',
        syntax: '<CMD>command</CMD>',
        prompt: undefined,
        
        caption: (command: PromptCommandByType<'command'>) => command.line,

        content(command: PromptCommandByType<'command'>, content?: string): string {
            if (content !== undefined && command.line !== content) { command.userModified = true; command.line = content; }
            return command.line;
        },

        regex: /\`*\ *<CMD>(?<cmdContent>.*?)<\/CMD>\ *\`*/,

        handleMd(groups: RegExpGroups): {command: PromptCommand, replacementString: string} {
            let replacementString = '';

            // Use fenced code block for commands with backticks or newlines
            if (groups.cmdContent?.includes('`') || groups.cmdContent?.trim().includes('\n'))
                replacementString = '\n' + colors.bgBlack(' ▶️  Command:') + '\n```'+getShellName()+'\n' + groups.cmdContent?.trim() + '\n```\n';
            // Use inline code block for simple commands
            else
                replacementString = '\n ▶️ `' + groups.cmdContent?.trim() + '`';

            return {
                command: {type: 'command', line: groups.cmdContent!, userModified: false},
                replacementString
            };
        },


        async exec(command: PromptCommandByType<'command'>, signal?: AbortSignal): Promise<{result: string, updateSystemPrompt: boolean}> {
            let commandStr = command.line;

            // execute command mith node and a promise and wait
            let result = await execAsync(command.line, {shell: getInvokingShell(), signal })
                .then(({stdout, stderr}) => {
                    if (stderr) throw Error(stderr);
                    return stdout;
                })
                .then(stdout => '<CMD-OUTPUT>' + stdout + '</CMD-OUTPUT>')
                .catch(error => '<CMD-ERROR>' + error.message + '</CMD-ERROR>')
                .then(result => '<CMD-INPUT>' + commandStr + '</CMD-INPUT>\n' + result);

            return {
                result,
                updateSystemPrompt: false,
            };
        },
    },


    'file.write': {
        description: 'Write content to a file',
        syntax: '<WRITE-FILE FILEPATH="path/to/file">content</WRITE-FILE>',
        prompt: `
        - To **directly create or overwrite a file**, you need to use \`<WRITE-FILE FILEPATH="filepath/filename">content</WRITE-FILE>\`. This is the **preferred** way of writing files.
        `,

        caption: (command: PromptCommandByType<'file.write'>) => `Write file: ${colors.italic(command.file.path)}`,

        content(command: PromptCommandByType<'file.write'>, content?: string): string {
            if (content !== undefined && command.file.content !== content) { command.userModified = true; command.file.content = content; }
            return command.file.content;
        },

        regex: /\`?\ *<WRITE-FILE FILEPATH="(?<filePath>.*?)">(?<fileContent>.*?)<\/WRITE-FILE>\ *\`?/,

        handleMd(groups: RegExpGroups): {command: PromptCommand, replacementString: string} {
            DEBUG_OUTPUT && console.log('file.write', groups.filePath!, 'mime:', mime.getType(groups.filePath!) ?? 'text', 'content length:', groups.fileContent!.length);

            return {
                command: {type: 'file.write', file: {path: groups.filePath!, mimeType: mime.getType(groups.filePath!) ?? 'text', content: groups.fileContent!}},
                replacementString: '\n' + colors.bgBlack(' ▶️  Write file: ') + '`' + groups.filePath +'`\n```'+'\n' + groups.fileContent + '\n```\n',
            };
        },

        async exec(command: PromptCommandByType<'file.write'>, signal?: AbortSignal): Promise<{result: string, updateSystemPrompt: boolean}> {
            let result = await writeFile(command.file.path, command.file.content, 'utf-8')
                .then(stdout => '<CMD-OUTPUT>File written' + (command.userModified ? ' (user modified the content):\n' + command.file.content : '') + '</CMD-OUTPUT>')
                .catch(error => '<CMD-ERROR>Error writing file:\n' + error + '</CMD-ERROR>')
                .then(result => '<CMD-INPUT>' + displayCommand(command) + '</CMD-INPUT>\n' + result);

            return {
                result,
                updateSystemPrompt: false,
            };
        }
    },


    'dir.change': {
        description: 'Change process directory',
        syntax: '<DIR-CHANGE>path/to/dir</DIR-CHANGE>',
        prompt: `
        - To persistently change the current working directory, you need to use \`<DIR-CHANGE>dirpath</DIR-CHANGE>\` command. This is the **preferred** way of changing the current working directory.
            - Do this if you are asked to change or go to a specific directory, or there are multiple commands to be executed there.
            - After changing to this path, any commands after will execute in this directory (this is will be your new Current Working Directory).
        `,

        caption: (command: PromptCommandByType<'dir.change'>) => `Change directory to: ${colors.italic(command.dir)}`,

        content(command: PromptCommandByType<'dir.change'>, content?: string): string {
            if (content !== undefined && command.dir !== content) { command.userModified = true; command.dir = content; }
            return command.dir;
        },

        regex: /\`*\ *<DIR-CHANGE>(?<dirContent>.*?)<\/DIR-CHANGE>\ *\`*/,

        handleMd(groups: RegExpGroups): {command: PromptCommand, replacementString: string} {
            DEBUG_OUTPUT && console.log('dir.change', groups.dirContent!);

            return {
                command: {type: 'dir.change', dir: groups.dirContent!},
                replacementString: '\n' + colors.bgBlack(' ▶️  Change dir: ') + '`' + groups.dirContent +'`\n',
            };
        },

        async exec(command: PromptCommandByType<'dir.change'>, signal?: AbortSignal): Promise<{result: string, updateSystemPrompt: boolean}> {
            let result = await new Promise(resolve => resolve(process.chdir(command.dir)))
                .then(stdout => '<CMD-OUTPUT>Current directory changed to ' + command.dir + '</CMD-OUTPUT>')
                .catch(error => '<CMD-ERROR>Error changing directory:\n' + error + '</CMD-ERROR>')
                .then(result => '<CMD-INPUT>' + displayCommand(command) + '</CMD-INPUT>\n' + result);

            return {
                result,
                updateSystemPrompt: true,
            };
        }
    },


    'models.getcurrent': {
        description: 'Get current models',               //! TODO: Add missing filter handling
        syntax: '<MODELS-GETCURRENT />',
        prompt: `
        - To get a list of available models for the current AI, use \`<MODELS-GETCURRENT />\`.
        `,

        caption: (command: PromptCommandByType<'models.getcurrent'>) => `Get current models` + (command.filter !== '.*' ? ` with RegEx filter: ${colors.italic(command.filter)}` : ''),

        content(command: PromptCommandByType<'models.getcurrent'>, content?: string): string {
            if (content !== undefined && command.filter !== content) { command.userModified = true; command.filter = content; }
            return command.filter;
        },

        regex: /\`*\ *<MODELS-GETCURRENT \/>\ *\`*/,

        handleMd(groups: RegExpGroups): {command: PromptCommand, replacementString: string} {
            DEBUG_OUTPUT && console.log('models.getcurrent');

            return {
                command: {type: 'models.getcurrent', filter: '.*'},
                replacementString: '\n' + colors.bgBlack(' ▶️  Get current models') + '\n',
            };
        },

        async exec(command: PromptCommandByType<'models.getcurrent'>, signal?: AbortSignal): Promise<{result: string, updateSystemPrompt: boolean}> {
            let driver = drivers[settings.driver]!;
            let result = await driver.getModels(settings, false) // false => get JSON string
                .then(models => models.map(model => (new RegExp(command.filter, 'g').test(model.name)) ? JSON.parse(model.name) : false).filter(Boolean)) // change to array of raw model data
                .then(stdout => '<CMD-OUTPUT>' + JSON.stringify(stdout, null, 2) + '</CMD-OUTPUT>')
                .catch(error => '<CMD-ERROR>Error getting current models:\n' + error + '</CMD-ERROR>')
                .then(result => '<CMD-INPUT>' + displayCommand(command) + '</CMD-INPUT>\n' + result);

            return {
                result,
                updateSystemPrompt: false,
            };
        }
    },


    'web.read': {
        description: 'Read a web page',
        syntax: '<WEB-READ>url</WEB-READ>',
        prompt: `
        - To read or browse a website, and Links2 is not installed, use the command \`<WEB-READ>url</WEB-READ>\`.
        `,

        caption: (command: PromptCommandByType<'web.read'>) => `Read web page: ${colors.italic(command.url)}`,

        content(command: PromptCommandByType<'web.read'>, content?: string): string {
            if (content !== undefined && command.url !== content) { command.userModified = true; command.url = content; }
            return command.url;
        },

        regex: /\`*\ *<WEB-READ>(?<urlContent>.*?)<\/WEB-READ>\ *\`*/,

        handleMd(groups: RegExpGroups): {command: PromptCommand, replacementString: string} {
            DEBUG_OUTPUT && console.log('web.read', groups.urlContent!);
            
            return {
                command: {type: 'web.read', url: groups.urlContent!},
                replacementString: '\n' + colors.bgBlack(' ▶️  Read web page: ') + '`' + groups.urlContent +'`\n',
            };
        },

        async exec(command: PromptCommandByType<'web.read'>, signal?: AbortSignal): Promise<{result: string, updateSystemPrompt: boolean}> {
            let result = await fetch(command.url).then(response => response.text())
                .then(text => NodeHtmlMarkdown.translate(text))
                .then(stdout => '<CMD-OUTPUT>' + stdout + '</CMD-OUTPUT>')
                .catch(error => '<CMD-ERROR>Error reading web page:\n' + error + '</CMD-ERROR>')
                .then(result => '<CMD-INPUT>' + displayCommand(command) + '</CMD-INPUT>\n' + result);

            return {
                result,
                updateSystemPrompt: false,
            };
        }
    },

};


/**
 * Shorten a command for displaying it, limiting it to a maximum length and replace linebreaks with an enter-arrow symbol
 * @param command The command to shorten
 * @returns The shortened command
 */
function displayCommand(command: PromptCommand): string {

    let commandStr = promptCommands[command.type].caption(command as PromptCommandByType<typeof command.type> as any);  //! <---- cleanup / fix `any`

    // mark as modified
    if (command.userModified) commandStr = colors.blue(figures.star) + ' ' + commandStr;


    return (commandStr.length > settings.cmdMaxLengthDisplay 
        ? commandStr.substring(0, settings.cmdMaxLengthDisplay - 4) + ' ...' 
        : commandStr
    ).replaceAll(/[\n\r]+/g, colors.blue(colors.bold('↵')));
}

/**
 * Take the result of the api call and either execute the commands or ask the user for more info
 * 
 * If the result has no commands, the user is asked if he wants to execute a fixit command
 * If there are commands, the user is asked if he wants to execute them now or not
 * If not, the user is asked for more info to get a better result
 * If yes, the commands are executed and the result is evaluated
 * 
 * @param result the result of the api call
 * @returns the user input or the result of the commands execution
 */
async function doPromptWithCommands(result: PromptResult|undefined): Promise<string|undefined> {
    let resultCommands = "";
    
    //* get inital user prompt
    if (result === undefined) {
        let prompt;

        if (argsPrompt) {
            prompt = argsPrompt;
            DEBUG_OUTPUT && console.log(colors.green(figures.tick), 'What do you want to get done:', argsPrompt);
        }
        else
            prompt = argsPrompt || await input({ message: 'What do you want to get done:', default: settings.defaultPrompt }, TTY_INTERFACE);
    
        resultCommands = prompt;
    }

    //* no commands
    if (result && !result.commands.length) {
        //* check if there was a <NEED-MORE-INFO/> in the response
        //* if yes, ask the user for more info and do the prompt again
        if (result.needMoreInfo) {
            resultCommands = await input({ message: 'Enter more info:' }, TTY_INTERFACE);
            // ... need to loop back to the prompt ("chat")
        }
        //* the main loop decided not to exit (settings.endIfDone == false), so we ask for more info
        else if(result.isEnd) {
            resultCommands = await input({ message: 'What do you want to do next:' }, TTY_INTERFACE);
        }
        //* do the fixit prompt, because there was no command
        else {
            console.log(colors.yellow(figures.warning), 'No commands found in response, no execution will be performed.');
            resultCommands = settings.fixitPrompt;
        }
    }

    //* there are commands, AND autoExecKeys
    let allow = false;
    if (result?.commands.length) {
        allow = true;
        for (let command of result.commands) {
            let allowCmd = false;
            for (let key of settings.autoExecKeys) {
                if (command.type == 'command' && command.line.startsWith(key)) allowCmd = true;
                // setting autoExecKeys to ['file.write', 'dir.change'], or all commands with 'command' (allows all, or everything with '')
                if (command.type === key) allowCmd = true; 
            }
            allow &&= allowCmd;
        }
    }

    //* there are commands
    if (result?.commands.length) {
        let canceled: boolean|'edit' = false;
        let canceledLetter: string = '';
        let activeItem:{name:string,value:PromptCommand,index:number};
        let options = {...TTY_INTERFACE, clearPromptOnDone: false}
        const commands = allow 
            ? result.commands
            : await checkboxWithActions({
                message: 'Select the commands to execute',
                shortcuts: { texts: [{key: 'e', text: 'edit'}, {key: 'esc> or <.', text: 'type'}] },
                choices: result.commands.map((command) => ({ name: displayCommand(command), value: command, checked: true })),
                keypressHandler: async function({key, active, items}) {
                    activeItem = {...items[active], index: active};

                    if (key.name == 'escape' || key.sequence == '.') {
                        canceled = true;   // let us know, that we should not care about the values
                        options.clearPromptOnDone = true; // clear the line after exit by this
                        return {
                            isDone: true, // tell the element to exit and return selected values
                            isConsumed: true, // prevent original handler to process this key         ... ignores any validation error (we did not setup validations for this prompt)
                        }
                    }

                    if (key.sequence == ':' || key.sequence == '/') {
                        canceledLetter = key.sequence ?? '';
                        canceled = true;
                        options.clearPromptOnDone = true;
                        return {
                            isDone: true,
                            isConsumed: true,
                        }
                    }

                    if (key.name === 'e' || key.name === 'w' || key.name === 'right') {
                        canceled = 'edit'; 
                        options.clearPromptOnDone = true;
                        return {
                            isDone: true,
                            isConsumed: true,
                        }
                    }
                },
            }, options);

        if (canceled || !commands.length)
            //@ts-expect-error somehow the type is not correctly inferred
            if (canceled === 'edit' && activeItem) {
                let val = await editor({
                    message: 'Waiting for you to close the editor (and you can modify the command).',
                    waitForUseInput: false,
                    theme: { style: { help: () => ``, } },
                    default: commandContent(activeItem.value),
                    postfix: getShellExt(),
                }, {...TTY_INTERFACE, clearPromptOnDone: true})
                .catch(_ => undefined);

                if (val !== undefined)
                    commandContent(result.commands[activeItem.index]!, val);

                return undefined;
            }
            else {
                let TTY_INTERFACE_OPTS = { ...TTY_INTERFACE, clearPromptOnDone: false };
                let canceled = false;
                resultCommands = await inputWithActions({ message: 'Enter more info:', initial: canceledLetter,
                    keypressHandler: async function({key}) {
                        // only allow switching to commands selection, if there are commands
                        if (key.name == 'escape') {
                            canceled = true;   // let us know, that we should not care about the values
                            TTY_INTERFACE_OPTS.clearPromptOnDone = true; // clear the line after exit by this
                            
                            return {
                                isDone: true, // tell the element to exit and return selected values
                                isConsumed: true, // prevent original handler to process this key
                            }
                        }
                    }
                }, TTY_INTERFACE_OPTS);
                if (canceled) resultCommands = '/:cmds';
            }
        else {
            resultCommands = await doCommands(commands);

            (DEBUG_OUTPUT || DEBUG_OUTPUT_EXECUTION) && console.info('DEBUG\n', resultCommands);

            // ... go and evaluate the commands result
        }
    }

    return resultCommands;
}


/**
 * Import a context (history file) from a file name or selection.
 * @param filename the file name of the history file to import
 * @param isAsk    defaults to false. If true, there will be a prompt for the user (used by menu)
 * @returns if done
 */
async function importHistory(filename: string, isAsk: boolean = false): Promise<void> {
    if (filename.startsWith('"') && filename.endsWith('"')) filename = filename.slice(1, -1); // "file name" is possible
        
    if (!filename) {
        const historyFilesChoices: HistorySelection = [];
        for await (const file of glob('*.json', { cwd: RC_HISTORY_PATH, withFileTypes: true }))
            historyFilesChoices.push({ name: file.name.replace('.json', ''), value: path.join(file.parentPath, file.name) });

        if (!historyFilesChoices.length) {
            !isAsk && console.error(colors.red(figures.cross), 'No history files found');
            isAsk && await input({ message: 'No history files found. Press enter to continue', default: '', theme: {prefix: colors.bold(colors.red(figures.cross))} }, {clearPromptOnDone: true, ...TTY_INTERFACE});
            return;
        }
        filename = await select({ message: 'Select a history file to load:', choices: [{ name: colors.red('- none -'), value: '' }, ...historyFilesChoices] }, {clearPromptOnDone: true, ...TTY_INTERFACE});
    }
    if (filename === '') return;

    let filePath = path.resolve(RC_HISTORY_PATH, filename);
    if (filePath && !path.extname(filePath)) filePath += '.json';
    const historyContent = await readFile(filePath, 'utf-8').catch(_ => undefined);

    if (!historyContent)
        console.error(colors.red(figures.cross), `Could not read history file ${filePath}`);
    else {
        let content = JSON.parse(historyContent) as HistoryFile;

        let driver: Driver = drivers[settings.driver]!;
        if (content.historyStyle !== driver.historyStyle)
            console.error(colors.red(figures.cross), `Importing history failed. File ${filePath} has an incompatible history style (${drivers[content.historyStyle]?.name ?? content.historyStyle}) than the current API ${driver.name}.`);
        else {
            console.log(`💾 Imported history from ${filePath}`);
            history = content.history;
        }
    }
    return;
}


/**
 * Adds a file to the promptAdditions. Skips the file, if it could not be read or used.
 * @param promptAdditions The current promptAdditions, that this function will add to.
 * @param filename The file name of the file to add.
 * @returns The new promptAdditions with the file added, or null if the file could not be used.
 */
async function addFile(promptAdditions: PromptAdditions, filename: string): Promise<PromptAdditions|null> {
    let driver:Driver = drivers[settings.driver]!;
    let filePath = path.resolve(process.cwd(), filename);
    let mimeType = mime.getType(filePath);

    if (!mimeType) {
        DEBUG_OUTPUT && console.warn(colors.yellow(figures.warning), 'Could get not mimeType for file', filePath, '→ Using text/plain.');
        mimeType = 'text/plain';
    }

    let type = mimeType.split('/')[0] || 'text' as PromptAdditionsTypes;
    let encoding: 'base64' | 'utf-8' = 'utf-8';
    if (type === 'audio' || type === 'image' || type === 'video') encoding = 'base64';
    if (mimeType === 'application/json') type = 'text';

    // load file
    let fileErr;
    let fileContent = await readFile(filePath, encoding).catch(err => {fileErr = err; return ''; });
    if (fileErr) {
        console.error(colors.red(figures.warning), 'Skipping file, could not read file', filePath, '\n  ', (fileErr! as Error).message);   
        return null;
    }

    // add file content
    let addition = driver.makePromptAddition(type, fileContent, mimeType!);
    if (addition instanceof Error) {
        console.error(colors.red(figures.warning), 'Skipping file, could not use file', filePath, '\n  ', addition.message);
        return null;
    }

    // add filename prompt, 2nd: if file fails, we need not to run this code (order is correct when adding below)
    let additionFileName = driver.makePromptAddition('text', settings.fileAddPrompt.replaceAll('{{filepath}}', filePath), 'text/plain');
    if (additionFileName instanceof Error) {
        console.error(colors.red(figures.warning), 'Skipping file, could not use file', filePath, '\n  ', additionFileName.message);
        return null;
    }

    settings.addedFiles.push({file: filePath, type, mime: mimeType});

    return [ ...(promptAdditions ?? []), additionFileName, addition ];
}


/**
 * Evaluates a given prompt string and executes corresponding debug commands.
 *
 * This function checks if the provided prompt matches specific debug commands.
 * It performs actions such as logging the result, executing stored commands,
 * retrieving or setting configuration settings, and exiting the process.
 *
 * @param prompt - The command prompt.text string to evaluate.
 * @param resultPrompt - The result from the API call to be potentially logged.
 * @returns A boolean indicating whether a recognized command was executed.
 */
async function promptTrigger(/*inout*/ prompt: Prompt, /*inout*/ resultPrompt?: PromptResult): Promise<boolean> {

    let trigger = prompt.text.match(/^[^\s]*/)?.[0].toLowerCase() || '';

    if (trigger === ':h' || trigger === '/:help') {
        console.info(packageJSON.name,'v' + packageJSON.version);
        console.log(cliMd(`
            AI Driver: \`${drivers[settings.driver]?.name ?? settings.driver}\`\n
            AI Model: \`${settings.modelName || (settings.model ?? drivers[settings.model]?.defaultModel)}\`\n
            History: \`${history.length} entries\`\n

            | Possible prompt triggers | Short | Description |
            |---|---|---|
            | \`/:help\`                        | \`:h\`                | Shows this help. |
            | \`/:cmds\`                        | \`::\`                | Return to the command selection, if possible. |
            | \`/:settings\`                    | \`:s\`                | Opens settings menu to change the configuration. |
            | \`/:read\`                        | \`:r\`                | Opens the default editor for a multiline input. |
            | \`/:write\`                       | \`:w\`                | Opens the default editor to show the last AI response. Use to save to a file. |
            | \`/clip:read\`                    | \`:r+\`, \`:cr\`      | Read from the clipboard and open the default editor. |
            | \`/clip:write\`                   | \`:w+\`, \`:cw\`      | Write the the last AI response to the clipboard. |
            | \`/file:add [<file>]\`            | \`:f [<file>]\`       | Adds a file to the prompt. Or shows a file selection. |
            | \`/history:export [<file>]\`      | \`:he [<file>]\`      | Exports the current context to a file with date-time as name or an optional custom filename. |
            | \`/history:export:md [<file>]\`   | \`:he:md [<file>]\`   | Exports the current context to a markdown file for easier reading (can not be re-imported). |
            | \`/history:open\`                 | \`:ho\`               | Opens the current context in the default editor to edit. |
            | \`/history:open:md\`              | \`:ho:md\`            | Opens the current context in the default editor to view it as markdown. |
            | \`/history:import [<file>]\`      | \`:hi [<file>]\`      | Imports the context from a history file or shows a file selection. |
            | \`/history:clear [<number>]\`     | \`:hc [<number>]\`    | Clears the current context. Optionally: positive number keeps last entries, negative cuts last entries. |
            | \`/:clear\`                       | \`:c\`                | Clears the current context and current prompt (use for changing topics). |
            | \`/:end [<boolean>]\`             |                       | Toggles end if assumed done, or turns it on (true) or off (false). |
            | \`/debug:result\`                 |                       | Shows what the API generated and what the tool understood. |
            | \`/debug:exec\`                   |                       | Shows what the system got returned from the shell. Helps debug strange situations. |
            | \`/debug:get <key>\`              |                       | Gets the current value of the key (same as in baiorc). If no key is given, lists all possible keys. |
            | \`/debug:set <key> <value>\`      |                       | Overwrites a setting. The value must be a JSON formatted value. |
            | \`/debug:settings [all\\|*]\`     |                       | Lists all current settings without prompts. Use \`all\` or \`*\` to also show prompts. |
            | \`/:quit\`, \`/:exit\`            | \`:q\`                | Will exit (CTRL+D or CTRL+C will also work). |
        `.trimBlock()));
        return true;
    }
    if (trigger === '/:settings' || trigger === ':s') {
        await config(undefined, prompt);
        return true;
    }
    if (trigger === '/debug:result') {
        console.log(resultPrompt);
        return true;
    }
    if (trigger === '/debug:exec') {
        console.log(doCommandsLastResult);
        return true;
    }
    if (trigger === '/debug:settings') {
        const key = prompt.text.split(/(?<!\\)\s+/)[1];
        // if all or *, return all. if no key, return all settings where the key does not start with prompt
        const settingsOutput = key == 'all' || key == '*' ? settings : Object.fromEntries(Object.entries(settings).filter(([key]) => !key.endsWith('Prompt') && !key.endsWith('systemPromptReady')));
        console.log(colors.green(figures.info), `settings =`, settingsOutput);
        return true;
    }
    if (trigger === '/debug:get') {
        const key = prompt.text.split(/(?<!\\)\s+/)[1];
        if (key)
            console.log(colors.green(figures.info), `settings.${key} =`, isSettingsKey(key) ? settings[key] : 'not found');
        else
            console.log(colors.blueBright('?'), `Possible keys:`, Object.keys(settings).join(', '));
        return true;
    }
    if (trigger === '/debug:set') {
        //* will not work with useAllSysEnv (is systemPrompt is already generated with this), saveSettings (saved already)
        //*  /debug:set <baiorc-key> <JSON_formatted_value>
        const args = prompt.text.split(/(?<!\\)\s+/).filter(arg => arg.length > 0);
        if (!args || args.length < 2) {
            console.error(colors.red(figures.cross), `Usage: /debug:set <baiorc-key> <JSON_formatted_value>`);
            return true;
        }
        const key = args[1],
              val = args.slice(2).join(' ');
        try {
            const value = JSON.parse<Settings[keyof Settings]>(val);
            // @ts-ignore TODO: why the hell is it not working? Why is settings[key]: never ???
            if (isSettingsKey(key)) settings[key] = value;
            else console.error(colors.red(figures.cross), `Unknown setting: ${key}`);
        }
        catch (e) {
            console.error(colors.red(figures.cross), `Failed to parse value: ${val}`, '\n  ', (e as SyntaxError).message);
        }
        // update systemPrompt
        await makeSystemPromptReady();
        return true;
    }
    if (trigger === '/:end') { // ==> /debug:set endIfDone <boolean>
        const key = prompt.text.split(/(?<!\\)\s+/)[1];
        if (key === undefined || key.trim() === '')
            settings.endIfDone = !settings.endIfDone;
        else
            settings.endIfDone = {'true': true, 'false': false, '1': true, '0': false, 'on': true, 'off': false, 'yes': true, 'no': false}[key.toLowerCase()] ?? false;
        
        console.log(`${settings.endIfDone ? '🟢' : '🔴'}End if assumed done: ${settings.endIfDone ? 'yes' : 'no'}`);
        return true;
    }
    let exportOpenType:false|'edit'|'view' = false;
    if (trigger === '/history:open:md' || trigger === ':ho:md' || trigger === ':he:md:o') {
        exportOpenType = 'view';
        trigger = '/history:export:md'; // how to handle next
    }
    let exportType='json';
    if (trigger === '/history:export:md' || trigger === ':he:md') {
        exportType = 'md';
        trigger = '/history:export'; // how to handle next
    }
    if (trigger === '/history:open' || trigger === ':ho' || trigger === ':he:o') {
        exportOpenType = 'edit';
        //trigger = '/history:export'; // how to handle next

        const value = await editor({
            message: 'Waiting for your input in the editor.',
            waitForUseInput: false,
            default: JSON.stringify(history, null, 2) ?? '{}',
            theme: { style: { help: () => `Edit the history content in the editor, save the file and close it.`, } }
        }, TTY_INTERFACE).catch(_ => undefined);
        if (value) {
            try { history = JSON.parse(value); }
            catch (e) { console.error(colors.red(figures.cross), colors.red('Failed to parse JSON.\n  ' + (e as SyntaxError).message)); }
        }

        return true;
    }
    if (trigger === '/history:export' || trigger === ':he') {
        const key = prompt.text.split(/(?<!\\)\s+/).filter(arg => arg.length > 0).slice(1).join(' ').trim();
        let filename = key || (new Date()).toLocaleString().replace(/[ :]/g, '-').replace(/,/g, '')+`_${settings.driver}_${settings.model.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        if (filename.startsWith('"') && filename.endsWith('"')) filename = filename.slice(1, -1); // "file name" is possible
        mkdir(RC_HISTORY_PATH, { recursive: true }).catch(_ => {});

        let content = '';
        if (exportType == 'json') {
            if (!filename.toLowerCase().endsWith('.json')) filename += '.json';
            content = JSON.stringify({ version: settings.version, historyStyle: drivers[settings.driver]!.historyStyle, history}, null, 2);
        }
        else if (exportType == 'md') {
            if (!filename.toLowerCase().endsWith('.json')) filename += '.md';
            //content =  a flattened object, where all keys that do not have a child, will be inlcuded
            let contentStrings:string[] = [];
            function walk(obj:Record<string, any>) {
                if (obj['role']) contentStrings.push(obj['role']); // output first
                for (const key in obj) {
                    if (key === 'role') continue;
                    if (typeof obj[key] === 'string') {
                        contentStrings.push(obj[key]);
                    } else {
                        walk(obj[key]);
                    }
                }
            }
            walk(history);
            contentStrings = [
                `   ---
                    title: Baio context export
                    description: Readable context as markdown
                    editor: markdown
                    dateCreated: ${(new Date()).toISOString()}
                    ---
                `.trimBlock(),
                ...contentStrings
                    // remove unnecessary strings
                    //.filter(item => !['...'].includes(item))
                    // add headers for each section by role (google can have multiple messages per role)
                    //   text becomes header by having --- directly below it, no need for extra hashes
                    .map(item => ['user',   'library', 'model', 'assistant'].includes(item) ? '\n'.repeat(1) + `**${item}:**\n` : '\n'.repeat(3) + item + '\n'.repeat(3))
                    // remove ansi escape codes (cli output colors and alike)
                    .map(item => item.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, ''))
            ];

            // add separators
            content = contentStrings.join( '-'.repeat(30) );

            console.log(`⚠️ This type of history can NOT be imported and is only for viewing.`);
        }

        const historyPath = path.join(RC_HISTORY_PATH, filename);

        let saved = await writeFile(historyPath, content, 'utf-8').then(_ => true).catch(e => e.message);

        if (saved !== true)
            console.error(colors.red(figures.cross), `Failed to save history to ${historyPath}: ${saved}`);
        else {
            console.log(`💾 Exported history to ${historyPath}`);

            if (exportOpenType === 'view') launchEditor(historyPath);
        }
        return true;
    }
    if (trigger === '/history:import' || trigger === ':hi') {
        let filename = prompt.text.split(/(?<!\\)\s+/).filter(arg => arg.length > 0).slice(1).join(' ').trim();
        await importHistory(filename);
        return true;
    }
    if (trigger === '/history:clear' || trigger === ':hc') {
        const key = prompt.text.split(/(?<!\\)\s+/)[1];
        const historyOldLength = history.length;
        if (key) {
            const num = parseInt(key);
            if (Number.isNaN(num)) {
                console.error(colors.red(figures.cross), `Not a number: ${key}`);
                return true;
            }
            // (-3) => lenght-3 to length
            // (0, -1) => 0 to length-1
            history = num < 0 ? history.slice(0, /* is negative */ num) : history.slice(-num);
            if (num < 0 && history.length > 0)
                console.log(colors.green('') +`🗑️ Last ${colors.green((-num).toString())} history entries removed (${colors.blue(historyOldLength.toString())} → ${colors.blue(history.length.toString())}). Last entry now is from: ${colors.green(history[history.length-1]?.role ?? '')}`);
            else 
                console.log(`🗑️ History cleared (${colors.blue(historyOldLength.toString())} → ${colors.blue(history.length.toString())}).`);
        }
        else {
            history = [];
            console.log(`🗑️ History cleared.`);
        }
        return true;
    }
    if (trigger === '/:clear' || trigger === ':c') {
        history = [];
        prompt.text = '';
        prompt.additions = undefined;
        if (resultPrompt) {
            resultPrompt.answer = '';
            resultPrompt.answerFull = '';
            resultPrompt.commands = [];
            resultPrompt.needMoreInfo = true;
            resultPrompt.isEnd = false;
        }
        console.log(`🗑️ History cleared, current prompt cleared.`);
        return true;
    }
    let pasteContent: string|undefined = undefined;
    if (trigger === '/clip:read' || trigger === ':cr' || trigger === ':r+' || prompt.text === ':r +') {
        pasteContent = await clipboard.paste() || '';
        if (!pasteContent) {
            console.log(colors.red(figures.cross), `Failed to read anything from clipboard`);
            return true;
        }
        console.log(`📋 Read from clipboard`);
    }
    if (trigger === '/:read' || trigger === ':r' || pasteContent) {
        const value = await editor({
            message: 'Waiting for your input in the editor.',
            waitForUseInput: false,
            default: pasteContent ?? '',
            theme: { style: { help: () => `Enter your multiline content in the editor, save the file and close it.`, } }
        }, TTY_INTERFACE).catch(_ => undefined);
        if (value) {
            prompt.text = value || '';
            return false;
        }
        return true;
    }
    if (trigger === '/clip:write' || trigger === ':cw' || trigger === ':w+' || prompt.text === ':w +') {
        clipboard.copy(resultPrompt?.answerFull ?? '');
        console.log(`📋 Copied to clipboard`);
        return true;
    }
    if (trigger === '/:write' || trigger === ':w') {
        if (!resultPrompt?.answerFull) {
            console.log(colors.red(figures.cross), `There is nothing from a previous AI response`);
            return true;
        }
        await editor({
            message: 'Waiting for you to close the editor.',
            waitForUseInput: false,
            theme: { style: { help: () => ``, } },
            default: resultPrompt.answerFull,
            postfix: '.md',
        }, TTY_INTERFACE).catch(_ => undefined);
        return true;
    }
    if (trigger === '/file:add' || trigger === ':f') {
        const key = prompt.text.split(/(?<!\\)\s+/).filter(arg => arg.length > 0).slice(1).join(' ').trim();
        let filename = key || (await fileSelector( { message: 'Select a file to add:', allowCancel: true }, TTY_INTERFACE) ?? '');
        if (filename === 'canceled') filename = '';
        if (!filename) { console.error(colors.red(figures.cross), 'No file selected'); return true; }        
        if (filename.startsWith('"') && filename.endsWith('"')) filename = filename.slice(1, -1); // "file name" is possible

        let promptAdditions = await addFile(prompt.additions, filename);
        if (!promptAdditions) return true;

        prompt.additions = promptAdditions;
        return true;
    }

    if (trigger === '/:cmds' || trigger === '::') {
        return true;
    }

    if (trigger === '/:exit' || trigger === '/:quit' || trigger === ':q') {
        if (PROCESS_PATH_INITIAL !== process.cwd()) console.log(colors.green(figures.info), `I was last working in: ${process.cwd()}`);
        process.exit(0);
    }

    // default
    return false;
}


/**
 * Calculates the number of lines a choice list should have based on the terminal size.
 * @param metaLines how many lines of metadata should be shown above and below the choice list
 * @param defaultLines the default number of lines to use if no output is available
 * @param minimumLines the minimum number of lines to use, no matter how large the terminal is
 * @returns the number of lines to use for the choice list
 */
function choiceAmount(metaLines:number, defaultLines: number = 10, minimumLines: number = 1): number {
    let output = TTY_INTERFACE.output || process.stdout;

    let lines = output?.rows ? Math.max(minimumLines, output.rows - metaLines) : defaultLines;
    return lines;
}


/**
 * Allows the user to configure some settings in an interactive way.
 * @param options array of strings, each one a setting name to change
 * @returns nothing, the menu is closed
 */
async function config(options: string[]|undefined, prompt: Prompt): Promise<void> {
    const OPTS =  {clearPromptOnDone: true, ...TTY_INTERFACE};
    let done = false;
    let lastSelection = '';
    let updateSystemPrompt = false;
    let settingsBak = {...settings};
    let canceled = false;

    do {
        options = options && options.length 
            ? options 
            : [
                await selectWithActions({ message: `Settings:`, choices: [
                    new Separator(),
                    { value: 'done', name: colors.bold('done'), description: 'Close the settings menu' },
                    new Separator(),

                    { value: 'driver', name: `AI Driver: ${colors.blue(drivers[settings.driver]?.name ?? 'unknown')}  ${ settings.driver !== 'ollama' ? (colors.italic(drivers[settings.driver]?.apiKey() ? colors.green('(API key found)') : colors.red('(no API key found)'))) : ''}`,
                        description: 'Select an AI driver for your provider. API key and URL are configured with environment variables.' },
                    { value: 'model', name: `AI Model: ${colors.blue(settings.modelName || settings.model || (drivers[settings.driver]?.defaultModel ? colors.italic(colors.dim('(default: ' + drivers[settings.driver]?.defaultModel + ')')) : undefined) || '')}`,
                        description: 'Select an AI model for your provider.' },
                    { value: 'temperature', name: `AI Temperature: ${settings.temperature !== 0 ? colors.blue(settings.temperature.toString()) : colors.italic(colors.dim('(default)'))}`,
                        description: 'Select a temperature for the models creativity.' },
                    { value: 'useAllSysEnv', name: `Use all system environment variables: ${colors.blue(settings.useAllSysEnv ? colors.green('yes') : colors.red('no'))}`,
                        description: 'Allow to use all environment variables in the prompt.' },
                    { value: 'endIfDone', name: `End if assumed done: ${colors.blue(settings.endIfDone ? colors.green('yes') : colors.red('no'))}`,
                        description: 'End the prompt if the answer is assumed done. Good if you have single tasks to be done.' },
                    { value: 'autoExecKeys', name: `Auto execute if commands match: ${colors.blue(settings.autoExecKeys.join(', '))}`,
                        description: 'Auto execute if commands match.' },
                    { value: 'allowGeneralPrompts', name: `Allow general prompts: ${colors.blue(settings.allowGeneralPrompts ? colors.green('yes') : colors.red('no'))}`,
                        description: 'Allow to answer general questions, this will also allow to loose the ultimate focus on creating commands.' },
                    { value: 'saveSettings', name: `Automatically use the same settings next time: ${colors.blue(settings.saveSettings ? colors.green('yes') : colors.red('no'))}`,
                        description: 'Save the settings and automatically use the same settings next time.' },

                    ...(!DEBUG_SYSTEMPROMPT ? [] : [
                        new Separator(),
                        { value: 'systemPrompt', name: 'Edit System Prompt' },
                    ]),
                    
                    new Separator(),

                    // for each file, there is a prompt about the filename => length / 2  //! TODO do not just devide by 2, but check content
                    { value: 'addFile', name: `Add a file ${colors.italic(colors.dim(`(currently: ${(prompt?.additions?.length ? prompt.additions.length / 2 : 0)})`))}`, description: 'Add a text or image file to the prompt.' },

                    { value: 'importAgent', name: `Select agents${!settings.agentNames.length ? '' : ': ' + colors.blue(settings.agentNames?.join(', ') ?? '')}`, description: 'Select agents to use for the prompt.' },
                    { value: 'importHistory', name: 'Import context from history files', description: 'Import a context from a history file. Good to continue a conversation.' },
                    
                ],
                keypressHandler: async function({key, rl}) {
                    if (key.name == 'escape') {
                        canceled = true;   // let us know, that we should not care about the values
                        return {
                            isDone: true,
                            isConsumed: true,
                        }
                    }
                },
                default: lastSelection, pageSize: choiceAmount(6) }, OPTS)
            ];
        
        if (canceled) {
            settings = settingsBak;
            options = undefined;
            return; // prevent triggering save at the end
        }
        
        if (options.includes('driver')) {
            const hasArg = !!settingsArgs['driver'],
                  forceSelection = settingsArgs['driver'] === '*';
            delete settingsArgs['driver'];
            if (settings.driver === '*') settings.driver = settingsSaved?.driver || ''; // allow default

            let driverChoices = Object.keys(drivers).map(key => ({ name: drivers[key]?.name, value: key }));
            if (!hasArg || forceSelection) {
                let canceled = false;
                settings.driver = await selectWithActions({ message: 'Select your AI provider API driver:', choices: driverChoices, default: settings.driver || 'ollama',
                    instructions: {
                        navigation: `Press ${colors.bold(colors.cyan('<enter>'))} to select, or ${colors.bold(colors.cyan('<esc>'))} to cancel`, 
                        pager: `Use arrow keys to reveal more choices, press ${colors.bold(colors.cyan('<enter>'))} to select, or ${colors.bold(colors.cyan('<esc>'))} to cancel)`
                    },
                    keypressHandler: async function({key}) {
                        if (key.name == 'escape') {
                            canceled = true;
                            return {
                                isDone: true, // tell the element to exit and return selected values
                                isConsumed: true, // prevent original handler to process this key
                            }
                        }
                    }, }, OPTS);
                if (canceled) settings.driver = settings.driver || 'ollama';
                
                if (!settingsArgs['model'] && !canceled) {
                    // force to choose a new one
                    settings.model = ''; 
                    settings.modelName = '';
                    options.push('model');
                }
            }
            if (!drivers[settings.driver]) {
                console.warn(colors.yellow(figures.warning), `No driver named "${settings.driver}" found. Reverting to driver: ${settingsSaved?.driver || settingsDefault.driver}`);
                settings.driver = settingsDefault.driver;
            }
            
        }

        if (options.includes('model')) {
            const hasArg = !!settingsArgs['model'],
                  forceSelection = settingsArgs['model'] === '*';
            delete settingsArgs['model'];
            if (settings.model === '*') settings.model = settingsSaved?.model || ''; // allow default

            let driver:Driver = drivers[settings.driver]!;
    
            let styleModels = (models: InquirerSelection) => {
                models = models.map(({name, value}) => ({name: name.replace(/([^(]*)(.*)/, ('$1 ') + colors.dim('$2')).replace('[THINKING]', colors.blue('[THINKING]')), value}));
                models.push({ name: colors.green('manual input ...'), value: '' });
                return models;
            }
            let models = await getModels();
            let modelSelected = '';
            if (models.length) {
                models = styleModels(models);
                let modelListSimple = false;
                let options: any;
                let canceled = false;
                modelSelected = hasArg && !forceSelection 
                    ? settings.model 
                    : await selectWithActions(options={ message: 'Select your model:', choices: models, default: settings.model || driver.defaultModel,
                        instructions: {
                            navigation: `Press ${colors.bold(colors.cyan('<enter>'))} to select, or ${colors.bold(colors.cyan('<space>'))} to switch details, or ${colors.bold(colors.cyan('<esc>'))} to cancel`, 
                            pager: `Use arrow keys to reveal more choices, press ${colors.bold(colors.cyan('<enter>'))} to select, or ${colors.bold(colors.cyan('<space>'))} to switch details, or ${colors.bold(colors.cyan('<esc>'))} to cancel)`
                        },
                        //@ts-expect-error
                        keypressHandler: async function({key}) {
                            // only allow switching to commands selection, if there are commands
                            if (isSpaceKey(key)) {
                                modelListSimple = !modelListSimple;

                                if (!modelListSimple) {
                                    options.choices = models;
                                }
                                else {
                                    let driver:Driver = drivers[settings.driver]!;
                                    let modelsSimple = await driver.getModels(settings, false);
                                    if (modelsSimple.length)
                                        options.choices = modelsSimple
                                            .map(({name, value}) => ({name: util.inspect(JSON.parse(name), { compact: true, showHidden: false, depth: null, colors: true }).replaceAll('\n', '') +'\n', value}));
                                    
                                }
                                return {
                                    needRefresh: true,
                                }
                            }

                            if (key.name == 'escape') {
                                canceled = true;
                                return {
                                    isDone: true, // tell the element to exit and return selected values
                                    isConsumed: true, // prevent original handler to process this key
                                }
                            }

                        }, pageSize: choiceAmount(3) }, OPTS);
                if (canceled) modelSelected = settings.model || driver.defaultModel;
                settings.modelName = models.find(({value}) => value === modelSelected)?.name || '';
            }
            // if it was used from select, we do not need to check
            let isModelSelectedInModels = !hasArg || (hasArg && forceSelection) || models.find(({value}) => value === modelSelected) !== undefined;

            // model has no name but driver is ollama => it is a manual input und lead to downloading when used
            if (!isModelSelectedInModels && settings.driver === 'ollama') {
                // do no logic
                console.log('⚠️ The model will be downloaded when used and this process might really take a while. No progress will be shown.');
            }
            // arg was used and model was not found
            else if (hasArg && !forceSelection && !isModelSelectedInModels) {
                console.warn(colors.yellow(figures.warning), `No model named "${modelSelected}" found. Reverting to model: ${settingsSaved?.model || driver.defaultModel}`);
                modelSelected = settingsSaved?.model || driver.defaultModel;
                settings.modelName = settingsSaved?.modelName || '';
            }
            // no models in list or no model was selected
            if (!models.length || !modelSelected) {
                let msg = (settings.driver == 'ollama') ?
                    '⚠️ The model you enter, will be downloaded when used and this process might really take a while. No progress will be shown.\n  ' : '';
                modelSelected = await input({ message: msg + 'Enter your model to use:', default: settings.model || driver.defaultModel,  }, OPTS);
                settings.modelName = '';
            }
            settings.model = modelSelected;
        }

        if (options.includes('addFile') && prompt) {
            let filename = await fileSelector( { message: 'Select a file to add:', allowCancel: true}, OPTS) ?? '';
            if (filename === 'canceled') filename = '';
            if (filename) {
                if (filename.startsWith('"') && filename.endsWith('"')) filename = filename.slice(1, -1); // "file name" is possible
        
                let promptAdditions = await addFile(prompt.additions, filename);
                if (promptAdditions) prompt.additions = promptAdditions;
            }
        }

        if (options.includes('importAgent'))  {
            const hasArgs = !!settingsArgs['agent']?.length,
                  forceSelection = settingsArgs['agent']?.[0] === '*';
            delete settingsArgs['agent']; // processed
    
            const agents = await getAgents();
    
            if (!agents.length)
                await input({ message: 'No agents found. Press enter to continue', default: '', theme: {prefix: colors.bold(colors.red(figures.cross))} }, OPTS);
            else 
                settings.agentFiles = hasArgs && !forceSelection
                    ? agents.map(({value}) => value) // getAgents returned only the requested ones
                    : await checkbox({ message: 'Select agents:', choices: agents}, OPTS);
            
            settings.agentNames = agents.filter(({value}) => settings.agentFiles.includes(value)).map(({name}) => name);
            options.push('updateSystemPrompt');
        }

        if (options.includes('importHistory'))
            await importHistory('', true);
        
        if (options.includes('systemPrompt')) {
            settings.systemPrompt = await input({ message: 'Enter your system prompt', default: settings.systemPrompt }, OPTS);
            options.push('updateSystemPrompt');
        }
    
        if (options.includes('temperature')) {
            if (!isNaN(Number(settings.temperature)))
                settings.temperature = Number(settings.temperature) 
            else {
                console.error(colors.red(figures.cross), 'temperature must be a number, not', typeof settings.temperature + ':', settings.temperature);
                settings.temperature = 0;
            }

            if (!settingsArgs['temperature']) //? Number('') === Number(' ') === 0 ... WTF.
                settings.temperature = (await input({ message: 'Enter the AI temperature:', default: settings.temperature.toString(), validate: x => !isNaN(Number(x)), theme: {style: {defaultAnswer: (text:string) => text + ' ' + colors.dim(`(0 for model\'s default. Typically: 0.1 (factual), to 1.0 (creative) or 2.0)`) }} }, OPTS).then(answer => parseFloat(answer)) ?? settings.temperature) || 0;
            else
                delete settingsArgs['temperature']; // processed
        }
            
        if (options.includes('useAllSysEnv')) {
            settings.useAllSysEnv = await toggle({ message: 'Use all system environment variables:', default: settings.useAllSysEnv }, OPTS);
            options.push('updateSystemPrompt');
        }
            
        if (options.includes('endIfDone'))
            settings.endIfDone = await toggle({ message: 'End if assumed done:', default: settings.endIfDone }, OPTS);
    
        if (options.includes('autoExecKeys'))
            settings.autoExecKeys = await checkboxWithActions({ message: 'Auto execute, if commands match:', choices: AUTOEXEC_KEYS.map(key => ({ name: key, value: key, checked: settings.autoExecKeys.includes(key) }))}, OPTS);
        
        //allowGeneralPrompts
        if (options.includes('allowGeneralPrompts')) {
            settings.allowGeneralPrompts = await toggle({ message: 'Allow general prompts:', default: settings.allowGeneralPrompts,  }, OPTS);
            options.push('updateSystemPrompt');
        }

        if (options.includes('saveSettings'))
            settings.saveSettings = await toggle({ message: `Automatically use the same settings next time:`, default: settings.saveSettings }, OPTS);


        {//* The final steps are handled at the end of the loop
            if (options.includes('updateSystemPrompt')) updateSystemPrompt = true; // persist for multiple loops. using options allows it to be set from outside config()
            done = options.includes('done'); // done is done.
            lastSelection = options?.filter(option => option !== 'updateSystemPrompt').pop() ?? ''; // last selection if returned to menu from sub item
            //* very last step ---
            options = undefined; // all options have been processed
        }
    } while (!done);

    if (updateSystemPrompt) await makeSystemPromptReady(); // redo the system prompt
    await saveSettings(); // has a check inside, if it really is allowed to save the settings
}


/**
 * Saves the current settings to a configuration file if certain conditions are met.
 *
 * This function will save settings under the following conditions:
 * 1. If the 'reset-prompts' argument is set and there are previously saved settings.
 * 2. If the 'update' argument is provided.
 * 3. If the 'saveSettings' option is enabled.
 * 4. If there are no existing saved settings.
 * 
 * The function filters out any settings that are blacklisted before saving.
 * It also ensures that there are actual differences between the current and saved settings
 * before performing the save operation.
 * 
 * The settings are saved to a specified RC_FILE in JSON format.
 */
async function saveSettings(): Promise<void> {
    // write settings if it is asked for, or if it is not asked for but already saved to remove it
    if ((settingsArgs['reset-prompts'] && settingsSaved !== undefined) || (settingsArgs['saveSettings'] ?? (settings.saveSettings || (!settings.saveSettings && settingsSaved)))) {

        let settingsFiltered: Partial<Settings> = Object.fromEntries(Object.entries(settings).filter(([key]) => !SETTINGS_BLACKLIST.includes(key as keyof Settings as never)));

        // make extra sure, there is a difference between settings and saveSettings or param was used to save
        let isDiff = settingsSaved === undefined || settingsArgs['saveSettings'] || Object.keys(settingsFiltered).reduce((acc, key) => acc || isSettingsKey(key) && settingsFiltered[key] !== settingsSaved![key], false);

        if (isDiff) {
            let saveData = settingsArgs['saveSettings'] ?? settings.saveSettings;
            if (saveData) {
                spinner.start(`Updating settings in ${RC_FILE} ...`);
                await writeFile(RC_FILE, JSON.stringify(settingsFiltered, null, 2), 'utf-8');
                settingsSaved = settingsFiltered; // update internal saved settings
            }
            else {
                spinner.start(`Removing ${RC_FILE} ...`);
                await rm(RC_FILE).catch(_ => undefined);
                settingsSaved = undefined; // clear saved settings
            }
            spinner.success();
        }
    }
}


/**
 * Prepares the system prompt by incorporating environment variables and agent content.
 *
 * This function reads agent files and integrates their content into the system prompt. It replaces placeholders in the
 * `settings.systemPrompt` with actual environment variable values and agent contents. The placeholders include system
 * details such as username, OS, architecture, and more. If the `precheckLinksInstalled` setting is enabled, it checks
 * if the `links2` tool is installed and updates the prompt accordingly. The final prepared prompt is stored in
 * `settings.systemPromptReady`.
 */
async function makeSystemPromptReady(): Promise<void> {
    let agentContent = '';
    {//* agent
        if (settings.agentFiles.length) {
            for (const agentFile of settings.agentFiles) {
                let agentContentFile = await readFile(agentFile, 'utf-8').catch(_ => undefined);
                // get from file content the content from after the second '---' if available or everything from the beginning (if formating is broken)
                if (agentContentFile !== undefined)
                    agentContent += settings.agentPrompt + '\n' + (agentContent ? '\n---\n' : '') + (agentContentFile?.split('---\n')?.[2] || agentContentFile);
            }
        }
    }

    {//* system prompt
        settings.systemPromptReady = settings.systemPrompt;

        [
        // general prompt additions
            ['{{generalPrompt}}', settings.allowGeneralPrompts ? settings.generalPrompt : ''],

        // always apply consts here, otherwise they would be saved and this be hard coded
            ['{{process_env_USERNAME}}', process.env.USERNAME!],
            ['{{process_env_OS}}', process.env.OS!],
            ['{{process_platform}}', process.platform],
            ['{{process_arch}}', process.arch],
            ['{{process_env_COMPUTERNAME}}', process.env.COMPUTERNAME!],
            ['{{process_env_SHELL}}', process.env.SHELL ?? process.env.COMSPEC!],
            ['{{process_env_POSH_SHELL}}', process.env.POSH_SHELL!],
            ['{{process_env_POSH_SHELL_VERSION}}', process.env.POSH_SHELL_VERSION!],
            ['{{process_env_HOME}}', process.env.HOME ?? process.env.USERPROFILE!],
            ['{{process_cwd}}', process.cwd()],

        // AI info
            ['{{currentDriver}}', (drivers[settings.driver]?.name ?? settings.driver) || 'unknown'],
            ['{{currentModel}}', settings.modelName || (settings.model ?? drivers[settings.model]?.defaultModel) || 'unknown'],

        // apply invoking shell to system prompt
            ['{{invokingShell}}', getInvokingShell() ?? 'unknown'],

        // apply system env to system prompt or clean up the placeholder
            ['{{useAllSysEnv}}', settings.useAllSysEnv ? `- You are running on (system environment): ${JSON.stringify(process.env)}` : ''],

            ['{{promptCommands}}', Object.values(promptCommands).map(cmd => cmd.prompt).join('\n').split('\n').filter(line => line?.trim() !== '').join('\n').replace(/\n+/g, '\n').trim() ],

            ['{{useAgent}}', agentContent ? `---\n${agentContent}\n---\n` : ''],
        ].forEach(([placeholder, value]) =>
            settings.systemPromptReady = settings.systemPromptReady.replaceAll(placeholder!, value!)
        );

        // allow any other env, if the user modified the prompt - these key names are NOT preceeded with `process_env_` !
        Object.entries(process.env).forEach(([key, value]) => settings.systemPromptReady.replaceAll(`{{${key}}}`, value!));

        if (settings.precheckLinksInstalled) {
            try {
                let output = execSync('links -version', { shell: getInvokingShell() });
                settings.systemPromptReady = settings.systemPromptReady.replaceAll('{{linksIsInstalled}}', '- links2 is installed and can be used: ' + output);
                DEBUG_OUTPUT && console.log(colors.green(figures.tick), 'links2 is installed');
            }
            catch (error) {
                settings.systemPromptReady = settings.systemPromptReady.replaceAll('{{linksIsInstalled}}', '- links2 is not yet installed');
                DEBUG_OUTPUT && console.warn(colors.yellow(figures.cross), 'links2 is not installed');
            }
        }
        else
            settings.systemPromptReady = settings.systemPromptReady.replaceAll('{{linksIsInstalled}}', '- links2 is not available.');  //? '- you need to check if links2 is installed');

        DEBUG_OUTPUT_SYSTEMPROMPT && console.log('DEBUG\n', 'systemPrompt:', settings.systemPromptReady);
    }
}


/**
 * Initializes the prompt by asking the user for settings and returns the prompt
 * @returns the prompt
 */
async function init(): Promise<Prompt> {
    let askSettings = settingsArgs['settings'] ?? settingsArgs['ask'] ?? (process.env.ASK_SETTINGS || !settings.saveSettings);
    if (settingsArgs['reset-prompts'] === true) { askSettings = settingsArgs['ask'] ?? false; settingsArgs['config'] = settingsArgs['config'] ?? true; } // do not ask for settings and prompt, if we are resetting the prompts so the other commands are not needed
    let prompt: Prompt = {text: '', additions: []};
    let specificOptions: string[] = [];


    //*** args with exit ***


    if (settingsArgs['version'])
    {
        console.info(packageJSON.version);
        process.exit(0);
    }

    if (settingsArgs['open'])
    {
        console.info(packageJSON.name,'v' + packageJSON.version);

        switch (settingsArgs['open']) {

            // launchEditor: open files that do no exist is not possible
            // https://github.com/yyx990803/launch-editor/issues/93

            case 'env':
                if (!fs.existsSync(RC_ENVFILE)) writeFile(RC_ENVFILE, '# To enable the Google API (GEMINI) key, remove the "#" and enter a correct key\n#GEMINI_API_KEY=abcdefg1234567890', 'utf-8');
                console.info(colors.green(figures.info), `Opening ${RC_ENVFILE}`);
                launchEditor(RC_ENVFILE);
                break;

            case 'settings':
            case 'config':
                if (!fs.existsSync(RC_FILE)) {
                    console.error(colors.red(figures.cross), `You have to run at least once and choose to 'Automatically use same settings next time' or use --update, for ${RC_FILE} to exist`);
                    process.exit(1);
                }
                console.info(colors.green(figures.info), `Opening ${RC_FILE}`);
                launchEditor(RC_FILE);
                break;

            //? special hidden case, will only work if an editor is open that supports opening folders, like vscode / sublime / textwrangler
            case 'pathfiles': 
                mkdir(RC_PATH, { recursive: true }).catch(_ => {});
                console.info(colors.green(figures.info), `Opening ${RC_PATH}`);
                launchEditor(RC_PATH);
                break;

            case 'agents':
                mkdir(RC_AGENTS_PATH, { recursive: true }).catch(_ => {});
                console.info(colors.green(figures.info), `Opening ${RC_AGENTS_PATH}`);
                await open(RC_AGENTS_PATH); // await does not wait for subprocess to finish spawning
                await setTimeout(1000); // windows explorer needs some time to start up ...
                break;

            case 'history':
                mkdir(RC_HISTORY_PATH, { recursive: true }).catch(_ => {});
                console.info(colors.green(figures.info), `Opening ${RC_HISTORY_PATH}`);
                await open(RC_HISTORY_PATH); // await does not wait for subprocess to finish spawning
                await setTimeout(1000); // windows explorer needs some time to start up ...
                break;

            default:
                console.error(colors.red(figures.cross), `Unknown option: ${settingsArgs['open']}`);
        }

        // give launchEditor a chance to spawn the editor proccess
        await setTimeout(100);
        process.exit(0);
    }

    if (settingsArgs['help'])
    {
        console.info(colors.bold(`${packageJSON.name} v${packageJSON.version}`));
        console.info(packageJSON.description);
        console.info('');
        console.info(colors.dim( `Copyright (c) ${new Date().getFullYear()} ${packageJSON.author.name} <${packageJSON.author.email}>`) );
        console.info(colors.dim( `License: ${packageJSON.license}, ${packageJSON.homepage}`) );
        console.info('\n');

        await checkUpdateOutput() && console.info('\n');

        console.info(colors.bold('baio'), colors.dim('[-vhdmtaseifucr]'), colors.dim('["prompt string"]'));

        const helpText = `
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
        `.trimBlock(2);
        // You can pipe in text (like from a file) to be send to the API before your prompt.

        const colorizeHelp = (text: string): string => {
            const tokenRegex = /(-[\w?]|--[\w-]+|<[^>]+>|\*|[\d.]+)/g;
            const colorizeToken = (tokenMatch: string): string => {
                if (tokenMatch.startsWith('-') || tokenMatch.startsWith('--')) return colors.bold(tokenMatch);
                else if (tokenMatch === '*') return colors.blue(tokenMatch);
                else if (tokenMatch.startsWith('<') && tokenMatch.endsWith('>')) return colors.yellow(tokenMatch);                
                return tokenMatch;
            };
            return text.split('\n').map(line => line.replace(tokenRegex, colorizeToken)).join('\n');
        };
        console.log(colorizeHelp(helpText));

        console.info('');
        console.info(colors.bold('Settings config path:'), RC_FILE);
        console.info(colors.bold('Environment config path:'), RC_ENVFILE);
        console.info(colors.bold('Agents config path:'), RC_AGENTS_PATH);
        console.info(colors.bold('History config path:'), RC_HISTORY_PATH);

        process.exit(0);
    }

    if (askSettings)
    {
        console.log(`${packageJSON.name}, v${packageJSON.version}`);
        console.log('ℹ️ use CTRL + D to exit at any time.\n');
    }

    {//* new update info
        if (settings.precheckUpdate)
            await checkUpdateOutput();
    }

    
    //*** initialize for content ***


    {//* read piped in input
        const stdin = process.stdin;
        if (!stdin.isTTY) {
            stdin.setEncoding('utf8');
            const additionalContentData = await new Promise<string>(resolve => {
                let data = '';
                stdin.on('data', (chunk) => data += chunk);
                stdin.on('end', () => resolve(data));
            });

            if (additionalContentData) {
                //***! NEEDS FIXING */
                // issue:  https://github.com/SBoudrias/Inquirer.js/issues/1721
                console.error(colors.red(figures.warning + ' Piping files into Baio will cause problems with the prompt.'));
                if (askSettings) {
                    console.error(colors.yellow(figures.warning), 'Editing settings is disabled.');
                    askSettings = false;
                }

                prompt.additions = [ ...(prompt.additions ?? []), { type: 'text', content: additionalContentData }];
            }

            //? restore input capability
            const fd = process.platform === 'win32' ? '\\\\.\\CON' : '/dev/tty';
            let stdinNew = (await fsOpen(fd, 'r')).createReadStream();
            // const readLineNew = createInterface({
            //     input: stdinNew,
            //     output: process.stdout
            // });
            TTY_INTERFACE = {
                input: stdinNew,
                output: process.stdout
            };
        }
    }

    {//* handle files from arguments
        if (settingsArgs['file']) {
            for (const filename of settingsArgs['file']) {
                let result = await addFile(prompt.additions, filename);
                if (result !== null) prompt.additions = [ ...(prompt.additions ?? []), ...result!];
            }
        }
    }


    //*** settings ***


    {//* these need to be here, since they could be * or need further processing and a simple arg-value to settings-value does not work
        if (settingsArgs['driver'])
            specificOptions = [...specificOptions, 'driver', 'done'];

        if (settingsArgs['model'])
            specificOptions = [...specificOptions, 'model', 'done'];

        if (settingsArgs['import'])
            specificOptions = [...specificOptions, 'importHistory', 'done'];

        if (settingsArgs['agent'])
            specificOptions = [...specificOptions, 'importAgent', 'done'];

        if (settingsArgs['temperature'])
            specificOptions = [...specificOptions, 'temperature', 'done'];
    }
    
    {//* trigger the configuration
        // force settings menu to show (first it does the specificOptions above, then it shows the menu because the 'done' flag was removed)
        if (settingsArgs['ask'] || settingsArgs['settings'])
            specificOptions = specificOptions.filter(key => key !== 'done');
        
        if (askSettings || specificOptions.length)
            await config(specificOptions, prompt);
    }

    {//* save settings
        // write settings if it is asked for, or if it is not asked for but already saved to remove it
        await saveSettings();
    }


    //*** tests ***/


    {//* api key test
        if (settings.driver !== 'ollama' && !drivers[settings.driver]?.apiKey()) {
            console.error(colors.red(figures.cross), colors.red(`${drivers[settings.driver]?.name ?? settings.driver} has no API key configured in the environment.`));
            console.info(colors.blueBright(figures.info), `You can run '${packageJSON.name} --open env' to open the environment file and enter your API key.`);
            process.exit(1);
        }
    }
    
    {//* connection test
        if (settings.precheckDriverApi) {
            let driver:Driver = drivers[settings.driver]!;
            askSettings && spinner.start(`Connecting to ${driver.name} ...`);
            const connection = await doConnectionTest();
            
            if (!connection) {
                if (!askSettings) spinner.start(); // otherwise there is nothing shown
                spinner.error(`Connection to ${driver.name} ( ${driver.getUrl(driver.urlTest)} ) failed!`);
                process.exit(1);
            }
            else {
                spinner.success(`Connection to ${driver.name} possible.`);
            }
        }
    }

    {//* check if prompt is actually required
        if (settingsArgs['config']) { await setTimeout(100); process.exit(0); }  //! THIS NEEDS TO CONTAIN A TIMEOUT TO FIX A NODEJS ISSUE: https://github.com/nodejs/node/issues/56645
    }

    
    //*** now its execution time ***


    {//* import context from history files
        if (settingsArgs['import'])
            await importHistory(settingsArgs['import'] !== '*' ? settingsArgs['import'] : '');
            
    }
    
    {//* import agent and set params in systemprompt
        await makeSystemPromptReady();
    }

    return prompt;
}


//* MAIN
{
    let prompt:Prompt = await init();
    let resultPrompt: PromptResult|undefined = undefined;


    while (true) {
        let resultPromptRet: string|undefined;
        do {
            resultPromptRet = await doPromptWithCommands(resultPrompt);
            if (resultPromptRet !== undefined) prompt.text = resultPromptRet;
        }
        while (resultPromptRet === undefined || await promptTrigger(prompt, resultPrompt));

        resultPrompt = await doPrompt(prompt);
        
        if (settings.endIfDone && resultPrompt.isEnd) break;
    }


    DEBUG_OUTPUT && console.log(resultPrompt);

    if (PROCESS_PATH_INITIAL !== process.cwd()) console.log(colors.green(figures.info), `I was last working in: ${process.cwd()}`);

    process.exit(0); // make sure, we exit the process (and no open pipe is blocking it)
}