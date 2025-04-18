/**
 * BAIO - A simple AI operator for the CLI, for any LLM
 * 
 * @author Nabil Redmann <repo@bananaacid.de>
 * @license MIT
 */

//* node imports
import packageJSON from './package.json' with { type: 'json' };
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
import clipboard from 'copy-paste';

import { input, select, checkbox, editor } from '@inquirer/prompts';
import { default as tgl } from 'inquirer-toggle';
//@ts-ignore
const toggle = tgl.default;

import yoctoSpinner from 'yocto-spinner';
const spinner = yoctoSpinner({text: ''});


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
(await readFile(RC_ENVFILE, 'utf-8').catch(_ => '')).split('\n').map(line => line.trim()).filter(line => line.length > 0 && !line.startsWith('#')).map(line => line.split(/=(.*)/).map(part => part.trim())).filter(line => line[1].length > 0).forEach(line => process.env[line[0].toUpperCase().replaceAll(' ', '_')] = line[1]);


//* set DEBUG consts
const DEBUG_OUTPUT = process.env.DEBUG_OUTPUT || false;
const DEBUG_APICALLS = process.env.DEBUG_APICALLS || false;
const DEBUG_SYSTEMPROMPT = process.env.DEBUG_SYSTEMPROMPT || false;
const DEBUG_OUTPUT_EXECUTION = process.env.DEBUG_OUTPUT_EXECUTION || false;
const DEBUG_OUTPUT_SYSTEMPROMPT = process.env.DEBUG_OUTPUT_SYSTEMPROMPT || false;


//* project imports
globalThis.DEBUG_OUTPUT = DEBUG_OUTPUT;
globalThis.DEBUG_APICALLS = DEBUG_APICALLS;

import drivers from './drivers.ts';


//* import types
import './types/generic.d.ts';
import './types/driver.Ollama.d.ts';
import './types/driver.OpenAi.d.ts';
import './types/driver.GoogleAi.d.ts';
import './types/JSON.d.ts';
type Driver = typeof drivers[keyof typeof drivers];


//* TTY input overwrite
let TTY_INTERFACE:any;


