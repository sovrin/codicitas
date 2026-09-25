import React, {type ReactNode, useState} from 'react';
import {Box, Text, useApp, useInput, usePaste} from 'ink';
import Frame from './Frame';
import Hints from './Hints';
import Line from './Line';
import type {Entries as Kind} from '#/services/definition';
import {type Draft, draft, insert} from '#/services/editor';
import {edit, isNewline, repeats} from '#/services/input';

const HINTS: [string, string][] = [
    ['↑↓', 'choose'],
    ['enter', 'change'],
    ['a', 'add'],
    ['d', 'delete'],
    ['esc', 'back'],
];

const NEXT: [string, string][] = [
    ['enter', 'next'],
    ['esc', 'cancel'],
];

const SAVE: [string, string][] = [
    ['enter', 'save'],
    ['esc', 'cancel'],
];

/**
 * A row of the list: an entry, a name the journal uses without a value, or
 * the row to add one from.
 */
type Row =
    | {kind: 'entry'; name: string; value: string}
    | {kind: 'wanted'; name: string}
    | {kind: 'add'};

/**
 * What is being typed: first the value, then the name - which a name the
 * journal already uses skips, having one.
 */
type Step =
    | {
          kind: 'value';
          draft: Draft;
          /**
           * The name the value is for, when it has one already.
           */
          name?: string;
          /**
           * Whether the name is settled, as for one the journal uses.
           */
          fixed?: boolean;
          /**
           * The entry being changed.
           */
          replacing?: string;
      }
    | {kind: 'name'; draft: Draft; value: string; replacing?: string};

type Props = {
    title: ReactNode;
    label: string;
    kind: Kind;
    value: Record<string, string>;
    onChange: (value: Record<string, string>) => void;
    /**
     * Every topic in the journal, for the names it uses without a value.
     */
    topics: string[];
    onBack: () => void;
};

const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/**
 * A setting that gives names to things, one entry per row: added, changed and
 * deleted one at a time, each typed where it is shown. Names the journal
 * already uses without a value are listed too, waiting for one.
 *
 * @param props
 * @constructor
 */
