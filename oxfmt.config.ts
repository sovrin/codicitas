import {defineConfig} from 'oxfmt';

export default defineConfig({
    tabWidth: 4,
    singleQuote: true,
    bracketSpacing: false,
    overrides: [
        {
            files: ['**/*.{json,md,yml}'],
            options: {tabWidth: 2},
        },
    ],
});
