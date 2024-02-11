# JsBinPack

JsBinPack is a small and efficient dependency-free alternative to JSON
supporting Sets, Maps, TypedArrays, circular and non-circular references.

It has a small output (0 - 2 bytes overhead per value, most of the time much
less than JSON) while being suitable for huge amounts of data (designed to
handle 10GB as well as 10bytes)

## Usage

### Deno.js:

```typescript
import { JsBinPack } from "https://deno.land/x/jsbinpack/mod.ts";

const serialized: Uint8Array = new JsBinPack().pack(data);
const deserialized: unknown = new JsBinPack().unpack(serialized);
```

### Yarn: Node.js & Browser:

```bash
yarn add jsbinpack
```

```typescript
import { JsBinPack } from "jsbinpack";

const serialized: Uint8Array = new JsBinPack().pack(data);
const deserialized: unknown = new JsBinPack().unpack(serialized);
```

### NPM: Node.js & Browser:

```bash
npm install jsbinpack
```

```typescript
import { JsBinPack } from "jsbinpack";

const serialized: Uint8Array = new JsBinPack().pack(data);
const deserialized: unknown = new JsBinPack().unpack(serialized);
```

## Supports everything JSON does, plus:

- `Set`s
- `Map`s
- `Symbol`s
- `TypedArray`s
- `ArrayBuffer`s
- `null` & `undefined`
- references inside the message (every object is only packed once, this also
  applies to primitives like strings, which saves space if they occur
  repeatedly)
- Circular(!) references
- Consistency: each message starts with a 2-byte version header which allows
  making even breaking changes to the protocol and reduces backward
  compatibility overhead
- Extendability: special flags can be embedded inside the data to adjust the
  unpacking behavior

## Performance

- Binary format: uses all possible values, not only a few printable characters,
  no need to transform binary content
- potentially large amounts of data are only used through TypedArrays and are
  copied only once (to the result buffer)
- long object keys don't affect performance and size (they are only stored once,
  see [property key table](#property-key-table))
- no magic codes (like `"` in JSON which causes a 2x(!) performance regression
  when repeatedly contained in string)
- => no need to escape every byte when encoding
- => no escape overhead when packing a valid message (Imagine JSON:
  `"{\"foo\": \"test\"}"`)
- different variants for storing different value ranges (number types range from
  uint8 to float64, data block length can be expressed as u8 (up to 256 bytes),
  u16 (up to 64kB), u32 (up to 4GB), u64 (up to 18Exabytes))

## Implementation benchmarks

Currently JsBinPack cannot compete with the builtin (C/C++) implementation of
JSON when it comes to extremely small messages (around 10 times slower when
packing a one-character string).

This bad performance is mainly caused by the bad performance of the
browser-builtin UTF-8 encoder/decoder (The Encoding API itself is many times
slower than using JSON). This needs to be considered if you plan to transmit or
store the JSON message, because this also involves the Encoding API, which
nearly eliminates any performance advantages of the builtin JSON again.

Packing big or complicated (escape and non-ASCII characters) messages is way
faster and results in a smaller output.

## Protocol / Implementation limits

- maximum object key length: 255 bytes UTF-8 (should be unreachable, you are
  most likely abusing objects as key-value-storage, use Maps instead)
- object keys may not be a empty string (Yes, this is valid JSON: `{ "": 5 }`)
- Number of different object keys (across all objects): 65535 (0xffff). Using
  less than 253 saves a little bit space in the message
- Maximum length of strings, TypedArrays and ArrayBuffers:
  18,446,744,073,709,552,000 bytes (~18.5 Exabytes)
- Maximum number of strings and objects (includes arrays, maps, sets,
  ArrayBuffer, ...): 4,294,967,295 (u32 limit)
- maximum payload: difficult to calculate, but somewhere in the magnitude of
  10^29 bytes
- the TS/JS-Implementation is limited to 9 Petabytes due to the integer size
  limit. Please let me know if you have the ability to test this use case 😏.
  Until this has been tested, using such large amounts of data is considered
  undefined behavior.

## Advanced usage

```typescript
class JsBinPack{
  pack(data: unknown): Uint8Array,
  unpack(data: Uint8Array): unknown,
}
```

The instance of `JsBinPack` can be reused. It is used to hold the configuration
to handle symbols [coming soon]

## Errors

The `pack`/`unpack` methods may throw errors.

You should ALWAYS handle them, they can be caused by a single malformed message.

They all extend `JsBinPackError` which extends `Error`

### `JsBinPackUnsupportedVersionError`

The used protocol version is not supported

### `JsBinPackUnsupportedTypeError`

The message contains an unsupported data type. This cannot be ignored, because
without knowledge of the data type the beginning of the following data block is
unknown.

### `JsBinPackMalformedError`

Should be self explaining

### `JsBinPackLimitError`

One or more limits are exceeded

## Data Validation

_**ALWAYS VALIDATE**_ the incoming data. _**DO NOT TRUST**_ its structure.

When using TypeScript, _**DO NOT USE**_ the `as` operator, this is _**UNSAFE**_.
Use full type checks.

Do this either manually (not recommended) or using a library like
[zod](https://zod.dev/) (recommended) or
[TypeBox](https://github.com/sinclairzx81/typebox)

## How does this all work?

### Property key table

This technique eliminates repeated object keys by storing a list of all object
keys at the beginning of the message and just referencing this list. This lets
you freely choose clear and self-explaining property names. Feel free to use
structs like this even when having large lists:

```js
[
  {
    uuid: "...",
    displayName: "Foo",
  },
  {
    uuid: "...",
    displayName: "Bar",
  },
  ...
]
```

### References

The packing algorithm memorizes all packed values. If it detects a repeated
occurrence of the same value it just stores a pointer to that value

This lets you directly serialize your internal data format with all its
cross-references.

### Huge amounts of data

Pure data chunks (like strings, ArrayBuffers, ...) aren't touched at a
per-byte-basis, they are just copied to the output buffer. Instead of defining
escape codes (which would need to be escaped themselves) the length of the
following block is stored in a format that suits it best (u8,u16,u32 or u64).
This enables compact messages when using buffers that are only a few byte long
while being capable of handling Exabytes of data.

## License

Copyright (C) 2024 Hans Schallmoser

This program is free software: you can redistribute it and/or modify it under
the terms of the GNU General Public License as published by the Free Software
Foundation, either version 3 of the License, or (at your option) any later
version.

This program is distributed in the hope that it will be useful, but WITHOUT ANY
WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR A
PARTICULAR PURPOSE. See the GNU General Public License for more details.

You should have received a copy of the GNU General Public License along with
this program. If not, see <https://www.gnu.org/licenses/>.
