//!  it is supposed to replace the yocto-spinner in the future, with the added benefit of having a keypress handler

/**
 * Spinner for @inquirer/prompt (v8+)
 * 
 * @usage
 *  import { spinner, ExitPromptError } from '@inquirer-contrib/spinner-with-actions';
 *  import { isSpaceKey, isEnterKey } from '@inquirer/core';
 *  const spin = spinner({
 *      message: 'Doing something ',
 *      hint: 'press <esc> to cancel, <enter> to error, <space> to success',
 *      messageDone: 'Did something',
 *      messageError: 'Did not do something',
 * 
 *      keypressHandler: async function({key}) {
 *          if (key.name == 'escape') {
 *              spin.cancel();
 *          }
 *          if (isSpaceKey(key)) {
 *              spin.success();
 *          }
 *          if (isEnterKey(key)) {
 *              spin.error();
 *          }
 *      },
 *  }, { clearPromptOnDone: false });
 *  await spin.start();  // wait until it is initialized and running
 *  spin.setMessage('Doing something else');  // change the message anytime
 *  let reason = await spin.wait()
 *      .catch(e => { if (e instanceof ExitPromptError) return 'cought CTRL+C'; else throw e; }); // or let the error fall through to exit the program
 *  console.log('reason:', reason);
 *  ...
 * 
 * @package @inquirer-contrib/spinner-with-actions
 * 
 * @version 1.0.0
 * @author Nabil Redmann <repo@bananaacid.de>
 * @license MIT
 */
import {type Status, type Theme, createPrompt, useState, usePrefix, useEffect, makeTheme, useKeypress, CancelPromptError, ExitPromptError } from '@inquirer/core';
export { CancelPromptError, ExitPromptError, AbortPromptError } from '@inquirer/core';
import type { Context, InquirerReadline, PartialDeep } from '@inquirer/type';
import type { KeypressEvent } from '@inquirer/core';
import colors from 'yoctocolors-cjs';
import figures from '@inquirer/figures';
import ansiEscapes from 'ansi-escapes';

type SpinnerTheme = {
    style: {
        //* these are added here to overwrite them for the spinner
        error: (text:string) => string;
        hint: (text:string) => string;
    };
    prefix: {
        //* we overwrite it to, to default to a red ✘ (`colors.red(figures.cross)`)
        error: string;
    };
};

type SpinnerConfig = {
    message: string;
    messageDone?: string;
    messageError?: string;
    hint?: string;

    keypressHandler?: KeypressHandler;
    theme?: PartialDeep<Theme<SpinnerTheme>>;
};

type CreatePromptInstanceType = any;

type SpinnerControl = {
    /**
     * Retrieves the current instance of the spinner.
     * @returns {Promise<CreatePromptInstanceType | undefined>} A promise that resolves to the spinner instance if available, otherwise undefined.
     */
    getInstance(): CreatePromptInstanceType;

    /**
     * Waits for the current spinner instance to complete before proceeding.
     * 
     * This function returns a promise that resolves when the spinner instance
     * has finished its task. It is useful for synchronizing operations that
     * depend on the completion of the spinner.
     * 
     * Catches most common prompt errors and returns them as status (except ExitPromptError).
     * If you do not want that, `await spinner.getInstance()` instead.
     * @returns {Promise<ResultStatus>} - A promise that resolves when the spinner instance has finished its task.
     */
    wait(): Promise<ResultStatus>;

    /**
     * Starts the spinner. If the spinner is already running, it will be destroyed first.
     * @param {string} [title] - The title to display instead of the default one.
     * @param {AbortSignal} [signal] - An optional AbortSignal to allow cancellation.
     * @returns {Promise<void>} - When it is ready.
     */
    start(title?: string, signal?: AbortSignal): CreatePromptInstanceType;

    /**
     * Sets the message that is displayed while the spinner is running.
     * 
     * You can also change the config.message (it is reactive).
     * @param title - The new message to display.
     * @returns {void}
     */
    setMessage(title: string): void;

    /**
     * Sets the status to 'done' and waits for the spinner to finish.
     * This can be waited for
     * @param {string} [title] - The title to display instead of the default one.
     * @returns {Promise<void>} - When it is done.
     */
    success(title?: string): Promise<void>;

    /**
     * Same as success, but sets the status to 'error'.
     * @param {string} [title] - The title to display instead of the default one.
     * @returns {Promise<void>} - When it is done.
     */
    error(title?: string): Promise<void>;

    /**
     * Use to log output while the spinner is running.
     */
    log(...params: unknown[]): void;

    /** 
     * Shows the current frame of the spinner and jumps out of the prompt.
     * Is like using AbortController signal.abort(), just from inside.
     * @returns {Promise<void>} - When it is done.
     */
    cancel(): Promise<void>;

    /**
     * Destroys the spinner.
     * calls .cancel() and will also set clearPromptOnDone=true so nothing is shown after it finishes.
     * @returns {Promise<void>} - When it is done.
     */
    destroy(): Promise<void>;
};


