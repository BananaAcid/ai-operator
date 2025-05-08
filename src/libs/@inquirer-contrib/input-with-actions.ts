/**
 * This is a modified version of the @inquirer/input with some added features.
 * Original: https://github.com/SBoudrias/Inquirer.js
 *  
 * @package @inquirer-contrib/input-with-actions
 *
 * @modified by Nabil Redmann.
 *   added config.keypressHandler
 *   addded config.initialString
 *
 * @see @inquirer/input@4.1.9
 * @version 1.0.0
 * @license MIT
 */
import {
    createPrompt,
    useState,
    useKeypress,
    usePrefix,
    useEffect,
    isEnterKey,
    isBackspaceKey,
    makeTheme,
    type Theme,
    type Status,
  } from '@inquirer/core';
  import type { PartialDeep } from '@inquirer/type';

  import { type InquirerReadline } from '@inquirer/type';
  import type { KeypressEvent } from '@inquirer/core';

  
  type InputTheme = {
    validationFailureMode: 'keep' | 'clear';
  };
  
  const inputTheme: InputTheme = {
    validationFailureMode: 'keep',
  };
  
  export type KeypressHandler = ({
    key, rl,
    value, setValue, defaultValue, setDefaultValue,
    theme, status, setStatus, prefix
  }:{
    key: KeypressEvent & {meta?:boolean, sequence?:string, shift?:boolean}, rl: InquirerReadline,
    value: string, setValue: (value: string) => void, defaultValue: string, setDefaultValue: (value: string) => void,
    theme: any, status: any, setStatus: any, prefix: any}
  ) => Promise<{isDone?:boolean, isConsumed?:boolean}|void>;

  type InputConfig = {
    message: string;
    default?: string;
    required?: boolean;
    transformer?: (value: string, { isFinal }: { isFinal: boolean }) => string;
    validate?: (value: string) => boolean | string | Promise<string | boolean>;
    theme?: PartialDeep<Theme<InputTheme>>;
    keypressHandler?: KeypressHandler;
    initial?: string;
  };
  
  export default createPrompt<string, InputConfig>((config, done) => {
    const { required, validate = () => true } = config;
    const theme = makeTheme<InputTheme>(inputTheme, config.theme);
    const [status, setStatus] = useState<Status>('idle');
    const [defaultValue = '', setDefaultValue] = useState<string>(config.default);
    const [errorMsg, setError] = useState<string>();
    const [value, setValue] = useState<string>('');
  
    const prefix = usePrefix({ status, theme });

    useEffect((rl) => {
      if (config.initial) {
        setValue(config.initial);
        rl.write(config.initial);
      }
    }, []);

    useKeypress(async (key, rl) => {
      // Ignore keypress while our prompt is doing other processing.
      if (status !== 'idle') {
        return;
      }

      let isDone = false;
      if (config.keypressHandler) {
          let act = await config.keypressHandler({key, rl, theme, status, setStatus, prefix, value, setValue, defaultValue, setDefaultValue,});
          if (act && act?.isDone) {
              isDone = true;
              setStatus('done');
              done(value || defaultValue);
          }
          if (act && act?.isConsumed) return;
      }

  
      if (isEnterKey(key) || isDone) {
        const answer = value || defaultValue;
        setStatus('loading');
  
        const isValid =
          required && !answer ? 'You must provide a value' : await validate(answer);
        if (isValid === true) {
          setValue(answer);
          setStatus('done');
          done(answer);
        } else {
          if (theme.validationFailureMode === 'clear') {
            setValue('');
          } else {
            // Reset the readline line value to the previous value. On line event, the value
            // get cleared, forcing the user to re-enter the value instead of fixing it.
            rl.write(value);
          }
          setError(isValid || 'You must provide a valid value');
          setStatus('idle');
        }
      } else if (isBackspaceKey(key) && !value) {
        setDefaultValue(undefined);
      } else if (key.name === 'tab' && !value) {
        setDefaultValue(undefined);
        rl.clearLine(0); // Remove the tab character.
        rl.write(defaultValue);
        setValue(defaultValue);
      } else {
        setValue(rl.line);
        setError(undefined);
      }
    });
  
    const message = theme.style.message(config.message, status);
    let formattedValue = value;
    if (typeof config.transformer === 'function') {
      formattedValue = config.transformer(value, { isFinal: status === 'done' });
    } else if (status === 'done') {
      formattedValue = theme.style.answer(value);
    }
  
    let defaultStr;
    if (defaultValue && status !== 'done' && !value) {
      defaultStr = theme.style.defaultAnswer(defaultValue);
    }
  
    let error = '';
    if (errorMsg) {
      error = theme.style.error(errorMsg);
    }
 
    return [
      [prefix, message, defaultStr, formattedValue]
        .filter((v) => v !== undefined)
        .join(' '),
      error,
    ];
  });