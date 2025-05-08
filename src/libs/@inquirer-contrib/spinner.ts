/**
 * Spinner for @inquirer/prompt (v8+)
 * 
 * @package @inquirer-contrib/spinner
 * 
 * @version 1.0.0
 * @author Nabil Redmann <repo@bananaacid.de>
 * @license MIT
 */
import {type Status, type Theme, createPrompt, useState, usePrefix, useEffect, makeTheme, useKeypress, } from '@inquirer/core';
import type { Context, InquirerReadline, PartialDeep } from '@inquirer/type';
import type { KeypressEvent } from '@inquirer/core';import colors from 'yoctocolors-cjs';
import figures from '@inquirer/figures';
import ansiEscapes from 'ansi-escapes';

type SpinnerTheme = {
    style: {
        // type hint is the original one, no need to add one here
        error: (text:string) => string;
    };
    prefix: {
        /**
         * defaults to a red ✘ (`colors.red(figures.cross)`)
         */
        error: string;
    };
};

type SpinnerConfig = {
    message: string;
    messageDone?: string;
    messageError?: string;

    keypressHandler?: KeypressHandler;
    theme?: PartialDeep<Theme<SpinnerTheme>>;
};


type SpinnerControl = {
    instance: undefined | Promise<void> & {cancel: () => void};
    
    /**
     * Starts the spinner. If the spinner is already running, it will be destroyed first.
     * @param {string} [title] - The title to display instead of the default one
     * @returns {Promise<void>} when its ready
     */
    start(title?: string): Promise<void>;

    /**
     * Sets the status to 'done' and waits for the spinner to finish
     * This can be waited for
     * @param {string} [title] - The title to display instead of the default one
     * @returns {Promise<void>} when its done
     */
    success(title?: string): Promise<void>;

    /**
     * Same as success, but sets the status to 'error'
     * @param {string} [title] - The title to display instead of the default one
     * @returns {Promise<void>} when its done
     */
    error(title?: string): Promise<void>;

    /**
     * use to log output while the spinner is running
     * !! this is not using the context to write to !!
     */
    log(...params: unknown[]): void;

    /** 
     * Shows the current frame of the spinner and jumps out of the prompt
     * Is like using AbortController signal.abort(), just from inside
     */
    cancel(): void;

    /**
     * Destroys the spinner.
     * calls .cancel() and will also set clearPromptOnDone=true so nothing is shown after it finishes
     */
    destroy(): void;
};


type KeypressHandler = ({
    key, rl,
    config, theme, status, setStatus, prefix
}:{
    key: KeypressEvent & {meta?:boolean, sequence?:string, shift?:boolean}, rl: InquirerReadline,
    config: SpinnerConfig, theme: any, status: any, setStatus: any, prefix: any}
) => Promise<{isDone?:boolean, isConsumed?:boolean}|void>;


const spinner = function Spinner(config: SpinnerConfig, context?: Context): SpinnerControl {

    const innerContext = context || {};

    const spinnerTheme: SpinnerTheme = {
        style: { error: text => colors.red(text), },
        prefix: { error: colors.red(figures.cross), },
    };

    let resolveDone:Function;
    
    // we use a factory here to make sure the prompt can be re-created if start() is called while there is an active instance on the same spinner (making the spinner resurectable)
    const promptFactory = async () => createPrompt<void/*type of return in done() */, SpinnerConfig>((config, done) => {
        const [status, setStatus] = useState<Status>('loading');

        const theme = makeTheme<SpinnerTheme>(spinnerTheme, config.theme);

        const text = status === 'done' ? config.messageDone ?? config.message : config.message;
        const message = theme.style.message(text, status);

        const output = status === 'done' ? message : status === 'error' ? theme.style.error(config.messageError ?? text) : message;

        const prefix = usePrefix({ status, theme });


        useKeypress(async (key, rl) => {
            let isDone = false;
            if (config.keypressHandler) {
                let act = await config.keypressHandler({key, rl, config, theme, status, setStatus, prefix});
                if (act && act?.isDone) {
                    isDone = true;
                    // setStatus('done');
                    // done();
                    resolveDone('done');
                }
                if (act && act?.isConsumed) return;
            }
            
            // no target for isConsumed, since there is no default handler
        });

        const start = async(rl: InquirerReadline) => {
            rl.pause();

            // wait for signal
            let statusNew = await new Promise<Status>(resolve => resolveDone = resolve);
            
            rl.resume();
            setStatus(statusNew || 'done');
            done();
        }

        useEffect((rl) => {
            start(rl);
        }, []);

        return [prefix, output, ansiEscapes.cursorHide].filter(Boolean).join(' ');
    });

    let backupClearPromptOnDone: Context['clearPromptOnDone'];

    return {
        instance: undefined,

        async start(title?) {
            this.instance && this.destroy();

            if (title) config.message = title;
            innerContext.clearPromptOnDone = backupClearPromptOnDone;
            this.instance = (await promptFactory())(config, innerContext);
        },

        async success(title?) {
            if (title) config.messageDone = title;
            resolveDone && resolveDone('done');
            this.instance && await this.instance;
        },

        async error(title?) {
            if (title) config.messageError = title;
            resolveDone && resolveDone('error');
            this.instance && await this.instance;
        },

        log(...params) {
            /*
            0: Clear from the cursor to the end of the line
            1: Clear from the cursor to the beginning of the line
            -1: Clear the entire line. This is usually what you want when replacing a line
            */
            process.stdout.clearLine(-1);
            process.stdout.cursorTo(0); // move cursor to line start
        
            console.log.apply(this, params);
        },

        cancel() {
            this.instance && this.instance.cancel();
            this.instance = undefined;
        },

        destroy() {
            backupClearPromptOnDone = innerContext.clearPromptOnDone;
            innerContext.clearPromptOnDone = true;
            this.cancel();
        },
    };
}

export {
    type SpinnerTheme,
    type SpinnerConfig,
    type SpinnerControl,
    type KeypressHandler,

    spinner,
};


/*

import { spinner } from '../../src/libs/@inquirer-contrib-spinner.ts';



//tests:



let prom = spinner({ message: 'Doing something', messageDone: 'Did something' }, { clearPromptOnDone: false });

prom.start();

// test output while spinner is active
let t = setInterval(() => {
    prom.log('TICK');
}, 750);


// blocking action
await new Promise<void>(resolve => setTimeout(_ =>
    {
        clearInterval(t);
        resolve();
    }
    , 2000
));

// await prompt to be done
await prom.error();

// now we can output something without landing before the spinner done-message
console.log('!!!');


const controller = new AbortController();
const signal = controller.signal;

let prom2 = spinner({ message: 'Doing something', messageDone: 'Did something', messageError: 'Did not do something' }, { clearPromptOnDone: false, signal });

prom2.start('Second prompt');
prom2.destroy();


prom2.start('Second prompt2');  // this should NOT vanish !!


t = setInterval(() => {
    prom.log('TICK');
}, 750);

await new Promise<void>(resolve => setTimeout(_ =>
    {
        // controller.abort();
        prom2.cancel();         // like abort
        //prom2.destroy();      // also remove the prompt

        clearInterval(t);
        resolve();
    }
    , 2000
));

await prom2.success();


console.log('2!!!');



// clean up
process.exit(0);


*/