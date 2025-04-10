/**
 * node_ai_operator
 * 
 * Mainly for Ollama, commandline based
 * 
 * @author Nabil Redmann <repo@bananaacid.de>
 * @license ISC
 */

//* node imports
import packageJSON from './package.json' with { type: 'json' };
import { exec } from 'node:child_process';
import path from 'node:path';
import { writeFile, readFile, unlink } from 'node:fs/promises';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { parseArgs } from 'node:util';

import cliMd from 'cli-markdown';

import { input, select, checkbox } from '@inquirer/prompts';
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


//* get user dot env
// node:parseEnv sucks really badly.
const rcEnvFilePath = path.join(os.homedir(), '.baioenvrc');
(await readFile(rcEnvFilePath, 'utf-8').catch(_ => '')).split('\n').map(line => line.trim()).filter(line => line.length > 0 && !line.startsWith('#')).map(line => line.split(/=(.*)/).map(part => part.trim())).filter(line => line[1].length > 0).forEach(line => process.env[line[0].toUpperCase().replaceAll(' ', '_')] = line[1]);


//* set DEBUG consts
const DEBUG_OUTPUT = process.env.DEBUG_OUTPUT || false;
const DEBUG_APICALLS = process.env.DEBUG_APICALLS || false;
const DEBUG_SYSTEMPROMPT = process.env.DEBUG_SYSTEMPROMPT || false;
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


