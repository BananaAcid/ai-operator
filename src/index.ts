/**
 * BAIO - A simple AI operator for the CLI, for any LLM
 * 
 * @author Nabil Redmann <repo@bananaacid.de>
 * @license MIT
 */

//* node imports
import packageJSON from '../package.json' with { type: 'json' };
import { exec } from 'node:child_process';
import path from 'node:path';
import { writeFile, readFile, unlink, glob, mkdir, open as fsOpen } from 'node:fs/promises';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import fs from 'node:fs';

import cliMd from 'cli-markdown';
import launchEditor from 'launch-editor';
import open from 'open';
import clipboard from 'copy-paste/promises.js';
import mime from 'mime';

import colors from 'yoctocolors-cjs'; // installed by @inquirer/prompts
import figures from '@inquirer/figures'; // installed by @inquirer/prompts
import { input, select, editor } from '@inquirer/prompts';
import checkboxWithActions from './libs/checkbox-with-actions.ts';
import { default as tgl } from 'inquirer-toggle';
//@ts-ignore
const toggle = tgl.default;

import isUnicodeSupported from 'is-unicode-supported';  //  as long as yoctoSpinner has a hardcoded check
import cliSpinners from 'cli-spinners'; // imported by @inquirer/core
import yoctoSpinner from 'yocto-spinner';
const spinner = yoctoSpinner({text: '', ...(isUnicodeSupported() ? {spinner: cliSpinners.dots} : {})}); // do not care about non-unicode terminals, always force dots


//* (try to) handle errors
// catch ctrl+c and show no error on exit, fix it for the toggle prompt
process.on('uncaughtException', (error) => { if (error instanceof Error && (error.name === 'ExitPromptError' || error.message.indexOf('User force closed the prompt') >= 0)) { /*console.log('👋 until next time!');*/ } else { console.error('🛑', error.name + ':', error.message); /* Rethrow unknown errors */ throw error; } });
//process.on('warning', (warning) => { if (warning.message.indexOf('unsettled top-level await') == -1) console.warn(warning.name, warning.message); });
//process.removeAllListeners('warning');


//* File + Paths
const RC_ENVFILE = path.join(os.homedir(), '.baioenvrc');
const RC_FILE = path.join(os.homedir(), '.baiorc');
const RC_PATH = path.join(os.homedir(), '.baio');
const RC_AGENTS_PATH = path.join(RC_PATH, 'agents');
const RC_HISTORY_PATH = path.join(RC_PATH, 'history');


//* get user dot env
// node:parseEnv sucks really badly.
(await readFile(RC_ENVFILE, 'utf-8').catch(_ => ''))
.split('\n').map(line => line.trim()).filter(line => line.length > 0 && !line.startsWith('#'))
.map(line => line.split(/=(.*)/).map(part => part.trim()) )
.filter(([key,val]) => key && val)
.forEach(([key,val]) => process.env[key!.toUpperCase().replaceAll(' ', '_')] = val);


//* set DEBUG consts
const DEBUG_OUTPUT = !!process.env.DEBUG_OUTPUT;
const DEBUG_APICALLS = !!process.env.DEBUG_APICALLS;
const DEBUG_SYSTEMPROMPT = !!process.env.DEBUG_SYSTEMPROMPT;
const DEBUG_OUTPUT_EXECUTION = !!process.env.DEBUG_OUTPUT_EXECUTION;
const DEBUG_OUTPUT_SYSTEMPROMPT = !!process.env.DEBUG_OUTPUT_SYSTEMPROMPT;
const DEBUG_APICALLS_PRETEND_ERROR = !!process.env.DEBUG_APICALLS_PRETEND_ERROR;

//* project imports
import drivers from './drivers.ts';  // ext .ts is required by NodeJS (with TS support)


//* import types
import './types/cli-markdown.d.ts';
import './types/copy-paste.d.ts';
import './types/generic.d.ts';
import './types/driver.Ollama.d.ts';
import './types/driver.OpenAi.d.ts';
import './types/driver.GoogleAi.d.ts';
import './types/json.d.ts';
type Driver = typeof drivers[keyof typeof drivers];


//* TTY input overwrite
let TTY_INTERFACE:any;


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

        ask:     { short: 'q', type: 'boolean' },
        sysenv:  { short: 's', type: 'boolean' },
        end:     { short: 'e', type: 'boolean' },

        import:  { short: 'i', type: 'string'  }, // history import

        config:  { short: 'c', type: 'boolean' },
        update:  { short: 'u', type: 'boolean' },
        reset:   { short: 'r', type: 'boolean' },
        'reset-prompts': {     type: 'boolean' },

        open:    {             type: 'string'  },
        files:   { short: 'f', type: 'string', multiple: true },
    }, 
    //tokens: true,
    allowNegative: true,
    args: process.argv.slice(2)
}))).catch(error => { console.error('🛑', error.message); process.exit(1); });
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

