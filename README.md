# temporal97

> A TypeScript library

[![CI](https://github.com/JoeHentges/temporal97/actions/workflows/ci.yml/badge.svg)](https://github.com/JoeHentges/temporal97/actions/workflows/ci.yml)
[![npm version](https://img.shields.io/npm/v/temporal97.svg)](https://www.npmjs.com/package/temporal97)
[![license](https://img.shields.io/npm/l/temporal97.svg)](./LICENSE)

## Installation

```bash
npm install temporal97
# or
pnpm add temporal97
# or
yarn add temporal97
```

## Usage

```ts
import { add } from "temporal97";

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

[MIT](./LICENSE) © JoeHentges
