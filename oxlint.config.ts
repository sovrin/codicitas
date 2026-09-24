import {defineConfig} from 'oxlint';

export default defineConfig({
    plugins: ['typescript', 'unicorn', 'oxc', 'import', 'promise', 'node', 'react'],
    categories: {
        correctness: 'error',
        suspicious: 'warn',
        perf: 'warn',
    },
    rules: {
        'typescript/consistent-type-imports': 'error',
        'typescript/no-explicit-any': 'error',
        'unicorn/prefer-node-protocol': 'error',
        'import/no-cycle': 'error',
        // a hook after an early return renders fine until the branch flips,
        // then react tears the tree down
        'react/rules-of-hooks': 'error',
        'react/exhaustive-deps': 'warn',
        // rows and entries are copied on purpose, never changed in place
        'oxc/no-map-spread': 'off',
        // lines cut into parts are only ever redrawn, never reordered, so where
        // a part sits is all there is to tell it apart
        'react/no-array-index-key': 'off',
        // a then at the end of a chain has nobody to return to
        'promise/always-return': ['warn', {ignoreLastCallback: true}],
    },
});