if (settingsArgs.temperature) {
    if (!isNaN(Number(settingsArgs.temperature)))
        settingsArgs.temperature = Number(settingsArgs.temperature) 
    else {
        console.error('🛑 temperature must be a number, not:', settingsArgs.temperature);
        process.exit(1);
    }
}
// console.log( args, settingsArgs); process.exit(9999);


//* load saved settings
let settingsSaved: Settings|undefined;
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

    saveSettings: false,    // save settings to the .baiorc file -- if this is true, the options will not be asked

    precheckUpdate: true,       // (speedup if false) try to reach the npm registry to check for an update
    precheckDriverApi: true,    // (speedup if false) try to reach the driver api to check if it is available
    precheckLinksInstalled: true,   // (speedup if false) try to check if links is installed and if it is available
    cmdMaxLengthDisplay: 100,   // set the maximum length of a command to display

    defaultPrompt: 'show me a table of all files in the current directory',

    //fixitPrompt: `Something went wrong! Ensure all steps are followed, commands are properly formatted as by the output rules, results are validated, and commands are properly executed. Reevaluate the goal after each action and make sure to append <END/> only when the task is fully completed. Try again with a different approach, and if more information is needed, request it.`,

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

    systemPrompt: `
        Your name is Baio.
        You are a helpful AI operator that generates and validates command-line commands. 
        You create commandline commands for your system and validate the result. The commands will automatically be executed on the host system with the next prompt by your doing.
        You want to solve the users prompt with concise and meaningful commandline commands and avoid guessing or duplicates and supply executable commands that will be executed.

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
        {{linksIsInstalled}}
        {{useAllSysEnv}}

        ### Initial Prompt:
        - First check what OS and Shell for execution you have available, check in "Your System Information" for Default Shell and Fallback Shell.
        - Do **not** use <END/> in the initial prompt.

        ### Output Rules:
        - Explain **briefly** what you are doing and what each command does.
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
        - You can create and edit or append to files by creating commands that will be executed that write the content into a file.

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
            - Use DuckDuckGo for queries: \`https://duckduckgo.com/?q=<search_term>\`
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
                2. Create command to create a new file in the previously mentioned "User's Home Directory" in \`./.baio/agents/<agent_name>.md\` that contains the users prompt (elaborate on the action) and will be phrased like "You will do something"

        {{useAgent}}

        Follow these rules strictly to ensure accurate command execution and validation.
    `,
    version: packageJSON.version,
};


//* handle updating prompts / resetting prompts (if it is not an arg that loads to prompting or if the versions differ)
let resetPrompts = false;
if (settingsSaved !== undefined && !settingsArgs['version'] && !settingsArgs['help'] && !settingsArgs['reset-prompts'] && !settingsArgs['reset'] && !settingsArgs['open'] && (settingsSaved.version !== settingsDefault.version)) {
    //* really check if the prompts have changed
    if (settingsDefault.defaultPrompt !== settingsSaved.defaultPrompt || settingsDefault.fixitPrompt !== settingsSaved.fixitPrompt || settingsDefault.systemPrompt !== settingsSaved.systemPrompt) {
        const isNonInteractive = !process.stdin.isTTY || process.env.npm_lifecycle_event === 'updatecheck';
        if (isNonInteractive)
            console.info('The system propmpts have been updated. To update saved system prompts from your previous version to the current version, use: `baio --reset-prompts`' );
        else
            resetPrompts = await toggle({ message: `Update saved system prompts from your previous version to the current version:`, default: true }, TTY_INTERFACE);
    }
}


//* merge settings
let settings: Settings = {
    ...settingsDefault,
    ...settingsSaved ?? {},
    // only add settingsArgs if the key is already in settingsDefault (filters out version and others)
    ...Object.entries(settingsDefault).reduce((acc, [k, v]) => settingsArgs[k] !== undefined ? { ...acc, [k]: settingsArgs[k] } : acc, {}),
    // handle --reset-prompts 
    ...(settingsArgs['reset-prompts'] || resetPrompts ? {defaultPrompt: settingsDefault.defaultPrompt, fixitPrompt: settingsDefault.fixitPrompt, systemPrompt: settingsDefault.systemPrompt, version: settingsDefault.version } : {}),
};