//* get args (partyl settings)
const args = await new Promise<ReturnType<typeof parseArgs>>(resolve => resolve(parseArgs({
    allowPositionals: true,
    options: {
        version: { short: 'v', type: 'boolean' },
        help:    { short: 'h', type: 'boolean' },
        help2:   { short: '?', type: 'boolean' },
        
        driver:  { short: 'd', type: 'string'  },
        model:   { short: 'm', type: 'string'  },
        temp:    { short: 't', type: 'string'  },

        agent:   { short: 'a', type: 'string'  },

        ask:     { short: 'q', type: 'boolean' },
        sysenv:  { short: 's', type: 'boolean' },
        end:     { short: 'e', type: 'boolean' },

        import:  { short: 'i', type: 'string'  }, // history import

        config:  { short: 'c', type: 'boolean' },
        update:  { short: 'u', type: 'boolean' },
        reset:   { short: 'r', type: 'boolean' },
        'reset-prompts': {     type: 'boolean' },

        open:    {             type: 'string'  },
    }, 
    //tokens: true,
    allowNegative: true,
    args: process.argv.slice(2)
}))).catch(error => { console.error('🛑', error.message); process.exit(1); });
const argsReMap = {
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
let settingsArgs;
//? 1. get all token .name from .tokens[] with reduce (not all do have a name), 2. then get matching value from .values{} 
//~ settingsArgs = args.tokens!.filter(token => token.kind === 'option').reduce((acc, token) => ({ ...acc, [token.name]: args.values[token.name] }), {});
//? 3. remap
settingsArgs = Object.entries(settingsArgs || args.values).reduce((acc, [k, v]) => ({ ...acc, [argsReMap[k] || k]: v }), {});
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

    defaultPrompt: 'show me a table of all files in the current directory',

    //fixitPrompt: `Something went wrong! Ensure all steps are followed, commands are properly formatted as by the output rules, results are validated, and commands are properly executed. Reevaluate the goal after each action and make sure to append <END/> only when the task is fully completed. Try again with a different approach, and if more information is needed, request it.`,

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
        - **If multiple commands need to be executed in sequence, combine them into one command** to maintain the shell context.  
        - Example (incorrect):  
            \`<CMD>cd /myfolder</CMD>\`
            \`<CMD>touch file.txt</CMD>\`
        - Example (correct):  
            \`<CMD>cd myfolder && touch file.txt</CMD>\`
        - The commands must work in the current shell for execution, commands of another shell do not work. But you can call another shell, that is available, to execute commands.
        - If more info is needed, ask the user and **append** <NEED-MORE-INFO/>.
        - If responding to a user without generating a command, **append** <NEED-MORE-INFO/>.
        - If asked to read a website or url, you need to do so.

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
async function api(prompt: string, promptAdditions?: PromptAdditions): Promise<PromptResult> {
    // fetch from ollama api

    const driver: Driver = drivers[settings.driver];

    spinner.start(`Waiting for ${driver.name}\'s response ...`);


    let {contentRaw, history: historyNew} = await driver.getChatResponse(settings, history, prompt, promptAdditions);
    
    history = historyNew;

    spinner.success();


    // find all commands with format `<CMD>the commandline command</CMD>` which can be in the middle of a string,
    //  AND ARE NOT part of a <think>...</think> block
    let content = contentRaw.replaceAll(/<think>.*?<\/think>/gis, '');
    const matches = content.matchAll(/\`?\ *<CMD>(.*?)<\/CMD>\ *\`?/g);
    let commands: string[] = [];
    for (const match of matches) {
        commands.push(match[1]);
    }

    // go for agents, that are created by the ai
    const matchesHelpers = content.matchAll(/\`?\ *<AGENT-DEFINITION NAME="(.*?)">(.*?)<\/AGENT-DEFINITION>\ *\`?/g);
    let helpers: PromptHelper[] = [];
    for (const match of matchesHelpers) {
        helpers.push({type: 'agent', name: match[1], definition: match[2]});
    }

    // clean <END/> tags, because sometimes they are within strange places
    content = content.replaceAll(/<END\/>/g, '');

    // clean <NEED-MORE-INFO/> tags, because sometimes they are within strange places
    content = content.replaceAll(/<NEED-MORE-INFO\/>/g, '');

    // User output:
    // add ` before and after all <CMD> tags and after all </CMD> tags, if missing --- also remove tags
    content = content.replaceAll(/\`*\ *<CMD>(.*?)<\/CMD>\ *\`*/g, '\n ▶️ `$1`');
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
    const driver: Driver = drivers[settings.driver];

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

    let driver:Driver = drivers[settings.driver];

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
    
    if (settingsArgs['agent'] && settingsArgs['agent'] !== '*') {
        const file = path.join(RC_AGENTS_PATH, settingsArgs['agent'] + '.md');
        //const exists = await access(file).catch(() => undefined);

        const filename = (settingsArgs['agent'] + '.md').toLowerCase();

        // find the file in agentFiles (compare lowercase, so the user can use `--agent` without taking care off the case)
        const fileFound = agentFiles.find(file => file.name.toLowerCase() === filename);

        if (!fileFound) { // if (!exists)
            console.error(`🛑 Agent ${settingsArgs['agent']} file ${file} not found!`);
            return [];
        }

        agents.push({name: settingsArgs['agent'], value: file});
    }
    else {
        if (settingsArgs['agent']) settingsArgs['agent'] = null;
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
        spinner.start(`Executing command: ${command}`);

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
async function doPrompt(prompt: Prompt, promptAdditions?: PromptAdditions): Promise<PromptResult> {
    const result = await api(prompt, promptAdditions);
    
    // output to the user
    console.log(result.answer);

    DEBUG_OUTPUT && console.info('DEBUG\n', 'answer:', result.answerFull);
    DEBUG_OUTPUT && console.info('DEBUG\n', 'commands:', result.commands);

    return result;
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
async function doPromptWithCommands(result: PromptResult|undefined): Promise<string> {
    let resultCommands = "";
    
    //* get inital user prompt
    if (result === undefined) {
        let prompt;
        if (settingsArgs['config']) process.exit(0);

        if (argsPrompt) {
            prompt = argsPrompt;
            DEBUG_OUTPUT && console.log('✔ What do you want to get done:', argsPrompt);
        }
        else
            prompt = argsPrompt || await input({ message: 'What do you want to get done:', default: settings.defaultPrompt }, TTY_INTERFACE);
    
        resultCommands = prompt;
    }
    //* no commands
    else if (!result.commands.length) {
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
            console.log('⚠️ No commands found in response, no execution will be performed.');
            resultCommands = settings.fixitPrompt;
        }
    }
    //* there are commands
    else {

        const commands = await checkbox({
            message: 'Select the commands to execute',
            choices: result.commands.map((command) => ({ name: command, value: command, checked: true })),
        }, TTY_INTERFACE);

        if (!commands.length)
            resultCommands = await input({ message: 'Enter more info:' }, TTY_INTERFACE);
        else {
                resultCommands = await doCommands(commands);

                (DEBUG_OUTPUT || DEBUG_OUTPUT_EXECUTION) && console.info('DEBUG\n', resultCommands);

                // ... go and evaluate the commands result
        }
    }

    return resultCommands;
}


async function importHistory(filename: string, isAsk: boolean = false): Promise<boolean> {
    if (filename.startsWith('"') && filename.endsWith('"')) filename = filename.slice(1, -1); // "file name" is possible
        
    if (!filename) {
        const historyFilesChoices: HistorySelection = [];
        for await (const file of glob('*.json', { cwd: RC_HISTORY_PATH, withFileTypes: true }))
            historyFilesChoices.push({ name: file.name.replace('.json', ''), value: path.join(file.parentPath, file.name) });

        if (!historyFilesChoices.length) {
            !isAsk && console.error('🛑 No history files found');
            return true;
        }
        filename = await select({ message: 'Select a history file to load:', choices: [{ name: '- none -', value: '' }, ...historyFilesChoices] }, TTY_INTERFACE);
    }
    if (filename === '') return true; // by choice

    let filePath = path.resolve(RC_HISTORY_PATH, filename);
    if (filePath && !path.extname(filePath)) filePath += '.json';
    const historyContent = await readFile(filePath, 'utf-8').catch(_ => undefined);

    if (!historyContent)
        console.error(`🛑 Could not read history file ${filePath}`);
    else {
        let content = JSON.parse(historyContent) as HistoryFile;

        let driver: Driver = drivers[settings.driver];
        if (content.historyStyle !== driver.historyStyle)
            console.error(`🛑 Importing history failed. File ${filePath} has an incompatible history style (${drivers[content.historyStyle]?.name ?? content.historyStyle}) than the current API ${driver.name}.`);
        else {
            console.log(`💾 Imported history from ${filePath}`);
            history = content.history;
        }
    }
    return true;
}


/**
 * Evaluates a given prompt string and executes corresponding debug commands.
 *
 * This function checks if the provided prompt matches specific debug commands.
 * It performs actions such as logging the result, executing stored commands,
 * retrieving or setting configuration settings, and exiting the process.
 *
 * @param prompt - The command prompt string to evaluate.
 * @param resultPrompt - The result from the API call to be potentially logged.
 * @returns A boolean indicating whether a recognized command was executed.
 */
async function promptTrigger(prompt: string, resultPrompt?: PromptResult): Promise<boolean> {

    if (prompt === ':h' || prompt === '/:help') {
        console.log(cliMd(`Possible prompt triggers\n
| Trigger | Short | Description |
|---|---|---|
| \`/:help\`                           | \`:h\` | Shows this help. |
| \`/:read\`                           | \`:r\` | Opens the default editor for a multiline input. |
| \`/:write\`                          | \`:w\` | Opens the default editor to show the last AI output. Use to save to a file. |
| \`/clip:read\`                       | \`:r+\` | Read from the clipboard and open the default editor. |
| \`/clip:write\`                      | \`:w+\` | Write the the last AI output to the clipboard. |
| \`/:end [<boolean>]\`                |        | Toggles end if assumed done, or turns it on or off. |
| \`/debug:response\`                  |        | Shows what the API generated and what the tool understood. |
| \`/debug:exec\`                      |        | Shows what the system got returned from the shell. Helps debug strange situations. |
| \`/debug:get <.baiorc-key>\`         |        | Gets the current value of the key. Outputs the system prompt, may spam the shell output. |
| \`/debug:set <.baiorc-key> <value>\` |        | Overwrites a setting. value must be a JSON formatted value. |
| \`/debug:settings\`                  |        | Gets all the current values of settings. May spam the shell output. |
| \`/history:export [<filename>]\`     | \`:hi [<filename>]\`    | Exports the current context to a file with date-time as name or an optional custom filename. |
| \`/history:export:md [<filename>]\`  | \`:he:md [<filename>]\` | Exports the current context to a markdown file for easier reading (can not be imported). |
| \`/history:import [<filename>]\`     | \`:he [<filename>]\`    | Imports the context from a history file or shows a file selection. |
| \`/:quit\`, \`/:exit\`               | \`:q\` | Will exit (CTRL+D or CTRL+C will also work). |
        `));
        return true;
    }
    if (prompt === '/debug:result') {
        console.log(resultPrompt);
        return true;
    }
    if (prompt === '/debug:exec') {
        console.log(doCommandsLastResult);
        return true;
    }
    if (prompt === '/debug:settings') {
        console.log(`settings =`, settings);
        return true;
    }
    if (prompt.startsWith('/debug:get ')) {
        const key = prompt.split(/(?<!\\)\s+/)[1];
        console.log(`settings.${key} =`, settings[key]);
        return true;
    }
    if (prompt.startsWith('/debug:set ')) {
        //* will not work with useAllSysEnv (is systemPrompt is already generated with this), saveSettings (saved already)
        //*  /debug:set <.baiorc-key> <JSON_formatted_value>
        const args = prompt.split(/(?<!\\)\s+/).filter(arg => arg.length > 0);
        const key = args[1];
        const value = JSON.parse(args.slice(2).join(' '));
        if (key in settings) settings[key] = value;
        else console.error(`Unknown setting: ${key}`);
        return true;
    }
    let exportType='json';
    if (prompt.startsWith('/history:export:md') || prompt.startsWith(':he:md')) {
        exportType = 'md';
    }
    if (prompt.startsWith('/history:export') || prompt.startsWith(':he')) {
        const key = prompt.split(/(?<!\\)\s+/).filter(arg => arg.length > 0).slice(1).join(' ');
        let filename = key || (new Date()).toLocaleString().replace(/[ :]/g, '-').replace(/,/g, '')+`_${settings.driver}_${settings.model.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
        if (filename.startsWith('"') && filename.endsWith('"')) filename = filename.slice(1, -1); // "file name" is possible
        mkdir(RC_HISTORY_PATH, { recursive: true }).catch(_ => {});

        let content = '';
        if (exportType == 'json') {
            if (!filename.toLowerCase().endsWith('.json')) filename += '.json';
            content = JSON.stringify({ version: settings.version, historyStyle: drivers[settings.driver].historyStyle, history}, null, 2);
        }
        else if (exportType == 'md') {
            if (!filename.toLowerCase().endsWith('.json')) filename += '.md';
            //content =  a flattened object, where all keys that do not have a child, will be inlcuded with key:content
            let contentStrings:string[] = [];
            function walk(obj) {
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
    if (prompt.startsWith('/history:import') || prompt.startsWith(':hi')) {
        let filename = prompt.split(/(?<!\\)\s+/).filter(arg => arg.length > 0).slice(1).join(' ');

        return importHistory(filename);
    }
    let pasteContent: string|undefined = undefined;
    if (prompt === '/clip:read' || prompt === ':r+' || prompt === ':r +') {
        pasteContent = clipboard.paste() || '';
        if (!pasteContent) {
            console.log(`🛑 Failed to read anything from clipboard`);
            return true;
        }
        console.log(`📋 Read from clipboard`);
    }
    if (prompt === '/:read' || prompt === ':r' || pasteContent) {
        const value = await editor({
            message: 'Waiting for your input in the editor.',
            waitForUseInput: false,
            default: pasteContent ?? '',
            theme: { style: { help: _ => `Enter your multiline content in the editor, save the file and close it.`, } }
        }).catch(_ => undefined);
        if (value) {
            prompt = value || '';
            return false;
        }
        return true;
    }
    if (prompt === '/clip:write' || prompt === ':w+' || prompt === ':w +') {
        clipboard.copy(resultPrompt?.answerFull);
        console.log(`📋 Copied to clipboard`);
        return true;
    }
    if (prompt === '/:write' || prompt === ':w') {
        await editor({
            message: 'Waiting for you to close the editor.',
            waitForUseInput: false,
            theme: { style: { help: _ => ``, } },
            default: resultPrompt?.answerFull,
            postfix: '.md',
        }).catch(_ => undefined);
        return true;
    }
    if (prompt.startsWith('/:end')) {
        const key = prompt.split(/(?<!\\)\s+/)[1];
        if (key === undefined || key.trim() === '')
            settings.endIfDone = !settings.endIfDone;
        else
            settings.endIfDone = {'true': true, 'false': false, '1': true, '0': false, 'on': true, 'off': false, 'yes': true, 'no': false}[key.toLowerCase()] ?? false;
        
        console.log(`${settings.endIfDone ? '🟢' : '🔴'}End if assumed done: ${settings.endIfDone ? 'yes' : 'no'}`);
        return true;
    }

    if (prompt === '/:exit' || prompt === '/:quit' || prompt === ':q') {
        process.exit(0);
    }

    // default
    return false;
}


/**
 * Initializes the prompt by asking the user for settings and returns the prompt
 * @returns the prompt
 */
async function init(): Promise<PromptAdditions> {
    let driver:Driver = drivers[settings.driver];
    let askSettings = settingsArgs['ask'] ?? (process.env.ASK_SETTINGS || !settings.saveSettings);
    if (settingsArgs['reset-prompts'] === true) { askSettings = settingsArgs['ask'] ?? false; settingsArgs['config'] = settingsArgs['config'] ?? true; } // do not ask for settings and prompt, if we are resetting the prompts so the other commands are not needed
    let promptAdditions: PromptAdditions;


    //*** NEEDS FIXING */
    // no tty ?
    if (!process.stdin.isTTY) {
        // issue:  https://github.com/SBoudrias/Inquirer.js/issues/1721
        console.error('⚠️ Piping files into Baio will cause problems with the prompt.');
        if (askSettings) {
            console.error('⚠️ Editing settings is disabled.');
            askSettings = false;
        }
    }


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

        console.info(`baio [-vhdmtaqseiucr] ["prompt string"]

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
  -e, --end                    end promping if assumed done
      --no-end                 ... to disable

  -i, --import <filename>      import context from a history file or list files select from
  -i *, --import *             ask for history file with a list, even if it would not

  -u, --update                 update user config (save config)
  -c, --config                 config only, do not prompt.

  -r, --reset                  reset (remove) config
  --reset-prompts              reset prompts only (use this after an update)

  --open <config>              open the file in the default editor or the agents path (env, config, agents, history)
  `);
        // You can pipe in text (like from a file) to be send to the API before your prompt.

        console.info('');
        console.info(`Settings config path: ${RC_FILE}`);
        console.info(`Environment config path: ${RC_ENVFILE}`);
        console.info(`Agents config path: ${RC_AGENTS_PATH}`);

        process.exit(0);
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

            if (additionalContentData)
                promptAdditions = [ ...(promptAdditions ?? []), { type: 'text', content: additionalContentData }];

            //! restore input capability
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
        
    //*** settings ***

    if (askSettings)
    {
        console.info(packageJSON.name, 'v' + packageJSON.version);
        console.info('ℹ️ use CTRL + D to exit at any time.');
    }

    if (askSettings)
    {//* API/Driver selection
        let driverChoices = Object.keys(drivers).map(key => ({ name: drivers[key].name, value: key }));
        settings.driver = await select({ message: 'Select your API:', choices: driverChoices, default: settings.driver || 'ollama' }, TTY_INTERFACE);
    }
    

    {//* api key test
        if (settings.driver !== 'ollama' && !drivers[settings.driver].apiKey()) {
            console.error(`🛑 ${drivers[settings.driver].name} has no API key configured in the environment`);
            process.exit(1);
        }
    }

    {//* connection test
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

    if (askSettings)
    {//* model selection
        const models = await getModels();
        let modelSelected = '';
        if (models.length) {
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


    let agentContent;
    {//* agent
        const agents = await getAgents();
        let agentFile = '';

        if (agents.length)
            agentFile = settingsArgs['agent'] ? agents[0].value : (!askSettings && settingsArgs['agent']!==null ? '' : await select({ message: 'Select an agent:', choices: [{ name: '- none -', value: '' }, ...agents ] }, TTY_INTERFACE));
        
        if (agentFile) {
            agentContent = await readFile(agentFile, 'utf-8').catch(_ => undefined);
            // get from file content the content from after the second '---' if available or everything from the beginning (if formating is broken)
            agentContent = '**Very important master rules, that must be followed and can overrule the rules from before:**\n' + (agentContent.split('---\n')[2] || agentContent);
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

        // always apply consts here, otherwise they would be saved and this be hard coded
        settings.systemPrompt = settings.systemPrompt.replaceAll('{{process_env_USERNAME}}', process.env.USERNAME!);
        settings.systemPrompt = settings.systemPrompt.replaceAll('{{process_env_OS}}', process.env.OS!);
        settings.systemPrompt = settings.systemPrompt.replaceAll('{{process_platform}}', process.platform);
        settings.systemPrompt = settings.systemPrompt.replaceAll('{{process_arch}}', process.arch);
        settings.systemPrompt = settings.systemPrompt.replaceAll('{{process_env_COMPUTERNAME}}', process.env.COMPUTERNAME!);
        settings.systemPrompt = settings.systemPrompt.replaceAll('{{process_env_SHELL}}', process.env.SHELL ?? process.env.COMSPEC!);
        settings.systemPrompt = settings.systemPrompt.replaceAll('{{process_env_POSH_SHELL}}', process.env.POSH_SHELL!);
        settings.systemPrompt = settings.systemPrompt.replaceAll('{{process_env_POSH_SHELL_VERSION}}', process.env.POSH_SHELL_VERSION!);
        settings.systemPrompt = settings.systemPrompt.replaceAll('{{process_env_HOME}}', process.env.HOME ?? process.env.USERPROFILE!);
        settings.systemPrompt = settings.systemPrompt.replaceAll('{{process_cwd}}', process.cwd());

        // apply invoking shell to system prompt
        settings.systemPrompt = settings.systemPrompt.replaceAll('{{invokingShell}}', getInvokingShell() ?? 'unknown');

        try {
            let output = execSync('links -version', { shell: getInvokingShell() });
            settings.systemPrompt = settings.systemPrompt.replaceAll('{{linksIsInstalled}}', '- links2 is installed and can be used: ' + output);
            DEBUG_OUTPUT && console.log('✔ links2 is installed');
        }
        catch (error) {
            settings.systemPrompt = settings.systemPrompt.replaceAll('{{linksIsInstalled}}', '- links2 is not yet installed');
            DEBUG_OUTPUT && console.warn('⚠️ links2 is not installed');
        }

        // apply system env to system prompt or clean up the placeholder
        settings.systemPrompt = settings.systemPrompt.replaceAll('{{useAllSysEnv}}', settings.useAllSysEnv ? `- You are running on (system environment): ${JSON.stringify(process.env)}` : '');

        settings.systemPrompt = settings.systemPrompt.replaceAll('{{useAgent}}', agentContent ? `---\n${agentContent}\n---\n` : '');

        DEBUG_OUTPUT_SYSTEMPROMPT && console.log('DEBUG\n', 'systemPrompt:', settings.systemPrompt);
    }

    return promptAdditions;
}


//* MAIN
{
    let promptAdditions = await init();
    let resultPrompt: PromptResult|undefined = undefined;
    let prompt:Prompt = '';


    while (true) {
        do prompt = await doPromptWithCommands(resultPrompt);
        while (await promptTrigger(prompt, resultPrompt));

        resultPrompt = await doPrompt(prompt, promptAdditions);
        
        if (settings.endIfDone && resultPrompt.isEnd) break;
    }


    DEBUG_OUTPUT && console.log(resultPrompt);
}