const Entries = ({title, label, kind, value, onChange, topics, onBack}: Props) => {
    const {exit} = useApp();
    const [selected, setSelected] = useState(0);
    const [step, setStep] = useState<Step>();
    const [error, setError] = useState<string>();
    const names = Object.keys(value);
    const rows: Row[] = [
        ...Object.entries(value).map(([name, text]): Row => ({kind: 'entry', name, value: text})),
        ...(kind.wanted?.(topics) ?? [])
            .filter((name) => kind.isName(name) && !names.some((known) => same(known, name)))
            .map((name): Row => ({kind: 'wanted', name})),
        {kind: 'add'},
    ];
    const at = Math.min(selected, rows.length - 1);
    const row = rows[at];
    const width =
        Math.max(12, ...rows.map((entry) => ('name' in entry ? entry.name.length : 0))) + 4;

    const save = (name: string, text: string, replacing?: string) => {
        const next = Object.fromEntries(
            Object.entries(value).filter(([known]) => known !== replacing && !same(known, name)),
        );

        onChange({...next, [name]: text});
        setStep(undefined);
        setError(undefined);
        // on the entry just saved, wherever it ended up
        setSelected(Object.keys({...next, [name]: text}).indexOf(name));
    };

    const submit = (current: Step) => {
        const typed = current.draft.buffer.trim();

        if (current.kind === 'value') {
            const parsed = kind.parse(typed);

            if (!parsed) {
                setError(`That is not a ${kind.value}.`);
            } else if (current.fixed) {
                save(current.name, parsed, current.replacing);
            } else {
                setError(undefined);
                setStep({
                    kind: 'name',
                    draft: draft(current.name ?? kind.suggest(parsed)),
                    value: parsed,
                    replacing: current.replacing,
                });
            }

            return;
        }

        if (!kind.isName(typed)) {
            setError(`That is not a ${kind.name}.`);
        } else if (names.some((known) => known !== current.replacing && same(known, typed))) {
            setError(`${typed} is taken already.`);
        } else {
            save(typed, current.value, current.replacing);
        }
    };

    usePaste((text) => {
        if (step) {
            setStep({...step, draft: insert(step.draft, text.replace(/[\r\n]+/g, ''))});
        }
    });

    useInput((input, key) => {
        if (step) {
            if (key.escape) {
                setStep(undefined);
                setError(undefined);
            } else if (key.return && !isNewline(input, key)) {
                submit(step);
            } else if (!isNewline(input, key) && !key.tab && !key.upArrow && !key.downArrow) {
                const next = edit(step.draft, input, key, Infinity);

                if (next) {
                    setStep({...step, draft: next});
                }
            }

            return;
        }

        if (key.escape) {
            onBack();
        } else if (input === 'q' || (key.ctrl && input === 'd')) {
            exit();
        } else if (input === 'a' || (key.return && row.kind === 'add')) {
            setSelected(rows.length - 1);
            setStep({kind: 'value', draft: draft('')});
        } else if (key.return && row.kind === 'wanted') {
            setStep({kind: 'value', draft: draft(''), name: row.name, fixed: true});
        } else if (key.return && row.kind === 'entry') {
            setStep({
                kind: 'value',
                draft: draft(row.value),
                name: row.name,
                replacing: row.name,
            });
        } else if ((input === 'd' || key.delete || key.backspace) && row.kind === 'entry') {
            onChange(
                Object.fromEntries(Object.entries(value).filter(([name]) => name !== row.name)),
            );
        } else {
            const delta =
                (key.downArrow ? 1 : 0) -
                (key.upArrow ? 1 : 0) +
                repeats(input, 'j') -
                repeats(input, 'k');

            if (delta !== 0) {
                setSelected(Math.max(0, Math.min(rows.length - 1, at + delta)));
            }
        }
    });

    const typing = (current: Step | undefined, part: 'name' | 'value') =>
        current?.kind === part ? (
            <Line text={current.draft.buffer} column={current.draft.cursor} />
        ) : undefined;

    return (
        <Frame
            title={
                <Text>
                    {title}
                    <Text dimColor> › </Text>
                    <Text bold>{label}</Text>
                </Text>
            }
            subtitle={<Text dimColor>Saved as you change them</Text>}
            footer={
                <Hints hints={!step ? HINTS : step.kind === 'value' && !step.fixed ? NEXT : SAVE} />
            }
        >
            <Box flexDirection="column">
                {rows.map((entry, index) => {
                    const isSelected = index === at;
                    const current = isSelected ? step : undefined;
                    const marker = <Text bold>{isSelected ? '▌ ' : '  '}</Text>;

                    if (entry.kind === 'add') {
                        return (
                            <Box key="add">
                                {marker}
                                {current?.kind === 'value' ? (
                                    <>
                                        <Text dimColor>{kind.name.padEnd(width)}</Text>
                                        {typing(current, 'value')}
                                    </>
                                ) : current?.kind === 'name' ? (
                                    <>
                                        <Box width={width}>{typing(current, 'name')}</Box>
                                        <Text dimColor>{current.value}</Text>
                                    </>
                                ) : (
                                    <Text bold={isSelected} dimColor={!isSelected}>
                                        + add a {kind.value}
                                    </Text>
                                )}
                            </Box>
                        );
                    }

                    return (
                        <Box key={entry.name}>
                            {marker}
                            {current?.kind === 'name' ? (
                                <Box width={width}>{typing(current, 'name')}</Box>
                            ) : (
                                <Text bold={isSelected}>{entry.name.padEnd(width)}</Text>
                            )}
                            {current?.kind === 'value' ? (
                                typing(current, 'value')
                            ) : current?.kind === 'name' ? (
                                <Text dimColor>{current.value}</Text>
                            ) : entry.kind === 'entry' ? (
                                <Text dimColor={!isSelected}>{entry.value}</Text>
                            ) : (
                                <Text color="yellow">not set, used in your journal</Text>
                            )}
                        </Box>
                    );
                })}

                <Box marginTop={1} paddingLeft={2} flexDirection="column">
                    <Text dimColor wrap="wrap">
                        {step
                            ? kind.help[step.kind]
                            : row.kind === 'wanted'
                              ? `Enter to give ${row.name} a ${kind.value}.`
                              : row.kind === 'entry'
                                ? `Enter to change it, d to delete it.`
                                : `Enter or a to add a ${kind.value}.`}
                    </Text>
                    {error && (
                        <Text color="red" wrap="wrap">
                            {error}
                        </Text>
                    )}
                </Box>
            </Box>
        </Frame>
    );
};

export default Entries;