//* initialize AI history
let history: MessageItem[] = [];


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
async function api(promptText: PromptText, promptAdditions?: PromptAdditions): Promise<PromptResult> {
    const driver: Driver = drivers[settings.driver]!;

    let result;
    let retry = false;
    do {
        spinner.start(`Waiting for ${driver.name}\'s response ...`);
        result = await driver.getChatResponse(settings, history, promptText, promptAdditions);
        spinner.success();
    
        // error, ask to retry
        if (result instanceof Error) {
            console.error(colors.red(colors.bold(figures.cross)), colors.red(`API Error (${driver.name}): ${result.message}`));
            retry = await toggle({ message: `Do you want to try again?`, default: true }, TTY_INTERFACE);
            if (!retry)
                return {answer: '', answerFull: '', helpers: [], commands: [], needMoreInfo: true, isEnd: false};
        }

    } while(retry);


    let {contentRaw, history: historyNew} = result as ChatResponse;
    
    history = historyNew;

    

    // remove the <think>...</think> block from the visible output
    let content = contentRaw.replaceAll(/<think>.*?<\/think>/gis, '');

    // find all commands with format `<CMD>the commandline command</CMD>` which can be in the middle of a string,
    const matches = content.matchAll(/\`?\ *<CMD>(.*?)<\/CMD>\ *\`?/gs);
    let commands: string[] = [];
    for (const match of matches)
        commands.push(match[1]!);


    let helpers: PromptHelper[] = [];

    {// do files
        const matchesFiles = content.matchAll(/\`?\ *<WRITE-FILE FILEPATH="(.*?)">(.*?)<\/WRITE-FILE>\ *\`?/gs);
        for (const match of matchesFiles) {
            helpers.push({type: 'file.write', file: {name: match[1]!, mimeType: mime.getType(match[1]!) ?? 'text', content: match[2]!}});
            DEBUG_OUTPUT && console.log('file.write', match[1]!, 'mime:', mime.getType(match[1]!) ?? 'text', 'content length:', match[2]!.length);

            // prepare for output
            content = content.replaceAll(match[0], '\nWrite file: `' + match[1] +'`\n```'+'\n' + match[2] + '\n```\n');
        }
    }

    // go for agents, that are created by the ai
    // const matchesHelpers = content.matchAll(/\`?\ *<AGENT-DEFINITION NAME="(.*?)">(.*?)<\/AGENT-DEFINITION>\ *\`?/g);
    // for (const match of matchesHelpers)
    //     helpers.push({type: 'agent', name: match[1], definition: match[2]});

    // clean <END/> tags, because sometimes they are within strange places
    content = content.replaceAll(/<END\/>/g, '');

    // clean <NEED-MORE-INFO/> tags, because sometimes they are within strange places
    content = content.replaceAll(/<NEED-MORE-INFO\/>/g, '');

    // User output:
    // add ` before and after all <CMD> tags and after all </CMD> tags, if missing --- also remove tags
    // markdown messed up with commands. use fenced code blocks for long commands to make markdown work
    const regex = /\`*\ *<CMD>(.*?)<\/CMD>\ *\`*/gs;
    let m;

    while ((m = regex.exec(content)) !== null) {                                       //!  ---  do same syntax as above
        // This is necessary to avoid infinite loops with zero-width matches
        if (m.index === regex.lastIndex) regex.lastIndex++;

        if (m[1]?.includes('`') || m[1]?.includes('\n'))
            content = content.replaceAll(m[0], '\n ▶️ Command: \n```'+getShellName()+'\n' + m[1]?.trim() + '\n```\n');
        else
            content = content.replaceAll(m[0], '\n ▶️ `' + m[1]?.trim() + '`');
    }

    try {
        content = cliMd(content); // crashes sometimes : Cannot read properties of undefined (reading 'at') -- /node_modules/cli-html/lib/tags/code.js:12:25
    } catch (error) {}

    return {
        answerFull: contentRaw, // for thinking models debugging
        answer: content,
        helpers,
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

    let models = await driver.getModels(settings);

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
        console.warn(`  Run 'npm i -g ${packageJSON.name}' to update!`);
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
                console.error(`🛑 Agent ${agentArg} file ${file} not found!`);
            else {
                console.log(colors.green(colors.bold(figures.tick)), `Agent ${agentName} used`);
                agents.push({name: agentName, value: file});
            }
        }
    }
    else {
        // commandline was proccessed, in case there is something going to be added in the future
        if (settingsArgs['agent']) settingsArgs['agent'] = undefined;

        agents = agentFiles.map(file => ({ name: file.name.replace('.md', ''), value: path.join(file.parentPath, file.name) }))
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
async function doCommands(commands: string[]): Promise<string> {
    let results: string[] = [];

    for (const command of commands) {
        spinner.start(`Executing command: ${displayCommand(command)}`);

        // execute command mith node and a promise and wait
        let result = await new Promise((resolve, reject) => {
            const child = exec(command, {shell: getInvokingShell() }, (error, stdout, stderr) => {
                if (error)
                    reject(error);
                else
                    resolve(stdout);
            });
        })
        .then(stdout => '<CMD-OUTPUT>' + stdout + '</CMD-OUTPUT>')
        .catch(error => '<CMD-ERROR>' + error + '</CMD-ERROR>');
        
        results.push('<CMD-INPUT>' + command + '</CMD-INPUT>\n' + result);

        spinner.success();
    }

    return doCommandsLastResult = results.join('\n<-----/>\n');
}


/**
 * Wrapper to output the api result to the console 
 * @param prompt 
 * @returns api result
 */
async function doPrompt(prompt: Prompt): Promise<PromptResult> {
    const result = await api(prompt.text, prompt.additions);
    
    // output to the user
    console.log(result.answer);

    DEBUG_OUTPUT && console.info('DEBUG\n', 'answer:', result.answerFull);
    DEBUG_OUTPUT && console.info('DEBUG\n', 'commands:', result.commands);

    return result;
}


/**
 * Shorten a command for displaying it, limiting it to a maximum length and replace linebreaks with an enter-arrow symbol
 * @param command The command to shorten
 * @returns The shortened command
 */
function displayCommand(command: string): string {
    return (command.length > settings.cmdMaxLengthDisplay 
        ? command.substring(0, settings.cmdMaxLengthDisplay - 4) + ' ...' 
        : command
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
        if (settingsArgs['config']) process.exit(0);

        if (argsPrompt) {
            prompt = argsPrompt;
            DEBUG_OUTPUT && console.log(colors.green(figures.tick), 'What do you want to get done:', argsPrompt);
        }
        else
            prompt = argsPrompt || await input({ message: 'What do you want to get done:', default: settings.defaultPrompt }, TTY_INTERFACE);
    
        resultCommands = prompt;
    }
    //* helpers
    if (result?.helpers.length) {
        

        // TODO ... make it work ... like writing files. --> checkboxWithActions


        console.log( colors.yellow(figures.warning), colors.bold('W O R K   I N   P R O G R E S S.') );
        console.log('Helpers:', JSON.stringify(result.helpers, null, 2));
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
    //* there are commands
    if (result?.commands.length) {
        let canceled: boolean|'edit' = false;
        let activeItem:{name:string,value:string,index:number};
        let options = {...TTY_INTERFACE, clearPromptOnDone: false}
        const commands = await checkboxWithActions({
            message: 'Select the commands to execute',
            shortcuts: { edit: 'e' },
            choices: result.commands.map((command) => ({ name: displayCommand(command), value: command, checked: true })),
            keypressHandler: async function({key, active, items}) {
                activeItem = {...items[active], index: active};

                if (key.name == 'escape' || key.sequence == ':' || key.sequence == '/') {
                    canceled = true;   // let us know, that we should not care about the values
                    options.clearPromptOnDone = true; // clear the line after exit by this
                    return {
                        isDone: true, // tell the elment to exit and return selected values
                        isConsumed: true, // prevent original handler to process this key         ... ignores any validation error (we did not setup validations for this prompt)
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
            if (canceled === 'edit') {
                let val = await editor({
                    message: 'Waiting for you to close the editor (and you can modify the command).',
                    waitForUseInput: false,
                    theme: { style: { help: () => ``, } },
                    default: activeItem!.value,
                    postfix: getShellExt(),
                }, {...TTY_INTERFACE, clearPromptOnDone: true})
                .catch(_ => undefined);

                if (val !== undefined)
                    result.commands[activeItem!.index] = val;

                return undefined;
            }
            else
                resultCommands = await input({ message: 'Enter more info:' }, TTY_INTERFACE);
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
 * @param isAsk    defaults to false. If true, the user will be asked even if by the settings it would not and if no filename is given
 * @returns if done
 */
async function importHistory(filename: string, isAsk: boolean = false): Promise<void> {
    if (filename.startsWith('"') && filename.endsWith('"')) filename = filename.slice(1, -1); // "file name" is possible
        
    if (!filename) {
        const historyFilesChoices: HistorySelection = [];
        for await (const file of glob('*.json', { cwd: RC_HISTORY_PATH, withFileTypes: true }))
            historyFilesChoices.push({ name: file.name.replace('.json', ''), value: path.join(file.parentPath, file.name) });

        if (!historyFilesChoices.length) {
            !isAsk && console.error('🛑 No history files found');
            return;
        }
        filename = await select({ message: 'Select a history file to load:', choices: [{ name: '- none -', value: '' }, ...historyFilesChoices] }, TTY_INTERFACE);
    }
    if (filename === '') return;

    let filePath = path.resolve(RC_HISTORY_PATH, filename);
    if (filePath && !path.extname(filePath)) filePath += '.json';
    const historyContent = await readFile(filePath, 'utf-8').catch(_ => undefined);

    if (!historyContent)
        console.error(`🛑 Could not read history file ${filePath}`);
    else {
        let content = JSON.parse(historyContent) as HistoryFile;

        let driver: Driver = drivers[settings.driver]!;
        if (content.historyStyle !== driver.historyStyle)
            console.error(`🛑 Importing history failed. File ${filePath} has an incompatible history style (${drivers[content.historyStyle]?.name ?? content.historyStyle}) than the current API ${driver.name}.`);
        else {
            console.log(`💾 Imported history from ${filePath}`);
            history = content.history;
        }
    }
    return;
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

    if (prompt.text === ':h' || prompt.text === '/:help') {
        console.log(cliMd(`Possible prompt triggers\n
| Trigger | Short | Description |
|---|---|---|
| \`/:help\`                           | \`:h\`  | Shows this help. |
| \`/:read\`                           | \`:r\`  | Opens the default editor for a multiline input. |
| \`/:write\`                          | \`:w\`  | Opens the default editor to show the last AI response. Use to save to a file. |
| \`/clip:read\`                       | \`:r+\` | Read from the clipboard and open the default editor. |
| \`/clip:write\`                      | \`:w+\` | Write the the last AI response to the clipboard. |
| \`/history:export [<filename>]\`     | \`:he [<filename>]\`    | Exports the current context to a file with date-time as name or an optional custom filename. |
| \`/history:export:md [<filename>]\`  | \`:he:md [<filename>]\` | Exports the current context to a markdown file for easier reading (can not be imported). |
| \`/history:import [<filename>]\`     | \`:hi [<filename>]\`    | Imports the context from a history file or shows a file selection. |
| \`/history:clear\`                   | \`:hc\` | Clears the current context (to use current prompt without context). |
| \`/:clear\`                          | \`:c\`  | Clears the current context and current prompt (use for changing topics). |
| \`/:end [<boolean>]\`                |         | Toggles end if assumed done, or turns it on or off. |
| \`/debug:result\`                    |         | Shows what the API generated and what the tool understood. |
| \`/debug:exec\`                      |         | Shows what the system got returned from the shell. Helps debug strange situations. |
| \`/debug:get <.baiorc-key>\`         |         | Gets the current value of the key. Outputs the system prompt, may spam the shell output. |
| \`/debug:set <.baiorc-key> <value>\` |         | Overwrites a setting. The value must be a JSON formatted value. |
| \`/debug:settings\`                  |         | Lists all current settings. May spam the shell output. |
| \`/:quit\`, \`/:exit\`               | \`:q\`  | Will exit (CTRL+D or CTRL+C will also work). |
        `));
        return true;
    }
    if (prompt.text === '/debug:result') {
        console.log(resultPrompt);
        return true;
    }
    if (prompt.text === '/debug:exec') {
        console.log(doCommandsLastResult);
        return true;
    }
    if (prompt.text === '/debug:settings') {
        console.log(`settings =`, settings);
        return true;
    }
    if (prompt.text.startsWith('/debug:get ')) {
        const key = prompt.text.split(/(?<!\\)\s+/)[1];
        console.log(`settings.${key} =`, key ? settings[key] : 'not found');
        return true;
    }
    if (prompt.text.startsWith('/debug:set ')) {
        //* will not work with useAllSysEnv (is systemPrompt is already generated with this), saveSettings (saved already)
        //*  /debug:set <.baiorc-key> <JSON_formatted_value>
        const args = prompt.text.split(/(?<!\\)\s+/).filter(arg => arg.length > 0);
        const key = args[1],
              val = args.slice(2).join(' ');
        try {
            const value = JSON.parse(val) as any;
            if (key && key in settings) settings[key] = value;
            else console.error(colors.red(figures.cross), `Unknown setting: ${key}`);
        }
        catch (e) {
            console.error(colors.red(figures.cross), `Failed to parse value: ${val}`, '\n  ', (e as SyntaxError).message);
        }
        return true;
    }
    let exportType='json';
    if (prompt.text.startsWith('/history:export:md') || prompt.text.startsWith(':he:md')) {
        exportType = 'md';
    }
    if (prompt.text.startsWith('/history:export') || prompt.text.startsWith(':he')) {
        const key = prompt.text.split(/(?<!\\)\s+/).filter(arg => arg.length > 0).slice(1).join(' ');
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
            //content =  a flattened object, where all keys that do not have a child, will be inlcuded with key:content
            let contentStrings:string[] = [];
            function walk(obj:Record<string, any>) {
                for (const key in obj) {
                    if (typeof obj[key] === 'string') {
                        contentStrings.push(obj[key]);
                    } else {
                        walk(obj[key]);
                    }
                }
            }
            walk(history);
            contentStrings = contentStrings
                // remove role strings
                .filter(item => !['user', 'model', 'library', 'assistant'].includes(item))
                // remove ansi escape codes (cli output colors and alike)
                .map(item => item.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g,""));

            // add separators
            content = contentStrings.join( '\n'.repeat(4) + '-'.repeat(30) + '\n'.repeat(4) );

            console.log(`⚠️ This type of history can NOT be imported and is only for viewing.`);
        }

        const historyPath = path.join(RC_HISTORY_PATH, filename);

        let saved = await writeFile(historyPath, content, 'utf-8').then(_ => true).catch(e => e.message);

        if (saved !== true)
            console.error(`🛑 Failed to save history to ${historyPath}: ${saved}`);
        else
            console.log(`💾 Exported history to ${historyPath}`);
        return true;
    }
    if (prompt.text.startsWith('/history:import') || prompt.text.startsWith(':hi')) {
        let filename = prompt.text.split(/(?<!\\)\s+/).filter(arg => arg.length > 0).slice(1).join(' ');
        await importHistory(filename);
        return true;
    }
    if (prompt.text.startsWith('/history:clear') || prompt.text.startsWith(':hc')) {
        history = [];
        console.log(`🗑️ History cleared.`);
        return true;
    }
    if (prompt.text.startsWith('/:clear') || prompt.text.startsWith(':c')) {
        history = [];
        prompt.text = '';
        prompt.additions = undefined;
        if (resultPrompt) {
            resultPrompt.answer = '';
            resultPrompt.answerFull = '';
            resultPrompt.commands = [];
            resultPrompt.helpers = [];
            resultPrompt.needMoreInfo = true;
            resultPrompt.isEnd = false;
        }
        console.log(`🗑️ History cleared, current prompt cleared.`);
        return true;
    }
    let pasteContent: string|undefined = undefined;
    if (prompt.text === '/clip:read' || prompt.text === ':r+' || prompt.text === ':r +') {
        pasteContent = await clipboard.paste() || '';
        if (!pasteContent) {
            console.log(`🛑 Failed to read anything from clipboard`);
            return true;
        }
        console.log(`📋 Read from clipboard`);
    }
    if (prompt.text === '/:read' || prompt.text === ':r' || pasteContent) {
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
    if (prompt.text === '/clip:write' || prompt.text === ':w+' || prompt.text === ':w +') {
        clipboard.copy(resultPrompt?.answerFull ?? '');
        console.log(`📋 Copied to clipboard`);
        return true;
    }
    if (prompt.text === '/:write' || prompt.text === ':w') {
        if (!resultPrompt?.answerFull) {
            console.log(`🛑 There is nothing from a previous AI response`);
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
    if (prompt.text.startsWith('/:end')) {
        const key = prompt.text.split(/(?<!\\)\s+/)[1];
        if (key === undefined || key.trim() === '')
            settings.endIfDone = !settings.endIfDone;
        else
            settings.endIfDone = {'true': true, 'false': false, '1': true, '0': false, 'on': true, 'off': false, 'yes': true, 'no': false}[key.toLowerCase()] ?? false;
        
        console.log(`${settings.endIfDone ? '🟢' : '🔴'}End if assumed done: ${settings.endIfDone ? 'yes' : 'no'}`);
        return true;
    }

    if (prompt.text === '/:exit' || prompt.text === '/:quit' || prompt.text === ':q') {
        process.exit(0);
    }

    // default
    return false;
}


/**
 * Initializes the prompt by asking the user for settings and returns the prompt
 * @returns the prompt
 */
async function init(): Promise<Prompt> {
    let askSettings = settingsArgs['ask'] ?? (process.env.ASK_SETTINGS || !settings.saveSettings);
    if (settingsArgs['reset-prompts'] === true) { askSettings = settingsArgs['ask'] ?? false; settingsArgs['config'] = settingsArgs['config'] ?? true; } // do not ask for settings and prompt, if we are resetting the prompts so the other commands are not needed
    let promptAdditions: PromptAdditions;


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
                console.info(`✔ Opening ${RC_ENVFILE}`);
                launchEditor(RC_ENVFILE, (f,e) => console.error(e, f));
                await new Promise(resolve => setTimeout(resolve, 5000)); // windows explorer needs some time to start up ...

                break;

            case 'config':
                if (!fs.existsSync(RC_FILE)) {
                    console.error(`🛑 You have to run at least once and choose to 'Automatically use same settings next time' or use --update, for ${RC_FILE} to exist`);
                    process.exit(1);
                }
                console.info(`✔ Opening ${RC_FILE}`);
                launchEditor(RC_FILE);
                break;

            //? special hidden case, will only work if an editor is open that supports opening folders, like vscode / sublime / textwrangler
            case 'pathfiles': 
                mkdir(RC_PATH, { recursive: true }).catch(_ => {});
                console.info(`✔ Opening ${RC_PATH}`);
                launchEditor(RC_PATH);
                break;

            case 'agents':
                mkdir(RC_AGENTS_PATH, { recursive: true }).catch(_ => {});
                console.info(`✔ Opening ${RC_AGENTS_PATH}`);
                await open(RC_AGENTS_PATH); // await does not wait for subprocess to finish spawning
                await new Promise(resolve => setTimeout(resolve, 1000)); // windows explorer needs some time to start up ...
                break;

            case 'history':
                mkdir(RC_HISTORY_PATH, { recursive: true }).catch(_ => {});
                console.info(`✔ Opening ${RC_HISTORY_PATH}`);
                await open(RC_HISTORY_PATH); // await does not wait for subprocess to finish spawning
                await new Promise(resolve => setTimeout(resolve, 1000)); // windows explorer needs some time to start up ...
                break;

            default:
                console.error(`🛑 Unknown option: ${settingsArgs['open']}`);
        }

        // give launchEditor a chance to spawn the editor proccess
        await new Promise(resolve => setTimeout(resolve, 100));
        process.exit(0);
    }

    if (settingsArgs['help'])
    {
        console.info(packageJSON.name,'v' + packageJSON.version);
        console.info(packageJSON.description);
        console.info('');
        console.info(`Copyright (c) 2025 ${packageJSON.author.name} <${packageJSON.author.email}>`);
        console.info('MIT License');
        
        console.info(packageJSON.homepage);
        console.info('\n');

        await checkUpdateOutput() && console.info('\n');

        console.info(`baio [-vhdmtaqseiucr] ["prompt string"]`);

        console.info(`
  -v, --version
  -h, -?, --help

  -d, --driver <api-driver>    Select a driver (ollama, openai, googleai)
  -d *, --driver *             Ask for a driver with a list, even if it would not
  -m, --model <model-name>     Select a model
  -m *, --model *              Ask for a model with a list, even if it would not
  -t, --temp <float>           Set a temperature, e.g. 0.7 (0 for model default)

  -a, --agent <agent-name>     Select an agent, a set of prompts for specific tasks
  -a *, --agent *              Ask for agent with a list, even if it would not

  -q, --ask                    Reconfigure to ask everything again
      --no-ask                 ... to disable
  -s, --sysenv                 Allow to use the complete system environment
      --no-sysenv              ... to disable
  -e, --end                    End promping if assumed done
      --no-end                 ... to disable

  -i, --import <filename>      Import context from a history file or list files select from
  -i *, --import *             Ask for history file with a list, even if it would not

  -f, --file <filename>, ...   Add a single or multiple files to the prompt

  -u, --update                 Update user config (save config)
  -c, --config                 Config only, do not prompt.

  -r, --reset                  Reset (remove) config
  --reset-prompts              Reset prompts only (use this after an update)

  --open <config>              Open the file in the default editor or the agents path (env, config, agents, history)
        `);
        // You can pipe in text (like from a file) to be send to the API before your prompt.

        console.info('');
        console.info(`Settings config path: ${RC_FILE}`);
        console.info(`Environment config path: ${RC_ENVFILE}`);
        console.info(`Agents config path: ${RC_AGENTS_PATH}`);
        console.info(`History config path: ${RC_HISTORY_PATH}`);

        process.exit(0);
    }


    //*** settings ***


    if (askSettings)
    {//* info header
        console.info(packageJSON.name, 'v' + packageJSON.version);
        console.info('ℹ️ use CTRL + D to exit at any time.');
    }

    {//* new update info
        if (settings.precheckUpdate)
            await checkUpdateOutput();
    }

    if (askSettings || settings.driver === '*')
    {//* API/Driver selection
        if (settings.driver === '*') settings.driver = ''; // allow default
        let driverChoices = Object.keys(drivers).map(key => ({ name: drivers[key]?.name, value: key }));
        settings.driver = await select({ message: 'Select your API:', choices: driverChoices, default: settings.driver || 'ollama' }, TTY_INTERFACE);
        settings.model = '*'; // force to choose a new one
    }

    {//* api key test
        if (settings.driver !== 'ollama' && !drivers[settings.driver]?.apiKey()) {
            console.error(`🛑 ${drivers[settings.driver]?.name ?? settings.driver} has no API key configured in the environment`);
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

    if (askSettings || settings.model === '*' )
    {//* model selection
        let driver:Driver = drivers[settings.driver]!;
        const models = await getModels();
        let modelSelected = '';
        if (models.length) {
            if (settings.model === '*') settings.model = ''; // allow default
            models.push({ name: 'manual input ...', value: '' });
            modelSelected = await select({ message: 'Select your model:', choices: models, default: settings.model || driver.defaultModel }, TTY_INTERFACE);
        }
        if (!models.length || !modelSelected) {
            if (settings.driver == 'ollama')
                console.warn('⚠️ The model you enter, will be downloaded and this process might really take a while. No progress will show.');
            modelSelected = await input({ message: 'Enter your model to use:', default: settings.model || driver.defaultModel }, TTY_INTERFACE);
        }
        settings.model = modelSelected;
    }
    
    if (askSettings)    
    {//* options
        if (DEBUG_SYSTEMPROMPT)
            settings.systemPrompt = await input({ message: 'Enter your system prompt', default: settings.systemPrompt }, TTY_INTERFACE);

        settings.temperature = await input({ message: 'Enter the temperature (0 for model\'s default):', default: settings.temperature.toString() }, TTY_INTERFACE).then(answer => parseFloat(answer));
        
        settings.useAllSysEnv = await toggle({ message: 'Use all system environment variables:', default: settings.useAllSysEnv }, TTY_INTERFACE);
        
        settings.endIfDone = await toggle({ message: 'End if assumed done:', default: settings.endIfDone }, TTY_INTERFACE);
    }
    
    {//* save settings
        if (askSettings)
            settings.saveSettings = await toggle({ message: `Automatically use same settings next time:`, default: settings.saveSettings }, TTY_INTERFACE);

        // write settings if it is asked for, or if it is not asked for but already saved to remove it
        if ((settingsArgs['reset-prompts'] && settingsSaved !== undefined) || (settingsArgs['update'] ?? (settings.saveSettings || (!settings.saveSettings && settingsSaved)))) {

            // make extra sure, there is a difference between settings and saveSettings or param was used to save
            let isDiff = settingsSaved === undefined || settingsArgs['update'] || Object.keys(settings).reduce((acc, key) => acc || settings[key] !== settingsSaved[key], false);

            if (isDiff) {
                spinner.start(`Updating settings in ${RC_FILE} ...`);
                await writeFile(RC_FILE, JSON.stringify(settingsArgs['update'] ?? settings.saveSettings ? settings : {}, null, 2), 'utf-8');
                spinner.success();
            }
        }
    }

    
    //*** the following options are NOT saved, but can add to settings ***


    let agentContent = '';
    {//* agent
        const hasAgentsArgs = !!settingsArgs['agent']?.length;
        const forceSelection = settingsArgs['agent']?.[0] === '*';
        let agentFiles:ArgsKeys['agent'] = [];

        const agents = await getAgents();

        if (agents.length)
            agentFiles = hasAgentsArgs && !forceSelection
                ? agents.map(({value}) => value) // getAgents returned only the requested ones
                : (askSettings || forceSelection
                    ? [await select({ message: 'Select an agent:', choices: [{ name: '- none -', value: '' }, ...agents ] }, TTY_INTERFACE)]
                    : []
                );
        
        if (agentFiles.length) {
            for (const agentFile of agentFiles) {
                let agentContentFile = await readFile(agentFile, 'utf-8').catch(_ => undefined);
                // get from file content the content from after the second '---' if available or everything from the beginning (if formating is broken)
                agentContent += settings.agentPrompt + '\n' + (agentContent ? '\n---\n' : '') + (agentContentFile?.split('---\n')?.[2] || agentContentFile);
            }
        }
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

                promptAdditions = [ ...(promptAdditions ?? []), { type: 'text', content: additionalContentData }];
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
        if (settingsArgs['files']) {
            let driver:Driver = drivers[settings.driver]!;
            
            for (const filename of settingsArgs['files']) {

                let filePath = path.resolve(process.cwd(), filename);
                const mimeType = mime.getType(filePath);

                if (!mimeType) {
                    console.error(colors.red(figures.warning), 'Skipping file, could get mimeType for file', filePath);
                    continue;
                }

                let type = mimeType.split('/')[0] || 'text' as PromptAdditionsTypes;
                let encoding: 'base64' | 'utf-8' = 'utf-8';
                if (type === 'audio' || type === 'image' || type === 'video') encoding = 'base64';

                // load file
                let fileErr;
                let fileContent = await readFile(filePath, encoding).catch(err => {fileErr = err; return ''; });
                if (fileErr) {
                    console.error(colors.red(figures.warning), 'Skipping file, could not read file', filePath, '\n  ', (fileErr! as Error).message);   
                    continue;
                }

                // add file content
                let addition = driver.makePromptAddition(type, fileContent, mimeType!);
                if (addition instanceof Error) {
                    console.error(colors.red(figures.warning), 'Skipping file, could not use file', filePath, '\n  ', addition.message);
                    continue;
                }

                // add filename prompt
                let additionFileName = driver.makePromptAddition('text', settings.fileAddPrompt.replaceAll('{{filepath}}', filePath), 'text/plain');
                if (additionFileName instanceof Error) {
                    console.error(colors.red(figures.warning), 'Skipping file, could not use file', filePath, '\n  ', additionFileName.message);
                    continue;
                }

                promptAdditions = [ ...(promptAdditions ?? []), additionFileName, addition ];
            }
        }
    }

    
    //*** now its execution time ***


    {//* import context from history files
        if (settingsArgs['import'])
            await importHistory(settingsArgs['import'] !== '*' ? settingsArgs['import'] : '');
        else if (askSettings)
            await importHistory('', true);
    }
    
    {//* system prompt
        [
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

        // apply invoking shell to system prompt
            ['{{invokingShell}}', getInvokingShell() ?? 'unknown'],

        // apply system env to system prompt or clean up the placeholder
            ['{{useAllSysEnv}}', settings.useAllSysEnv ? `- You are running on (system environment): ${JSON.stringify(process.env)}` : ''],

            ['{{useAgent}}', agentContent ? `---\n${agentContent}\n---\n` : ''],
        ].forEach(([placeholder, value]) =>
            settings.systemPrompt = settings.systemPrompt.replaceAll(placeholder!, value!)
        );

        if (settings.precheckLinksInstalled) {
            try {
                let output = execSync('links -version', { shell: getInvokingShell() });
                settings.systemPrompt = settings.systemPrompt.replaceAll('{{linksIsInstalled}}', '- links2 is installed and can be used: ' + output);
                DEBUG_OUTPUT && console.log(colors.green(figures.tick), 'links2 is installed');
            }
            catch (error) {
                settings.systemPrompt = settings.systemPrompt.replaceAll('{{linksIsInstalled}}', '- links2 is not yet installed');
                DEBUG_OUTPUT && console.warn(colors.yellow(figures.cross), 'links2 is not installed');
            }
        }
        else
            settings.systemPrompt = settings.systemPrompt.replaceAll('{{linksIsInstalled}}', '- you need to check if links2 is installed');

        DEBUG_OUTPUT_SYSTEMPROMPT && console.log('DEBUG\n', 'systemPrompt:', settings.systemPrompt);
    }

    return { additions: promptAdditions, text: '' };
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
}