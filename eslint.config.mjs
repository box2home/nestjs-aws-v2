import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import importHelpers from 'eslint-plugin-import-helpers';
import globals from 'globals';

export default tseslint.config(
    { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },
    eslint.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['src/**/*.ts'],
        languageOptions: { globals: globals.node },
        plugins: { 'import-helpers': importHelpers },
        rules: {
            '@typescript-eslint/no-explicit-any': 'off', // matches noImplicitAny: false
            'import-helpers/order-imports': [
                'error',
                {
                    newlinesBetween: 'always',
                    groups: ['module', '/^@shared/', ['parent', 'sibling', 'index']],
                    alphabetize: { order: 'asc', ignoreCase: true },
                },
            ],
        },
    },
);