type KeypressHandler = ({
    key, rl,
    config, theme, status, setStatus, prefix
}:{
    key: KeypressEvent & {meta?:boolean, sequence?:string, shift?:boolean}, rl: InquirerReadline,
    config: SpinnerConfig, theme: any, status: any, setStatus: any, prefix: any}
) => Promise<{isDone?:boolean, isConsumed?:boolean}|void>;


type ResultStatus = 'done'|'error'|'cancelled'|'aborted' /*|'exited' */;

const spinner = function Spinner(config: SpinnerConfig, context?: Context): SpinnerControl {

    const innerContext = context || {};

    const spinnerTheme: SpinnerTheme = {
        style: { error: text => colors.red(text), hint: text => colors.dim(text) },
        prefix: { error: colors.red(figures.cross), },
    };

    let resolveDone:(status:ResultStatus)=>void;
    
    // we use a factory here to make sure the prompt can be re-created if start() is called while there is an active instance on the same spinner (making the spinner resurectable)
    const promptFactory = async () => createPrompt<ResultStatus/*type of return in done() */, SpinnerConfig>((config, done) => {
        const [status, setStatus] = useState<Status>('loading');

        const theme = makeTheme<SpinnerTheme>(spinnerTheme, config.theme);

        const text = status === 'done' ? config.messageDone ?? config.message : config.message;
        const message = theme.style.message(text, status);

        const output = status === 'done' ? message : status === 'error' ? theme.style.error(config.messageError ?? text) : message;

        const hint = (!config.hint || status === 'done' || status === 'error') ? '' : theme.style.hint('(' + config.hint + ')');

        const prefix = usePrefix({ status, theme });


        useKeypress(async (key, rl) => {
            if (config.keypressHandler) {
                let act = await config.keypressHandler({key, rl, config, theme, status, setStatus, prefix});
                if (act && act.isDone) {
                    resolveDone('done');
                }
                if (act && act.isConsumed) return;
            }
            // no target for isConsumed, since there is no default handler
        });

        const start = async(rl: InquirerReadline) => {
            // wait for signal
            let statusNew = await new Promise<ResultStatus>(resolve => resolveDone = resolve) || 'done';
            
            setStatus(statusNew);
            done(statusNew);
        }

        useEffect((rl) => {
            start(rl);
        }, []);

        return [prefix, output, hint, ansiEscapes.cursorHide].filter(Boolean).join(' ');
    });

    let backupClearPromptOnDone: Context['clearPromptOnDone'];
    let instance:CreatePromptInstanceType|undefined;

    return {
        async getInstance() {
            return instance;
        },
        
        async wait() {
            let reason = await instance.catch((e:Error) => { 
                if (e instanceof CancelPromptError) return 'cancelled';
                if (e instanceof AbortController) return 'aborted';
                //? if (e instanceof ExitPromptError) return 'exited';  --->  this is CTRL+C ... we do not want to catch it
                else throw e; 
            });
            return reason;
        },

        setMessage(title) {
            config.message = title;
        },

        async start(title?, signal?) {
            instance && this.destroy();

            if (signal) { context = context || {}; context.signal = signal; }
            if (title) config.message = title;
            innerContext.clearPromptOnDone = backupClearPromptOnDone;
            instance = (await promptFactory())(config, innerContext);
        },

        async success(title?) {
            if (!instance) return;
            
            if (title) config.messageDone = title;
            resolveDone && resolveDone('done');
            instance && await instance;
        },

        async error(title?) {
            if (!instance) return;

            if (title) config.messageError = title;
            resolveDone && resolveDone('error');
            instance && await instance;
        },

        log(...params) {
            let stdout = (context?.output ?? process.stdout) as NodeJS.Process['stdout']|undefined;
            /*
            0: Clear from the cursor to the end of the line
            1: Clear from the cursor to the beginning of the line
            -1: Clear the entire line. This is usually what you want when replacing a line
            */
            stdout?.clearLine?.(-1);
            stdout?.cursorTo?.(0); // move cursor to line start
            
            if (!context?.output || stdout == process.stdout) console.log.apply(this, params)
            else if (stdout?.write) stdout?.write(params.join(' '));
        },

        async cancel() {
            if (!instance) return;
            
            try {
                instance.cancel();
                await instance;
            }
            //? error thrown is expected (by cancel) -> https://github.com/SBoudrias/Inquirer.js/blob/inquirer%4012.6.1/packages/core/src/lib/create-prompt.ts#L59
            catch (e) { if (e instanceof CancelPromptError) return; else throw e; } 
            instance = undefined;
        },

        async destroy() {
            if (!instance) return;
            
            backupClearPromptOnDone = innerContext.clearPromptOnDone;
            innerContext.clearPromptOnDone = true;
            await this.cancel();
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
