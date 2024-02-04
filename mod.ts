/*
 * JsBinPack
 * Copyright (C) 2024 Hans Schallmoser
 * 
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 * 
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 * 
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

export enum PACK {
    RETURN = 0x00,
    FLAG = 0x01,
    // 0x02 reserved
    UNDEFINED = 0x03,
    NULL = 0x04,
    UNSUPPORTED = 0x05,
    REF = 0x06,

    TRUE = 0x07,
    FALSE = 0x08,
    BOOL = 0x09,
    SYMBOL_UNKNOWN = 0x0a,
    SYMBOL_EXTENDED = 0x0b,

    U8 = 0x10,
    I8 = 0x11,
    U16 = 0x12,
    I16 = 0x13,
    U32 = 0x14,
    I32 = 0x15,
    F32 = 0x16,
    U64 = 0x17,
    I64 = 0x18,
    F64 = 0x19,
    NAN = 0x2a,

    OBJECT = 0x20,
    ARRAY = 0x21,
    ARRAY_TYPED = 0x22,
    MAP = 0x23,
    MAP_TYPED = 0x24,
    SET = 0x25,
    SET_TYPED = 0x26,

    STRING8 = 0x30,
    STRING16 = 0x31,
    STRING32 = 0x32,
    STRING64 = 0x33,

    UINT8_ARRAY8 = 0x34,
    UINT8_ARRAY16 = 0x35,
    UINT8_ARRAY32 = 0x36,
    UINT8_ARRAY64 = 0x37,

    ARRAY_BUFFER8 = 0x38,
    ARRAY_BUFFER16 = 0x39,
    ARRAY_BUFFER32 = 0x3a,
    ARRAY_BUFFER64 = 0x3b,
}

export class JsBinPackError extends Error {
}

export class JsBinPackUnsupportedVersionError extends JsBinPackError {
    constructor(readonly major: number, readonly minor: number) {
        super(`[JsBinPack]: Protocol version ${major}.${minor} is not supported by this implementation`);
    }
}

export class JsBinPackUnsupportedTypeError extends JsBinPackError {
    constructor(readonly unsupportedType: PACK) {
        super(`[JsBinPack]: DataType ${PACK[unsupportedType]} (0x${unsupportedType.toString(16)}) is not supported by this implementation`);
    }
}

export class JsBinPackMalformedError extends JsBinPackError {
    constructor(readonly originalMessage: Uint8Array, readonly failure: string) {
        super(`[JsBinPack]: malformed message: ${failure}`);
    }
}

export class JsBinPackLimitError extends JsBinPackError {
    constructor(readonly limit: string) {
        super(`[JsBinPack]: exceeded limit: ${limit}`);
    }
}

const JSBINPACK_MARK_RETURN = Symbol(`JSBINPACK_MARK_RETURN`);
const JSBINPACK_MARK_IGNORE = Symbol(`JSBINPACK_MARK_IGNORE`);

export class JsBinPack {
    // readonly definedSymbolsBySymbol = new Map<symbol, number>();
    // readonly definedSymbolsById = new Map<number, symbol>();
    // defineSymbol(symbol: symbol, id: number) {
    //     this.definedSymbolsById.set(id, symbol);
    //     this.definedSymbolsBySymbol.set(symbol, id);
    // }

    public pack(data: unknown): Uint8Array {
        const staged: (Uint8Array | string | number)[] = [];
        let outputDataLength = 0;
        let outputPropRefs = 0;
        let valueEnumerator = 0;
        const propertyKeys = new Map<string, Uint8Array>();
        const propertyKeyRefs = new Map<string, number>();
        const packed = new Map<unknown, number>();

        function stageData(item: Uint8Array) {
            outputDataLength += item.byteLength;
            staged.push(item);
        }

        function stageU8(item: number) {
            outputDataLength++;
            staged.push(item);
        }

        function stagePropRef(item: string) {
            outputPropRefs++;
            staged.push(item);
        }

        function pushBuffer(input: Uint8Array, u8index: number, u16index: number, u32index: number, u64index: number) {
            if (input.length <= 0xff) {
                stageU8(u8index);
                stageU8(input.length);
            } else if (input.length <= 0xffff) {
                stageU8(u16index);
                const res = new Uint8Array(2);
                const dv = new DataView(res.buffer);
                dv.setUint16(0, input.length);
                stageData(res);
            } else if (input.length <= 0xffffffff) {
                stageU8(u32index);
                const res = new Uint8Array(4);
                const dv = new DataView(res.buffer);
                dv.setUint32(0, input.length);
                stageData(res);
            } else {
                stageU8(u64index);
                const res = new Uint8Array(8);
                const dv = new DataView(res.buffer);
                dv.setBigUint64(0, BigInt(input.length));
                stageData(res);
            }
            stageData(input);
        }

        function tryRef(value: unknown) {
            if (packed.has(value)) {
                const ref = packed.get(value)!;
                const res = new Uint8Array(5);
                res[0] = PACK.REF;
                const dv = new DataView(res.buffer);
                dv.setUint32(1, ref);
                stageData(res);
                return true;
            } else {
                packed.set(value, valueEnumerator);
                valueEnumerator++;
                return false;
            }
        }

        function packValue(value: unknown) {
            switch (typeof value) {
                case "string": {
                    if (tryRef(value)) {
                        break;
                    }
                    const buf = new TextEncoder().encode(value);
                    pushBuffer(buf, PACK.STRING8, PACK.STRING16, PACK.STRING32, PACK.STRING64);
                    break;
                }
                case "number": {
                    if (isNaN(value)) {
                        stageU8(PACK.NAN);
                    } else if (Math.round(value) === value && value >= 0 && value <= 0xff) {
                        stageU8(PACK.U8);
                        stageU8(value);
                    } else {
                        const res = new Uint8Array(9);
                        const dv = new DataView(res.buffer);
                        res[0] = PACK.F64;
                        dv.setFloat64(1, value);
                        stageData(res);
                    }
                    break;
                }
                case "boolean": {
                    if (value) {
                        stageU8(PACK.TRUE);
                    } else {
                        stageU8(PACK.FALSE);
                    }
                    break;
                }
                case "undefined": {
                    stageU8(PACK.UNDEFINED);
                    break;
                }
                case "object": {
                    if (value === null) {
                        stageU8(PACK.NULL);
                    } else {
                        if (tryRef(value)) {
                            break;
                        }
                        if (value instanceof Array) { // array
                            stageU8(PACK.ARRAY);
                            for (const i of value) {
                                packValue(i);
                            }
                            stageU8(PACK.RETURN);
                        } else if (value instanceof Uint8Array) { // Uint8Array
                            pushBuffer(value, PACK.UINT8_ARRAY8, PACK.UINT8_ARRAY16, PACK.UINT8_ARRAY32, PACK.UINT8_ARRAY64);
                        } else if (value instanceof ArrayBuffer) { // ArrayBuffer
                            pushBuffer(new Uint8Array(value), PACK.ARRAY_BUFFER8, PACK.ARRAY_BUFFER16, PACK.ARRAY_BUFFER32, PACK.ARRAY_BUFFER64);
                        } else if (value instanceof Map) { // Map
                            stageU8(PACK.MAP);
                            for (const [k, v] of value) {
                                packValue(k);
                                packValue(v);
                            }
                            stageU8(PACK.RETURN);
                        } else if (value instanceof Set) { // Set
                            stageU8(PACK.SET);
                            for (const i of value) {
                                packValue(i);
                            }
                            stageU8(PACK.RETURN);
                        } else { // object
                            stageU8(PACK.OBJECT);
                            for (const itemId in value) {
                                if (!propertyKeys.has(itemId)) {
                                    const propLabel = new TextEncoder().encode(itemId);
                                    if (propLabel.length >= 0xff) {
                                        console.warn(`[JsBinPack]: property key '${itemId}' too long, skipping`);
                                        continue;
                                    }
                                    propertyKeys.set(itemId, propLabel);
                                    outputDataLength += propLabel.length;
                                    outputDataLength += 1;
                                }
                                stagePropRef(itemId);
                                // @ts-expect-error is index
                                const propertyValue = value[itemId];

                                packValue(propertyValue);
                            }
                            stageU8(PACK.RETURN);
                        }
                    }
                    break;
                }
                default: {
                    console.warn(`[JsBinPack]: data contains values that cannot not be serialized, skipping`);
                    break;
                }

            }
            return;
        }

        packValue(data);

        const extendedKeyMode = propertyKeys.size >= 0xfc;

        if (propertyKeys.size >= 0xffff) {
            throw new JsBinPackLimitError(`max num of properties (${0xffff}) exceeded`);
        }

        const buffer = new Uint8Array(extendedKeyMode ?
            outputDataLength + 5 + 2 * outputPropRefs :
            outputDataLength + 3 + outputPropRefs);

        const dv = new DataView(buffer.buffer);
        dv.setUint8(0, 2); // Version Major
        dv.setUint8(1, 0); // Version Minor

        if (extendedKeyMode) {
            buffer[2] = 0xff;
            dv.setUint16(3, propertyKeys.size);
        } else {
            dv.setUint8(2, propertyKeys.size);
        }

        let offset = extendedKeyMode ? 5 : 3;

        let i = 3; // 0x0: RETURN, 0x1: FLAG, 0x2: reserved
        for (const [key, keyBin] of propertyKeys) {
            dv.setUint8(offset, keyBin.length);
            offset++;
            buffer.set(keyBin, offset);
            offset += keyBin.length;
            propertyKeyRefs.set(key, i);
            i++;
        }

        for (const item of staged) {
            if (typeof item === "number") {
                dv.setUint8(offset, item);
                offset += 1;
            } else if (typeof item === "string") {
                if (propertyKeyRefs.has(item)) {
                    const pos = propertyKeyRefs.get(item)!;

                    if (extendedKeyMode) {
                        dv.setUint16(offset, pos, true);
                        offset += 2;
                    } else {
                        dv.setUint8(offset, pos);
                        offset += 1;
                    }
                } else {
                    console.warn(`[JsBinPack] key ref '${item}' does not exist`);
                }
            } else {
                buffer.set(item, offset);
                offset += item.length;
            }
        }
        return buffer;
    }

    public unpack(data: Uint8Array): unknown {
        try {

            const buffer = data;
            const dv = new DataView(data.buffer);
            const versionMajor = dv.getUint8(0);
            const versionMinor = dv.getUint8(1);
            if (versionMajor !== 2 || versionMinor !== 0) {
                throw new JsBinPackUnsupportedVersionError(versionMajor, versionMinor);
            }

            const propertyKeys = new Map<number, string>();

            const keyTableSize = dv.getUint8(2);
            const extendedKeyMode = keyTableSize === 0xff;
            let offset = 3;

            if (extendedKeyMode) {
                const extendedTableSize = dv.getUint16(offset);
                offset += 2;
                for (let i = 0; i < extendedTableSize; i++) {
                    const itemLength = dv.getUint8(offset);
                    offset++;
                    const content = new TextDecoder().decode(buffer.slice(offset, offset + itemLength));
                    offset += itemLength;
                    propertyKeys.set(i + 3, content);
                }
            } else {
                for (let i = 0; i < keyTableSize; i++) {
                    const itemLength = dv.getUint8(offset);
                    offset++;
                    const content = new TextDecoder().decode(buffer.slice(offset, offset + itemLength));
                    offset += itemLength;
                    propertyKeys.set(i + 3, content);
                }
            }

            const parseBuffer = (size: 1 | 2 | 4 | 8) => {
                let dataSize = 0;
                if (size === 1) {
                    dataSize = dv.getUint8(offset);
                } else if (size === 2) {
                    dataSize = dv.getUint16(offset);
                } else if (size === 4) {
                    dataSize = dv.getUint32(offset);
                } else if (size === 8) {
                    const bigSize = dv.getBigUint64(offset);
                    if (bigSize > BigInt(Number.MAX_SAFE_INTEGER)) {
                        throw new JsBinPackLimitError(`block data length is bigger than MAX_SAFE_INTEGER / ${Math.round(Number.MAX_SAFE_INTEGER / 1e15)}PB`);
                    }
                    dataSize = Number(bigSize);
                }
                offset += size;
                const res = data.slice(offset, offset + dataSize);
                offset += dataSize;
                return res;
            };

            const refs = new Map<number, unknown>();
            let refEnumerator = 0;

            const markForRef = (item: unknown) => {
                refs.set(refEnumerator, item);
                refEnumerator++;
            };

            const tryParsing = (overrideType?: PACK) => {
                const type = overrideType ?? dv.getUint8(offset);
                if (overrideType === undefined) {
                    offset++;
                }
                switch (type) {
                    case PACK.UNDEFINED: {
                        return undefined;
                    }
                    case PACK.NULL: {
                        return null;
                    }

                    case PACK.REF: {
                        const ref = dv.getUint32(offset);
                        offset += 4;
                        if (refs.has(ref)) {
                            return refs.get(ref)!;
                        } else {
                            throw new JsBinPackMalformedError(data, `reference 0x${refEnumerator.toString(16)} is unknown`);
                        }
                    }

                    case PACK.TRUE: {
                        return true;
                    }
                    case PACK.FALSE: {
                        return false;
                    }
                    case PACK.BOOL: {
                        const value = dv.getUint8(offset);
                        offset++;
                        return value > 0;
                    }

                    case PACK.SYMBOL_UNKNOWN: {
                        return Symbol();
                    }
                    case PACK.SYMBOL_EXTENDED: {
                        throw new JsBinPackUnsupportedTypeError(type);
                    }

                    case PACK.U8: {
                        const value = dv.getUint8(offset);
                        offset++;
                        return value;
                    }
                    case PACK.I8: {
                        const value = dv.getInt8(offset);
                        offset++;
                        return value;
                    }
                    case PACK.U16: {
                        const value = dv.getUint16(offset);
                        offset += 2;
                        return value;
                    }
                    case PACK.I16: {
                        const value = dv.getInt16(offset);
                        offset += 2;
                        return value;
                    }
                    case PACK.U32: {
                        const value = dv.getUint32(offset);
                        offset += 4;
                        return value;
                    }
                    case PACK.I32: {
                        const value = dv.getInt32(offset);
                        offset += 4;
                        return value;
                    }
                    case PACK.F32: {
                        const value = dv.getFloat32(offset);
                        offset += 4;
                        return value;
                    }
                    case PACK.U64: {
                        const value = dv.getBigUint64(offset);
                        offset += 8;
                        return value;
                    }
                    case PACK.I64: {
                        const value = dv.getBigInt64(offset);
                        offset += 8;
                        return value;
                    }
                    case PACK.F64: {
                        const value = dv.getFloat64(offset);
                        offset += 8;
                        return value;
                    }
                    case PACK.NAN: {
                        return NaN;
                    }

                    case PACK.OBJECT: {
                        const result: Record<string, unknown> = {};
                        markForRef(result);
                        while (true) {
                            let nextKey = dv.getUint8(offset);
                            if (nextKey === PACK.RETURN) {
                                offset++;
                                return result;
                            }
                            if (extendedKeyMode) {
                                nextKey = dv.getUint16(offset, true);
                                offset += 2;
                            } else {
                                offset += 1;
                            }
                            if (propertyKeys.has(nextKey)) {
                                const key = propertyKeys.get(nextKey)!;
                                const nextItem = parseValue();
                                result[key] = nextItem;
                            } else {
                                throw new JsBinPackMalformedError(data, `object key ${nextKey} is not included in key table`);
                            }
                        }
                    }
                    case PACK.ARRAY: {
                        const result: unknown[] = [];
                        markForRef(result);
                        while (true) {
                            const nextItem = parseValue();
                            if (nextItem === JSBINPACK_MARK_RETURN) {
                                return result;
                            } else {
                                result.push(nextItem);
                            }
                        }
                    }
                    case PACK.ARRAY_TYPED: {
                        throw new JsBinPackUnsupportedTypeError(type);
                    }
                    case PACK.MAP: {
                        const result = new Map<unknown, unknown>();
                        markForRef(result);
                        while (true) {
                            const nextKey = parseValue();
                            if (nextKey === JSBINPACK_MARK_RETURN) {
                                return result;
                            } else {
                                const nextValue = parseValue();
                                if (nextValue === JSBINPACK_MARK_RETURN) {
                                    throw new JsBinPackMalformedError(data, `map value is invalid`);
                                }
                                result.set(nextKey, nextValue);
                            }
                        }
                    }
                    case PACK.MAP_TYPED: {
                        throw new JsBinPackUnsupportedTypeError(type);
                    }
                    case PACK.SET: {
                        const result = new Set<unknown>();
                        while (true) {
                            const nextItem = parseValue();
                            if (nextItem === JSBINPACK_MARK_RETURN) {
                                markForRef(result);
                                return result;
                            } else {
                                result.add(nextItem);
                            }
                        }
                    }
                    case PACK.SET_TYPED: {
                        throw new JsBinPackUnsupportedTypeError(type);
                    }
                    case PACK.STRING8: {
                        const str = new TextDecoder().decode(parseBuffer(1));
                        markForRef(str);
                        return str;
                    }
                    case PACK.STRING16: {
                        const str = new TextDecoder().decode(parseBuffer(2));
                        markForRef(str);
                        return str;
                    }
                    case PACK.STRING32: {
                        const str = new TextDecoder().decode(parseBuffer(4));
                        markForRef(str);
                        return str;
                    }
                    case PACK.STRING64: {
                        const str = new TextDecoder().decode(parseBuffer(8));
                        markForRef(str);
                        return str;
                    }
                    case PACK.UINT8_ARRAY8: {
                        const buf = parseBuffer(1);
                        markForRef(buf);
                        return buf;
                    }
                    case PACK.UINT8_ARRAY16: {
                        const buf = parseBuffer(2);
                        markForRef(buf);
                        return buf;
                    }
                    case PACK.UINT8_ARRAY32: {
                        const buf = parseBuffer(4);
                        markForRef(buf);
                        return buf;
                    }
                    case PACK.UINT8_ARRAY64: {
                        const buf = parseBuffer(8);
                        markForRef(buf);
                        return buf;
                    }
                    case PACK.ARRAY_BUFFER8: {
                        const { buffer } = parseBuffer(1);
                        markForRef(buffer);
                        return buffer;
                    }
                    case PACK.ARRAY_BUFFER16: {
                        const { buffer } = parseBuffer(2);
                        markForRef(buffer);
                        return buffer;
                    }
                    case PACK.ARRAY_BUFFER32: {
                        const { buffer } = parseBuffer(4);
                        markForRef(buffer);
                        return buffer;
                    }
                    case PACK.ARRAY_BUFFER64: {
                        const { buffer } = parseBuffer(8);
                        markForRef(buffer);
                        return buffer;
                    }
                    case PACK.FLAG: {
                        return JSBINPACK_MARK_IGNORE;
                    }
                    case PACK.UNSUPPORTED: {
                        console.warn(`[JsBinPack]: original data contained data that could not be serialized, ignoring`);
                        return JSBINPACK_MARK_IGNORE;
                    }
                    case PACK.RETURN: {
                        return JSBINPACK_MARK_RETURN;
                    }
                }
                throw new JsBinPackUnsupportedTypeError(type);
            };

            const parseValue = (overrideType?: PACK) => {
                while (true) {
                    const res = tryParsing(overrideType);
                    if (res !== JSBINPACK_MARK_IGNORE) {
                        return res;
                    }
                }
            };

            const res = parseValue();
            if (offset > data.byteLength) {
                throw new JsBinPackMalformedError(data, `unexpected end of data`);
            } else if (offset < data.byteLength) {
                throw new JsBinPackMalformedError(data, `message (${data.byteLength}) is longer than its content ${offset}`);
            }
            return res;
        } catch (err) {
            if (err instanceof RangeError) {
                if (err.message === `Offset is outside the bounds of the DataView`) {
                    throw new JsBinPackMalformedError(data, `unexpected end of data`);
                }
            }
            if (err instanceof JsBinPackError) {
                throw err;
            }
            console.error(`[JsBinPack]: unexpected error:`, err);
            throw err;
        }
    }
}
