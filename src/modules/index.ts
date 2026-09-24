import type {Definition} from '#/services/definition';
import jira, {type JiraSettings} from './jira';
import type {Module} from './module';

/**
 * Every module's settings, their on/off settings among them.
 */
export type ModuleSettings = JiraSettings;

/**
 * Every module, in the order they are listed and their titles win
 * when two know the same reference. Each has checked its settings against
 * their own types; listed together, they are only settings.
 */
export const MODULES = [jira] as unknown as Module[];

/**
 * Every module's settings, its on/off setting first. That one is switched in
 * the list of modules; the rest are the module's own page.
 */
export const definitions = <S>(): Definition<S>[] =>
    MODULES.flatMap((module) => [
        {
            id: module.id,
            label: module.name,
            description: module.description,
            values: [true, false],
            format: (on: unknown) => (on ? 'on' : 'off'),
        },
        ...module.settings,
    ]) as unknown as Definition<S>[];

/**
 * Every module's settings as they start out.
 */
export const defaults = (): ModuleSettings =>
    Object.assign({}, ...MODULES.map((module) => module.defaults)) as ModuleSettings;
