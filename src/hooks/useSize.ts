import {useEffect, useState} from 'react';

const FALLBACK = {columns: 80, rows: 24};

const read = () => ({
    columns: process.stdout.columns || FALLBACK.columns,
    rows: process.stdout.rows || FALLBACK.rows,
});

/**
 * Terminal size, kept current across resizes - a window that stays open all day
 * will be resized.
 */
const useSize = () => {
    const [size, setSize] = useState(read);

    useEffect(() => {
        const onResize = () => setSize(read());

        process.stdout.on('resize', onResize);

        return () => {
            process.stdout.off('resize', onResize);
        };
    }, []);

    return size;
};

export default useSize;
