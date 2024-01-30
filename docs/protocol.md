# Protocol definition

Unless otherwise noted, Big Endian is used

## General Frame format

| Octet       | Description                                                                                   |
| ----------- | --------------------------------------------------------------------------------------------- |
| 0           | Major protocol version (currently `2`)                                                        |
| 1           | Minor protocol version (currently `0`)                                                        |
| 2           | Length of Key table (value `0` indicates direct key mode, `0xff` indicates extended key mode) |
| [3 - 4]     | [extended key mode only]: length of key table                                                 |
| 3... [5...] | {property key}[]                                                                              |
| ...         | {Value}                                                                                       |

## property key

| Octet | Description  |
| ----- | ------------ |
| 0     | length       |
| 1...  | data (UTF-8) |

## Value

may be one of:

- Undefined
- Null
- True
- False
- Invalid
- unknown Symbol
- String
- ArrayBuffer
- Uint8Array

## Undefined (`undefined`)

| Octet | Description      |
| ----- | ---------------- |
| 0     | `PACK.UNDEFINED` |

## Null (`null`)

| Octet | Description |
| ----- | ----------- |
| 0     | `PACK.NULL` |

## True (`true`)

| Octet | Description |
| ----- | ----------- |
| 0     | `PACK.TRUE` |

## False (`false`)

| Octet | Description  |
| ----- | ------------ |
| 0     | `PACK.FALSE` |

## Invalid (`JSBINPACK_INVALID_OBJECT`)

Indicates that the object attempted to pack is not serializable or has an
unsupported data type

| Octet | Description    |
| ----- | -------------- |
| 0     | `PACK.INVALID` |

## unknown Symbol (`PACK_UNKNOWN_SYMBOL`)

Indicates that an unregistered symbol was packed or unpacked

| Octet | Description           |
| ----- | --------------------- |
| 0     | `PACK.SYMBOL_UNKNOWN` |

## ArrayBuffer (8bit-mode)

up to 255 bytes

| Octet | Description          |
| ----- | -------------------- |
| 0     | `PACK.ARRAY_BUFFER8` |
| 1     | length               |
| 2...  | data                 |

## ArrayBuffer (16bit-mode)

up to 65535 bytes

| Octet | Description           |
| ----- | --------------------- |
| 0     | `PACK.ARRAY_BUFFER16` |
| 1-2   | length                |
| 3...  | data                  |

## ArrayBuffer (32bit-mode)

up to 4294967295 bytes

| Octet | Description           |
| ----- | --------------------- |
| 0     | `PACK.ARRAY_BUFFER32` |
| 1-4   | length                |
| 5...  | data                  |

## Uint8Array

Identical to ArrayBuffer using `PACK.UINT8_ARRAY8`, `PACK.UINT8_ARRAY16` and
`PACK.UINT8_ARRAY32`

## String

Identical to ArrayBuffer using `PACK.STRING8`, `PACK.STRING16` and
`PACK.STRING32`

Data is UTF-8 encoded.
