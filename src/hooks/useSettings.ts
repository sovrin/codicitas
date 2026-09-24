import {useCallback, useState} from 'react';
import {normalize, type Settings, step} from '#/services/settings';
import * as store from '#/services/store';

/**
 * The settings, read once and saved on every change, so there is no save
 * step to forget.
 */
const useSettings = () => {
    const [settings, setSettings] = useState<Settings>(() => normalize(store.loadSettings()));

    const adjust = useCallback((id: keyof Settings, delta = 1) => {
        setSettings((current) => {
            const next = step(current, id, delta);

            store.saveSetting(id, next[id]);

            return next;
        });
    }, []);

    /**
     * For the typed settings, which have no values to step through.
     */
    const set = useCallback(<K extends keyof Settings>(id: K, value: Settings[K]) => {
        setSettings((current) => {
            store.saveSetting(id, value);

            return {...current, [id]: value};
        });
    }, []);

    return {settings, adjust, set};
};

export type Preferences = ReturnType<typeof useSettings>;

export default useSettings;
