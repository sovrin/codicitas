import {useEffect, useState} from 'react';
import {TICK} from '#/const';

/**
 * The current time, advanced on a coarse timer.
 */
const useNow = () => {
    const [now, setNow] = useState(() => new Date());

    useEffect(() => {
        const timer = setInterval(() => setNow(new Date()), TICK);

        return () => clearInterval(timer);
    }, []);

    return now;
};

export default useNow;
