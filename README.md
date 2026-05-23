# your-library

> A TypeScript library

[![CI](https://github.com/JoeHentges/your-library/actions/workflows/ci.yml/badge.svg)](https://github.com/JoeHentges/your-library/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/your-library.svg)](https://www.npmjs.com/package/your-library)
[![license](https://img.shields.io/npm/l/your-library.svg)](./LICENSE)

## Installation

```bash
npm install your-library
# or
pnpm add your-library
# or
yarn add your-library
```

## Usage

```ts
import { add } from 'your-library';

const result = add(1, 2);
// => 3
```

## API

### `add(a, b)`

Adds two numbers together.

| Parameter | Type     | Description   |
| --------- | -------- | ------------- |
| `a`       | `number` | First number  |
| `b`       | `number` | Second number |

Returns: `number`

## Contributing

Contributions are welcome! Please open an issue or submit a pull request.

1. Fork the repo
2. Create your feature branch: `git checkout -b feat/my-feature`
3. Commit your changes using [Conventional Commits](https://www.conventionalcommits.org/)
4. Push and open a pull request

## License

[MIT](./LICENSE) © Joe Hentges
