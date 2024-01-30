# JsBinPack

Small and efficient alternative to JSON. Supporting Sets, Maps, TypedArrays,
circular and non-circular references. Small footprint (usually two bytes
overhead per value, some values like booleans are single-byte) while being
suitable for huge amounts of data (designed to handle 10GB as well as 10bytes)

## Usage

```typescript
const serialized = new JsBinPack().pack(data);
const deserialized = new JsBinPack().unpack(serialized);
```

## Supports everything JSON does, plus:

- Sets
- Maps
- Symbols
- TypedArrays
- ArrayBuffers
- null & undefined
- references (every object is only packed once, this also applies to primitives
  like strings)
- Circular references
- options to customize packing

## Performance

- Binary format: uses all possible values, not only a few printable characters
- (potentially) large amounts of data are only used through TypedArrays and are
  copied only once (to the result buffer)
- long object keys don't affect performance and size (they are only stored once,
  see [property key table](#property-key-table))
- no magic codes (like `"` in JSON) => no need to escape every byte when
  encoding
- no escape overhead when packing a valid message (Imagine JSON:
  `"{\"foo\": \"test\"}"`)
- different variants for storing different value ranges (eg. for string length:
  u8 for short strings, u16 for medium ones and u32 for huge ones (=4GB))

## Limits

- maximum object key length: 255 bytes UTF-8 (should be unreachable, you are
  most likely abusing objects as key-value-storage, use Maps instead)
- Number of different object keys (across all objects): 255 (default) / 65,534
  (with `extendedKeyMode` enabled)
- Maximum length of strings, TypedArrays and ArrayBuffers: 4,294,967,295 bytes
  (4GB)
- Number of Values (primitives, objects and arrays): 4,294,967,295
- theoretical maximum payload: 18.4 Exabytes (the JS-Implementation is limited
  to 9 Petabytes due to the integer size limit), untested 😏

## Property key table

This technique eliminates repeated object keys by storing a list of all object
keys and just referencing this list. Given this object:

```js
[
  {
    "value": 5,
    "display-label": "Foo",
  },
  {
    "value": 8,
    "display-label": "Bar",
  },
];
```

The JSON version is
`[{"value":5,"display-label":"Foo"},{"value":8,"display-label":"Bar"}]` (69
bytes)

The jsbinpack version is:
`02 00 02 05 76 61 6c 75 65 0d 64 69 73 70 6c 61 79 2d 6c 61 62 65 6c 0C 0B 00 08 05 01 10 03 46 6f 6f FF 0B 00 08 08 01 10 03 42 61 72 FF FF`
(47 bytes / 31% saved)

Explanation:

- `02 00`: Protocol version 2.0
- `02`: key table has 0x02 = 2 items
- `05`: following key is 0x05 = 5 bytes long (#1)
- `76 61 6c 75 65`: UTF-8 representation of `value` (#1)
- `05`: following key is 0x0d = 13 bytes long (#2)
- `64 69 73 70 6c 61 79 2d 6c 61 62 65 6c`: UTF-8 representation of
  `display-label` (#2)
- `0C`: Array (#3)
- `0B`: Object (#4)
- `00`: key 0 (`value`) (#1)
- `08`: 8-bit unsigned int
- `05`: u8 representation of `5`
- `01`: key 1 (`display-label`) (#2)
- `10`: string (8bit length mode)
- `03`: length (u8)
- `46 6f 6f`: UTF-8 representation of `Foo`
- `FF`: end mark (of object) (#4)
- `0B ...`: second object (#5)
- `FF`: end mark (of object) (#5)
- `FF`: end mark (of array) (#3)

#### Options

##### `extendedKeyMode`

The reference to the property key is stored as u8 by default. This allows a
maximum of 255 different keys (value 0xff is reserved).

Setting this property to true will use u16 as index. This allows 65,534
different object keys at the cost of 2 bytes overhead per message and 1 byte per
object key.

##### `directKeyMode`

This options disables the property key table entirely. Saves 1 byte per object
property if all object keys are used only once.
