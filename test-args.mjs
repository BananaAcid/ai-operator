import { parseArgs } from 'node:util';


//* get args (partyl settings)
const args = parseArgs({
    allowPositionals: true,
    options: {
        ask: {
            type: 'boolean',
            short: 'a',
            default: true
        },
        version: {
            type: 'boolean',
            short: 'v',
            default: true
        }
    }, args: ['node', 'index.ts', '--version', '--ask', 'no', 'some string'].slice(2)}
);
const reMap = {
    ask: 'saveSettings',
    //version: 'version',
};

let argsReMapped = Object.entries(args.values).reduce((acc, [k, v]) => ({ ...acc, [reMap[k] || k]: v }), {});

console.log(argsReMapped, args.positionals.join(' '));


let settingsDefault = {
    saveSettings: false,
    driver: 'ollama',
    model: 'llama2-70b-chat',
    temperature: 0.5,
    useAllSysEnv: true,
    endIfDone: true,
};


let settingsRemapped = 
    // only add argsReMapped if the key is allready here in settings
    Object.entries(settingsDefault).reduce((acc, [k, v]) => ({ ...acc, [k]: argsReMapped[k] || v }), {})
;

// merged
let settings = { ...settingsDefault, ...settingsRemapped };

console.log(settings);