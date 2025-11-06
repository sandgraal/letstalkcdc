import fs from 'node:fs/promises';
import postcss from 'postcss';
import prefixer from 'postcss-prefix-selector';

const src = 'theme-playground/styles.css';
const dest = 'src/assets/css/theme-dark-prefixed.css';

const css = await fs.readFile(src, 'utf8');

const result = await postcss([
  prefixer({
    prefix: 'html[data-theme="dark"]',
    transform(prefix, selector, prefixed) {
      // Keep keyframes/fonts global; prefix normal selectors
      if (selector.startsWith('@keyframes') || selector.startsWith('@font-face')) return selector;
      if (selector.startsWith(prefix)) return selector;
      return `${prefix} ${selector}`;
    },
  }),
]).process(css, { from: src, to: dest });

await fs.writeFile(dest, result.css);
console.log('Wrote', dest);
