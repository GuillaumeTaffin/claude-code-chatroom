/** @type {import('prettier').Config} */
const config = {
  semi: false,
  singleQuote: true,
  trailingComma: 'all',
  plugins: ['prettier-plugin-svelte'],
  overrides: [
    {
      files: 'packages/web/**/*.{js,ts,svelte,json}',
      options: {
        useTabs: true,
      },
    },
  ],
}

export default config