//* get args (partyl settings)
const args = await new Promise<ReturnType<typeof parseArgs>>(resolve => resolve(parseArgs({
    allowPositionals: true,
    options: {
        version: { short: 'v', type: 'boolean' }, // DO NOT USE DEFAULTS in .OPTIONS{}
        help:    { short: 'h', type: 'boolean' },
        help2:   { short: '?', type: 'boolean' },
        
        driver:  { short: 'd', type: 'string'  },
        model:   { short: 'm', type: 'string'  },
        temp:    { short: 't', type: 'string'  },

        ask:     { short: 'a', type: 'boolean' },
        sysenv:  { short: 's', type: 'boolean' },
        end:     { short: 'e', type: 'boolean' },

        config:  { short: 'c', type: 'boolean' },
        update:  { short: 'u', type: 'boolean' },
        reset:   { short: 'r', type: 'boolean' },
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
const rcFilePath = path.join(os.homedir(), '.baiorc');
let settingsSaved: Settings|undefined;
if (settingsArgs.reset)
    await unlink(rcFilePath).catch(_ => {});
else
    settingsSaved = await readFile(rcFilePath, 'utf-8').then(JSON.parse).catch(_ => {}) as Settings;


//* default settings
let settingsDefault: Settings = {
    driver: 'googleai',
    // each driver has a default model, this can be overriden here
    model: '',      // BEST: gemma3:12b (12.2B)  FASTEST: goekdenizguelmez/JOSIEFIED-Qwen2.5:latest (7.6B)   IS OK: phi4:latest (14.7B)
    temperature: 0,   // 0.7

    useAllSysEnv: false,    // use all system environment variables in the system prompt
    endIfDone: true,        // don't allow the AI to end the conversation (it would, if it thinks it is done)

    saveSettings: false,    // save settings to the .baiorc file -- if this is true, the options will not be asked

    defaultPrompt: 'list all details of files in directory', 
        // 1. get origin property from the api https://httpbin.org/get and only save the origin value to "info.txt" in the current folder. to sucessfully end: the saved value must be an IP adress
        // 2. read the info.txt and check if the content is an IP

    fixitPrompt: `Something went wrong! Ensure all steps are followed, results are validated, and commands are properly executed. Reevaluate the goal after each action and make sure to append <END/> only when the task is fully completed. Try again with a different approach, and if more information is needed, request it.`,

    systemPrompt: `
        You are a helpful AI operator that generates and validates command-line commands. 
        You create commandline commands for your system and validate the result. The commands will automatically be executed on the host system with the next prompt by your doing.
        You want to solve the users prompt with concise and meaningful commandline commands and avoid guessing or duplicates and supply executable commands that will be executed.

        ### Your System Information:
        - User: ${process.env.USERNAME}
        - OS: ${process.env.OS}
            - Plattform: ${process.platform}
            - Architecture: ${process.arch}
        - Computer Name: ${process.env.COMPUTERNAME}
        - **Default Shell (used for execution)**: {{invokingShell}}
        - **Fallback Shell (only used for execution if default is unknown):** ${process.env.SHELL ?? process.env.COMSPEC}
        - Installed PowerShell: ${process.env.POSH_SHELL}, version ${process.env.POSH_SHELL_VERSION}
        - User Home Directory: ${process.env.HOME ?? process.env.USERPROFILE}
        - Current Directory: ${process.cwd()}
        {{useAllSysEnv}}

        ### Initial Prompt:
        - First check what OS and Shell for execution you have available, check in "Your System Information" for Default Shell and Fallback Shell.
        - Do **not** use <END/> in the initial prompt.

        ### Output Rules:
        - Explain **briefly** what you are doing and what each command does.
        - **DO NOT** use fenced code blocks (\`\`\`) for executable commands. Instead, always use:  
            \`<CMD>command_here</CMD>\`
            (Use **single backticks** around the <CMD> tags, but not inside them.)
        - **If multiple commands need to be executed in sequence, combine them into one command** to maintain the shell context.  
        - Example (incorrect):  
            \`<CMD>cd /myfolder</CMD>\`
            \`<CMD>touch file.txt</CMD>\`
        - Example (correct):  
            \`<CMD>cd myfolder && touch file.txt</CMD>\`
        - The commands must work in the current shell for execution, commands of another shell do not work. But you can call another shell, that is available, to execute commands.
        - If more info is needed, ask the user and **append** <NEED-MORE-INFO/>.
        - If responding to a user without generating a command, **append** <NEED-MORE-INFO/>.

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
        - Prefer using **tables***, or use lists, or inline code where applicable.
        - Do not put tables or lists inside of **fenced code blocks**.
        - Do not put <END/> inside of single backticks or fenced code blocks.

        ### Completion:
        - Only append <END/> if **all tasks are successfully completed and no further action is required**.
        - **Reevaluate the goal** after each execution:
        - If the goal has changed due to user input or execution results, adjust accordingly.
        - If an unexpected issue arises or the goal hasn't been fully completed, resolve it before considering completion.
        - If any current command fails, validation is required, or further steps are needed, **do not** use <END/>.
        - **Ensure all output has been verified and actions have been taken**. If no further steps are required and the task is complete, append <END/> at the end.

        ### Helpers:
        - Getting an REST-API, create a command by using curl and proccess the <CMD-OUTPUT> afterwards.
            - Make sure it uses the correct shell and parameters.
            - You might use Invoke-WebRequest (Powershell), HTTPie or similar tools, if they are installed and curl is unavailable.
            - usually use the "accept: application/json" header.
        - To install links2 on windows, check use the links from the archives at http://links.twibright.com/download.php . You need to download the needed file from the provided urls archive. After installing, make sure it is usable (binary basename is 'links') and if not make the binary usable.
        - To install links2 on linux or mac, use an installed system packagemanager.
        - Always use links2 with following params '-html-numbered-links 1 -dump' before appending the url.
        - To find something on the internet use duckduckgo with search term ('https://duckduckgo.com/?q=' + searchterm) and use links2 (if available) or parse the result to read the website contents.

        Follow these rules strictly to ensure accurate command execution and validation.
    `,
};
let settings: Settings = {
    ...settingsDefault,
    ...settingsSaved ?? {},
    // only add settingsArgs if the key is allready in settingsDefault (filters out version and others)
    ...Object.entries(settingsDefault).reduce((acc, [k, v]) => settingsArgs[k] ? { ...acc, [k]: settingsArgs[k] } : acc, {})
};

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
async function api(prompt: string): Promise<promptResult> {
    // fetch from ollama api

    const driver: Driver = drivers[settings.driver];

    spinner.start(`Waiting for ${driver.name}\'s response ...`);


    let {contentRaw, history: historyNew} = await driver.getChatResponse(settings, history, prompt);
    
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

    // User output:
    // add ` before and after all <CMD> tags and after all </CMD> tags, if missing --- also remove tags
    content = content.replaceAll(/\`*\ *<CMD>(.*?)<\/CMD>\ *\`*/g, '\n ▶️ `$1`');
    try {
        content = cliMd(content); // crashes sometimes : Cannot read properties of undefined (reading 'at') -- /node_modules/cli-html/lib/tags/code.js:12:25
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
                if (error) {
                    reject(error);
                } else {
                    resolve(stdout);
                }
            });
        })
        .then(stdout => '<CMD-OUTPUT>' + stdout + '</CMD-OUTPUT>')
        .catch(error => '<CMD-ERROR>' + error + '</CMD-ERROR>');
        
        results.push('<CMD-INPUT>' + command + '</CMD-INPUT>\n' + result);

        spinner.success();
    }

    return results.join('\n<-----/>\n');
}



/**
 * Wrapper to output the api result to the console 
 * @param prompt 
 * @returns api result
 */
async function doPrompt(prompt: string): Promise<promptResult> {
    const result = await api(prompt);
    
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
async function doPromptWithCommands(result: promptResult): Promise<string> {
    let resultCommands = "";

    if (!result.commands.length) {

        console.log('⚠️ No commands found in response, no execution will be performed.');

        /**
         *  check if there was a <NEED-MORE-INFO/> in the response
         *  if yes, ask the user for more info and do the prompt again
         */

        if (result.needMoreInfo) {
            resultCommands = await input({ message: 'Enter more info:' });

            // ... need to loop back to the prompt ("chat")
        }
        else {
            // do the fixit prompt, because there was no command
            resultCommands = settings.fixitPrompt;
        }

    }
    else {

        const commands = await checkbox({
            message: 'Select the commands to execute',
            choices: result.commands.map((command) => ({ name: command, value: command, checked: true })),
        });

        if (!commands.length) {
            resultCommands = await input({ message: 'Enter more info:' });
            return resultCommands;
        }

        //const execNow = await toggle({ message: 'Execute commands now?', default: false });
        const execNow = true;

        if (execNow) {
            resultCommands = await doCommands(commands);

            DEBUG_OUTPUT && console.info('DEBUG\n', resultCommands);

            // ... go and evaluate the commands result
        }
        else {

            /**
             *  ask if the user wants to prompt instead, to get a better result
             * 
             *  ... and loop back to the prompt
             */

            resultCommands = await input({ message: 'Enter more info:' });
        }
    }

    return resultCommands;
}


async function init(): Promise<string> {
    let driver:Driver = drivers[settings.driver];
    let askSettings = settingsArgs['ask'] ?? (process.env.ASK_SETTINGS || !settings.saveSettings);

    if (settingsArgs['version'])
    {
        console.info(packageJSON.version);
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

        console.info(`baio [-vhdmtaseucr] ["prompt string"]

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
`);

        console.info('');
        console.info(`Settings config path: ${rcFilePath}`);
        console.info(`Environment config path: ${rcEnvFilePath}`);

        process.exit(0);
    }

    if (askSettings)
    {
        console.info(packageJSON.name, 'v' + packageJSON.version);
        console.info('ℹ️ use CTRL + D to exit at any time.');
    }

    if (askSettings)
    {//* API/Driver selection
        let driverChoices = Object.keys(drivers).map(key => ({ name: drivers[key].name, value: key }));
        settings.driver = await select({ message: 'Select your API:', choices: driverChoices, default: settings.driver || 'ollama' });
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
            modelSelected = await select({ message: 'Select your model:', choices: models, default: settings.model || driver.defaultModel });
        }
        if (!models.length || !modelSelected) {
            if (settings.driver == 'ollama')
                console.warn('⚠️ The model you enter, will be downloaded and this process might really take a while. No progress will show.');
            modelSelected = await input({ message: 'Enter your model to use:', default: settings.model || driver.defaultModel });
        }
        settings.model = modelSelected;
    }
    
    if (askSettings)    
    {//* options
        if (DEBUG_SYSTEMPROMPT)
            settings.systemPrompt = await input({ message: 'Enter your system prompt', default: settings.systemPrompt });

        settings.temperature = await input({ message: 'Enter the temperature (0 for model\'s default):', default: settings.temperature.toString() }).then(answer => parseFloat(answer));
        
        settings.useAllSysEnv = await toggle({ message: 'Use all system environment variables:', default: settings.useAllSysEnv });
        
        settings.endIfDone = await toggle({ message: 'End if assumed done:', default: settings.endIfDone });
    }
    
    {//* save settings
        if (askSettings)
            settings.saveSettings = await toggle({ message: `Automatically use same settings next time:`, default: settings.saveSettings });

        // write settings if it is asked for, or if it is not asked for but already saved to remove it
        if (settingsArgs['update'] ?? (settings.saveSettings || (!settings.saveSettings && settingsSaved))) {
            spinner.start(`Updating settings in ${rcFilePath} ...`);
            await writeFile(rcFilePath, JSON.stringify(settingsArgs['update'] ?? settings.saveSettings ? settings : {}, null, 2), 'utf-8');
            spinner.success();
        }
    }
    
    let prompt;
    {//* user prompt
        if (settingsArgs['config']) process.exit(0);

        if (argsPrompt) {
            prompt = argsPrompt;
            DEBUG_OUTPUT && console.log('✔ What do you want to get done:', argsPrompt);
        }
        else
            prompt = argsPrompt || await input({ message: 'What do you want to get done:', default: settings.defaultPrompt });
    }

    {//* system prompt
        // apply invoking shell to system prompt
        settings.systemPrompt = settings.systemPrompt.replaceAll('{{invokingShell}}', getInvokingShell() ?? 'unknown');

        // apply system env to system prompt or clean up the placeholder
        settings.systemPrompt = settings.systemPrompt.replaceAll('{{useAllSysEnv}}', settings.useAllSysEnv ? `- You are running on (system environment): ${JSON.stringify(process.env)}` : '');

        DEBUG_OUTPUT_SYSTEMPROMPT && console.log('DEBUG\n', 'systemPrompt:', settings.systemPrompt);
    }

    return prompt;
}


// MAIN
{
    let prompt = await init();

    let resultPrompt: promptResult;


    while (true) {
        resultPrompt = await doPrompt(prompt);
        
        if (settings.endIfDone && resultPrompt.isEnd) break;

        prompt = await doPromptWithCommands(resultPrompt);
    }


    DEBUG_OUTPUT && console.log(resultPrompt);
}