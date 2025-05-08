/**
 * This is a modified version of the @inquirer/select with some added features.
 * Original: https://github.com/SBoudrias/Inquirer.js
 *  
 * @package @inquirer-contrib/select-with-actions
 *
 * @modified by Nabil Redmann.
 *   added config.keypressHandler
 *   added needRefresh (if items changed)
 *
 * @see @inquirer/checkbox@4.1.5
 * @version 1.0.0
 * @license MIT
 */
import {
    createPrompt,
    useState,
    useKeypress,
    usePrefix,
    usePagination,
    useRef,
    useMemo,
    useEffect,
    isBackspaceKey,
    isEnterKey,
    isUpKey,
    isDownKey,
    isNumberKey,
    Separator,
    ValidationError,
    makeTheme,
    type Theme,
    type Status,
  } from '@inquirer/core';
  import type { PartialDeep } from '@inquirer/type';
  import { type InquirerReadline } from '@inquirer/type';
  import type { KeypressEvent } from '@inquirer/core';
  import colors from 'yoctocolors-cjs';
  import figures from '@inquirer/figures';
  import ansiEscapes from 'ansi-escapes';
  
  type SelectTheme = {
    icon: { cursor: string };
    style: {
      disabled: (text: string) => string;
      description: (text: string) => string;
    };
    helpMode: 'always' | 'never' | 'auto';
    indexMode: 'hidden' | 'number';
  };
  
  const selectTheme: SelectTheme = {
    icon: { cursor: figures.pointer },
    style: {
      disabled: (text: string) => colors.dim(`- ${text}`),
      description: (text: string) => colors.cyan(text),
    },
    helpMode: 'auto',
    indexMode: 'hidden',
  };
  
  type Choice<Value> = {
    value: Value;
    name?: string;
    description?: string;
    short?: string;
    disabled?: boolean | string;
    type?: never;
  };
  
  type NormalizedChoice<Value> = {
    value: Value;
    name: string;
    description?: string;
    short: string;
    disabled: boolean | string;
  };

  export type KeypressHandler = ({
    key, rl,
    config, theme, firstRender, status, setStatus, prefix, items, active, setActive,
    isUpKey, isDownKey, isBackspaceKey, isNumberKey, isEnterKey
  }:{
    key: KeypressEvent & {meta?:boolean, sequence?:string, shift?:boolean}, rl: InquirerReadline
    config: SelectConfig<any>, theme: any, firstRender: any, status: any, setStatus: any, prefix: any, items: any, active: any, setActive: any,
    isUpKey: (key:KeypressEvent) => Boolean, isDownKey: (key:KeypressEvent) => Boolean, isBackspaceKey: (key:KeypressEvent) => Boolean, isNumberKey: (key:KeypressEvent) => Boolean, isEnterKey: (key:KeypressEvent) => Boolean,
  }) => Promise<{isDone?:boolean, isConsumed?:boolean, needRefresh?:boolean}|void>;
  
  type SelectConfig<
    Value,
    ChoicesObject =
      | ReadonlyArray<string | Separator>
      | ReadonlyArray<Choice<Value> | Separator>,
  > = {
    message: string;
    choices: ChoicesObject extends ReadonlyArray<string | Separator>
      ? ChoicesObject
      : ReadonlyArray<Choice<Value> | Separator>;
    pageSize?: number;
    loop?: boolean;
    default?: unknown;
    instructions?: {
      navigation: string;
      pager: string;
    };
    theme?: PartialDeep<Theme<SelectTheme>>;
    keypressHandler?: KeypressHandler;
  };
  
  function isSelectable<Value>(
    item: NormalizedChoice<Value> | Separator,
  ): item is NormalizedChoice<Value> {
    return !Separator.isSeparator(item) && !item.disabled;
  }
  
  function normalizeChoices<Value>(
    choices: ReadonlyArray<string | Separator> | ReadonlyArray<Choice<Value> | Separator>,
  ): Array<NormalizedChoice<Value> | Separator> {
    return choices.map((choice) => {
      if (Separator.isSeparator(choice)) return choice;
  
      if (typeof choice === 'string') {
        return {
          value: choice as Value,
          name: choice,
          short: choice,
          disabled: false,
        };
      }
  
      const name = choice.name ?? String(choice.value);
      const normalizedChoice: NormalizedChoice<Value> = {
        value: choice.value,
        name,
        short: choice.short ?? name,
        disabled: choice.disabled ?? false,
      };
  
      if (choice.description) {
        normalizedChoice.description = choice.description;
      }
  
      return normalizedChoice;
    });
  }
  
  export default createPrompt(
    <Value>(config: SelectConfig<Value>, done: (value: Value) => void) => {
      const { loop = true, pageSize = 7 } = config;
      const firstRender = useRef(true);
      const theme = makeTheme<SelectTheme>(selectTheme, config.theme);
      const [status, setStatus] = useState<Status>('idle');
      const prefix = usePrefix({ status, theme });
      const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  
      const items = useMemo(() => normalizeChoices(config.choices), [config.choices]);
  
      const bounds = useMemo(() => {
        const first = items.findIndex(isSelectable);
        const last = items.findLastIndex(isSelectable);
  
        if (first === -1) {
          throw new ValidationError(
            '[select prompt] No selectable choices. All choices are disabled.',
          );
        }
  
        return { first, last };
      }, [items]);
  
      const defaultItemIndex = useMemo(() => {
        if (!('default' in config)) return -1;
        return items.findIndex(
          (item) => isSelectable(item) && item.value === config.default,
        );
      }, [config.default, items]);
  
      const [active, setActive] = useState(
        defaultItemIndex === -1 ? bounds.first : defaultItemIndex,
      );
  
      // Safe to assume the cursor position always point to a Choice.
      let selectedChoice = items[active] as NormalizedChoice<Value>;
  
      useKeypress(async (key, rl) => {
        clearTimeout(searchTimeoutRef.current);
  
        let isDone = false;
        if (config.keypressHandler) {
            let act = await config.keypressHandler({
                key, rl,
                config, theme, firstRender, status, setStatus, prefix, items, active, setActive,
                isUpKey, isDownKey, isBackspaceKey, isNumberKey, isEnterKey
                          
            });
            if (act && act?.needRefresh) {
                selectedChoice = items[active] as NormalizedChoice<Value>; // since there is no setItems, ref needs refresh
                // trigger a change, to trigger a render (same number wont trigger a render)
                setActive(active+1);
                setActive(active);
            }
            if (act && act?.isDone) {
                isDone = true;
                setStatus('done');
                done(selectedChoice.value);
            }
            if (act && act?.isConsumed) return;
        }

        if (isEnterKey(key) || isDone) {
          setStatus('done');
          done(selectedChoice.value);
        } else if (isUpKey(key) || isDownKey(key)) {
          rl.clearLine(0);
          if (
            loop ||
            (isUpKey(key) && active !== bounds.first) ||
            (isDownKey(key) && active !== bounds.last)
          ) {
            const offset = isUpKey(key) ? -1 : 1;
            let next = active;
            do {
              next = (next + offset + items.length) % items.length;
            } while (!isSelectable(items[next]!));
            setActive(next);
          }
        } else if (isNumberKey(key) && !Number.isNaN(Number(rl.line))) {
          const position = Number(rl.line) - 1;
          const item = items[position];
          if (item != null && isSelectable(item)) {
            setActive(position);
          }
  
          searchTimeoutRef.current = setTimeout(() => {
            rl.clearLine(0);
          }, 700);
        } else if (isBackspaceKey(key)) {
          rl.clearLine(0);
        } else {
          // Default to search
          const searchTerm = rl.line.toLowerCase();
          const matchIndex = items.findIndex((item) => {
            if (Separator.isSeparator(item) || !isSelectable(item)) return false;
  
            return item.name.toLowerCase().startsWith(searchTerm);
          });
  
          if (matchIndex !== -1) {
            setActive(matchIndex);
          }
  
          searchTimeoutRef.current = setTimeout(() => {
            rl.clearLine(0);
          }, 700);
        }
      });
  
      useEffect(
        () => () => {
          clearTimeout(searchTimeoutRef.current);
        },
        [],
      );
  
      const message = theme.style.message(config.message, status);
  
      let helpTipTop = '';
      let helpTipBottom = '';
      if (
        theme.helpMode === 'always' ||
        (theme.helpMode === 'auto' && firstRender.current)
      ) {
        firstRender.current = false;
  
        if (items.length > pageSize) {
          helpTipBottom = `\n${theme.style.help(`(${config.instructions?.pager ?? 'Use arrow keys to reveal more choices'})`)}`;
        } else {
          helpTipTop = theme.style.help(
            `(${config.instructions?.navigation ?? 'Use arrow keys'})`,
          );
        }
      }
  
      const page = usePagination({
        items,
        active,
        renderItem({ item, isActive, index }) {
          if (Separator.isSeparator(item)) {
            return ` ${item.separator}`;
          }
  
          const indexLabel = theme.indexMode === 'number' ? `${index + 1}. ` : '';
          if (item.disabled) {
            const disabledLabel =
              typeof item.disabled === 'string' ? item.disabled : '(disabled)';
            return theme.style.disabled(`${indexLabel}${item.name} ${disabledLabel}`);
          }
  
          const color = isActive ? theme.style.highlight : (x: string) => x;
          const cursor = isActive ? theme.icon.cursor : ` `;
          return color(`${cursor} ${indexLabel}${item.name}`);
        },
        pageSize,
        loop,
      });
  
      if (status === 'done') {
        return `${prefix} ${message} ${theme.style.answer(selectedChoice.short)}`;
      }
  
      const choiceDescription = selectedChoice.description
        ? `\n${theme.style.description(selectedChoice.description)}`
        : ``;
  
      return `${[prefix, message, helpTipTop].filter(Boolean).join(' ')}\n${page}${helpTipBottom}${choiceDescription}${ansiEscapes.cursorHide}`;
    },
  );
  
  export { Separator } from '@inquirer/core';