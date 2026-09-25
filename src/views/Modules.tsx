import React, {useContext, useState} from 'react';
import {Box, Text, useApp, useInput} from 'ink';
import type {ViewProps} from '#/components/App';
import Frame from '#/components/Frame';
import Hints from '#/components/Hints';
import Options, {type Said} from '#/components/Options';
import {ModulesContext, type Running, useMentions} from '#/hooks';
import {MODULES} from '#/modules';
import type {Module} from '#/modules/module';
import type {Definition} from '#/services/definition';
import {repeats} from '#/services/input';
import type {Settings} from '#/services/settings';

const HINTS: [string, string][] = [
    ['↑↓', 'choose'],
    ['←→', 'on/off'],
    ['tab', 'settings'],
    ['esc', 'back'],
];

const ON: [string, string][] = [...HINTS.slice(0, 2), ['enter', 'set up'], ...HINTS.slice(2)];

const SETUP: [string, string][] = [
    ['↑↓', 'choose'],
    ['←→', 'change'],
    ['esc', 'modules'],
];

const WIDTH = Math.max(...MODULES.map(({name}) => name.length)) + 4;

/**
 * How asking a module went, said under its settings once there is something
 * to say.
 *
 * @param running
 */
const said = ({module, ready, connection, missing}: Running): Said | undefined => {
    const {name, noun, refused, unknown} = module;

    if (!ready) {
        return {text: `${name} needs setting up before it can be asked.`, color: 'yellow'};
    }

    // answered, but not about everything - the likeliest thing to be wrong
    if (missing.length > 0 && connection !== 'refused' && connection !== 'unreachable') {
        const shown = missing.slice(0, 3).join(', ');
        const more = missing.length > 3 ? ` and ${missing.length - 3} more` : '';

        return {text: `${name} did not find ${shown}${more}. ${unknown}`, color: 'yellow'};
    }

    return (
        {
            waiting: {text: `Set up; ${name} is asked about ${noun}s once they are on screen.`},
            ok: {text: `${name} answered; titles show after their ${noun}s.`, color: 'green'},
            refused: {text: `${name} turned the token down. ${refused}`, color: 'red'},
            unreachable: {
                text: `${name} could not be reached. Trying again in a few minutes.`,
                color: 'yellow',
            },
        } as Partial<Record<Running['connection'], Said>>
    )[connection];
};

/**
 * The same, in a word or two, for the list of modules.
 *
 * @param running
 */
const brief = ({ready, connection, missing}: Running): Said | undefined =>
    ready && missing.length > 0 && connection !== 'refused' && connection !== 'unreachable'
        ? {text: `${missing.length} not found`, color: 'yellow'}
        : ready
          ? (
                {
                    ok: {text: 'working', color: 'green'},
                    refused: {text: 'token turned down', color: 'red'},
                    unreachable: {text: 'out of reach', color: 'yellow'},
                } as Partial<Record<Running['connection'], Said>>
            )[connection]
          : {text: 'not set up', color: 'yellow'};

type ListProps = ViewProps & {
    selected: number;
    onSelect: (at: number) => void;
    onOpen: (module: Module) => void;
};

/**
 * Every module, turned on and off right here. Only one that is on can be set
 * up; there is nothing to set up for one that is off.
 *
 * @param props
 * @constructor
 */
const List = ({journal, preferences, selected, onSelect, onOpen}: ListProps) => {
    const {exit} = useApp();
    const {dispatch} = journal;
    const {settings, adjust} = preferences;
    const {modules} = useContext(ModulesContext);
    const {module} = modules[selected];
    const isOn = settings[module.id as keyof Settings] === true;

    useInput((input, key) => {
        if (key.escape) {
            dispatch({type: 'view', view: 'journal'});
        } else if (key.tab || input === ',') {
            dispatch({type: 'view', view: 'settings'});
        } else if (input === 'q' || (key.ctrl && input === 'd')) {
            exit();
        } else if (key.return) {
            if (isOn) {
                onOpen(module);
            }
        } else if (
            key.leftArrow ||
            key.rightArrow ||
            input === 'h' ||
            input === 'l' ||
            input === ' '
        ) {
            adjust(module.id as keyof Settings, key.leftArrow || input === 'h' ? -1 : 1);
        } else {
            const delta =
                (key.downArrow ? 1 : 0) -
                (key.upArrow ? 1 : 0) +
                repeats(input, 'j') -
                repeats(input, 'k');

            if (delta !== 0) {
                onSelect(Math.max(0, Math.min(modules.length - 1, selected + delta)));
            }
        }
    });

    return (
        <Frame
            title={<Text bold>Modules</Text>}
            subtitle={<Text dimColor>Titles and links for what you write about</Text>}
            footer={<Hints hints={isOn ? ON : HINTS} />}
        >
            <Box flexDirection="column">
                {modules.map((running, at) => {
                    const isSelected = at === selected;
                    const on = settings[running.module.id as keyof Settings] === true;
                    const value = on ? 'on' : 'off';
                    const status = on ? brief(running) : undefined;

                    return (
                        <Box key={running.module.id}>
                            <Text>
                                <Text bold>{isSelected ? '▌ ' : '  '}</Text>
                                <Text bold={isSelected}>{running.module.name.padEnd(WIDTH)}</Text>
                                {isSelected ? (
                                    <Text bold>
                                        <Text dimColor>‹ </Text>
                                        {value}
                                        <Text dimColor> ›</Text>
                                    </Text>
                                ) : (
                                    <Text dimColor>
                                        {'  '}
                                        {value}
                                        {'  '}
                                    </Text>
                                )}
                                {status && (
                                    <Text color={status.color}>
                                        {'   '}
                                        {status.text}
                                    </Text>
                                )}
                            </Text>
                        </Box>
                    );
                })}

                <Box marginTop={1} paddingLeft={2} flexDirection="column">
                    <Text dimColor wrap="wrap">
                        {module.description}
                    </Text>
                    <Text dimColor>
                        {isOn ? 'Enter to set it up.' : 'Turn it on to set it up.'}
                    </Text>
                </Box>
            </Box>
        </Frame>
    );
};

/**
 * The modules, and each module's own settings a page further in.
 *
 * @param props
 * @constructor
 */
const Modules = (props: ViewProps) => {
    const {exit} = useApp();
    const {modules} = useContext(ModulesContext);
    const [selected, setSelected] = useState(0);
    const [open, setOpen] = useState<Module>();
    const running = modules.find(({module}) => module === open);
    const {topic} = useMentions(props.journal.revision);

    if (!open) {
        return <List {...props} selected={selected} onSelect={setSelected} onOpen={setOpen} />;
    }

    return (
        <Options
            // a page of its own, starting at the top whichever module it is
            key={open.id}
            title={
                <Text>
                    <Text dimColor>Modules › </Text>
                    <Text bold>{open.name}</Text>
                </Text>
            }
            subtitle={<Text dimColor>Saved as you change them</Text>}
            definitions={open.settings as Definition<Settings>[]}
            preferences={props.preferences}
            status={running && said(running)}
            hints={SETUP}
            topics={topic}
            onKey={(input, key) => {
                if (key.escape) {
                    setOpen(undefined);
                } else if (input === 'q' || (key.ctrl && input === 'd')) {
                    exit();
                } else {
                    return false;
                }

                return true;
            }}
        />
    );
};

export default Modules;
