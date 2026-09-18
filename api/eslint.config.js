// eslint.config.js
//
// Type-aware linting (strictTypeChecked) catches what `tsc` alone doesn't:
// unsafe `any` usage, floating promises, unnecessary type assertions. This
// project has zero `any`/`as any` today (see the audit that motivated this
// config) - the goal here is to keep it that way going forward, not to fix
// an existing problem.
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    // These are standalone tool-config files, not part of the
    // tsconfig.test.json project graph (src/**/*.ts + tests/**/*.ts) - the
    // type-checked rule set needs type info for every file it applies to,
    // so they're excluded from linting entirely rather than forced into a
    // project they aren't part of.
    ignores: ['dist/**', 'node_modules/**', 'eslint.config.js', 'vitest.config.ts', 'prisma/seed.ts'],
  },
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // tsconfig.test.json is a superset of tsconfig.json (adds
        // tests/**/*.ts on top of src/**/*.ts), so pointing directly at it
        // covers every linted file with one project - projectService's
        // auto-discovery only looks for a file literally named
        // tsconfig.json and won't find this one on its own.
        project: './tsconfig.test.json',
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    // supertest's Response.body is typed `any` (it can't know the shape of
    // whatever JSON a given route returns), so every test asserting on
    // res.body.<field> is inherently an "unsafe" access by these rules'
    // definition - that's a supertest limitation, not a gap in this
    // project's own type safety. src/ keeps the full strict rule set.
    files: ['tests/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/restrict-template-expressions': 'off',
    },
  },
);
