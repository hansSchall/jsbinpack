const knownShortSymbols = new Map<symbol, number>([
    // make sure unpack errors are the same after repacking
    [JSBINPACK_INVALID_OBJECT, PACK.INVALID],
    [JSBINPACK_UNKNOWN_SYMBOL, PACK.SYMBOL_UNKNOWN],
    [JSBINPACK_SYNTAX_ERROR, PACK.SYNTAX_ERROR],
]);


export function pack<T = unknown>(obj: T): Uint8Array {
    return mergeBuffer([new Uint8Array([1]), packLayer(obj, new WeakMap(), 1)]);
}

function packLayer(obj: unknown, packed: WeakMap<WeakKey, number>, offset: number) {
    if ((typeof obj === "object" || typeof obj === "symbol") && obj !== null && !(typeof obj === "symbol" && knownShortSymbols.has(obj))) {
        if (packed.has(obj)) {
            const ref = packed.get(obj)!;
            const res = new Uint8Array(5);
            res[0] = PACK.REF;
            const dv = new DataView(res.buffer);
            dv.setUint32(1, ref);
            return res;
        }
        packed.set(obj, offset);
    }

    switch (typeof obj) {
        case "string":
            return packString(obj);
        case "number":
            return packNumber(obj);
        case "bigint":
            return new Uint8Array([PACK.INVALID]);
        case "boolean":
            if (obj) {
                return new Uint8Array([PACK.TRUE]);
            } else {
                return new Uint8Array([PACK.FALSE]);
            }
        case "symbol":
            return packSymbol(obj);
        case "undefined":
            return new Uint8Array([PACK.UNDEFINED]);
        case "object":
            if (obj === null) {
                return new Uint8Array([PACK.NULL]);
            }
            return packObject(obj, packed, offset);
        case "function":
            return new Uint8Array([PACK.INVALID]);
    }
}

function packRawBuffer(input: Uint8Array, short: number, long: number, longLong: number): Uint8Array {
    if (input.length <= 0xff) {
        const res = new Uint8Array(input.length + 2);
        res[0] = short;
        res[1] = input.length;
        res.set(input, 2);
        return res;
    } else if (input.length <= 0xffff) {
        const res = new Uint8Array(input.length + 3);
        res[0] = long;
        const dv = new DataView(res.buffer);
        dv.setUint16(1, input.length);
        res.set(input, 3);
        return res;
    } else {
        const res = new Uint8Array(input.length + 5);
        res[0] = longLong;
        const dv = new DataView(res.buffer);
        dv.setUint32(1, input.length);
        res.set(input, 5);
        return res;
    }
}

function packString(str: string): Uint8Array {
    const buf = new TextEncoder().encode(str);
    return packRawBuffer(buf, PACK.STRING8, PACK.STRING16, PACK.STRING32);
}

function packNumber(num: number): Uint8Array {
    if (Math.round(num) === num && num >= 0 && num <= 0xff) {
        const res = new Uint8Array(2);
        const dv = new DataView(res.buffer);
        res[0] = PACK.UINT8;
        dv.setUint8(1, num);
        return res;
    } else {
        const res = new Uint8Array(9);
        const dv = new DataView(res.buffer);
        res[0] = PACK.FLOAT64;
        dv.setFloat64(1, num);
        return res;
    }
}

function packSymbol(sym: symbol): Uint8Array {
    if (knownShortSymbols.has(sym)) {
        return new Uint8Array([knownShortSymbols.get(sym)!]);
    } else {
        return new Uint8Array([PACK.SYMBOL_UNKNOWN]);
    }
}

function packObject(obj: object, packed: WeakMap<WeakKey, number>, offset: number): Uint8Array {
    if (obj instanceof Array) {
        return packArray(obj, packed, offset);
    }
    if (obj instanceof Uint8Array) {
        return packRawBuffer(obj, PACK.UINT8_ARRAY8, PACK.UINT8_ARRAY16, PACK.UINT8_ARRAY32);
    }
    if (obj instanceof ArrayBuffer) {
        return packRawBuffer(new Uint8Array(obj), PACK.ARRAY_BUFFER8, PACK.ARRAY_BUFFER16, PACK.ARRAY_BUFFER32);
    }
    if (obj instanceof Map) {
        return packMap(obj, packed, offset);
    }
    if (obj instanceof Set) {
        return packSet(obj, packed, offset);
    }
    const res: Uint8Array[] = [];
    res.push(new Uint8Array([PACK.OBJECT]));
    let itemOffset = offset + 1;
    for (const itemId in obj) {
        const propLabel = new TextEncoder().encode(itemId);
        if (propLabel.length >= PACK.RETURN) {
            continue;
        }
        const propBuf = new Uint8Array(propLabel.length + 1);
        const dv = new DataView(propBuf.buffer);

        dv.setUint8(0, propLabel.length);
        propBuf.set(propLabel, 1);

        res.push(propBuf);
        itemOffset += propBuf.length;
        // @ts-expect-error is index
        const packedItem = packLayer(obj[itemId], packed, itemOffset);
        res.push(packedItem);
        itemOffset += packedItem.length;
    }
    res.push(new Uint8Array([PACK.RETURN]));
    return mergeBuffer(res);
}

function packArray(arr: Array<unknown>, packed: WeakMap<WeakKey, number>, offset: number): Uint8Array {
    const res: Uint8Array[] = [];
    res.push(new Uint8Array([PACK.ARRAY]));
    let itemOffset = offset + 1;
    for (const item of arr) {
        const packedItem = packLayer(item, packed, itemOffset);
        res.push(packedItem);
        itemOffset += packedItem.length;
    }
    res.push(new Uint8Array([PACK.RETURN]));
    return mergeBuffer(res);
}

function packMap(map: Map<unknown, unknown>, packed: WeakMap<WeakKey, number>, offset: number): Uint8Array {
    const res: Uint8Array[] = [];
    res.push(new Uint8Array([PACK.MAP]));
    let itemOffset = offset + 1;
    for (const [key, value] of map) {
        const packedKey = packLayer(key, packed, itemOffset);
        res.push(packedKey);
        itemOffset += packedKey.length;
        const packedValue = packLayer(value, packed, itemOffset);
        res.push(packedValue);
        itemOffset += packedValue.length;
    }
    res.push(new Uint8Array([PACK.RETURN]));
    return mergeBuffer(res);
}

function packSet(set: Set<unknown>, packed: WeakMap<WeakKey, number>, offset: number): Uint8Array {
    const res: Uint8Array[] = [];
    res.push(new Uint8Array([PACK.SET]));
    let itemOffset = offset + 1;
    for (const item of set) {
        const packedItem = packLayer(item, packed, itemOffset);
        res.push(packedItem);
        itemOffset += packedItem.length;
    }
    res.push(new Uint8Array([PACK.RETURN]));
    return mergeBuffer(res);
}

type Unpacker = [unknown, number];

export function unpack(buf: Uint8Array): unknown {
    if (buf[0] !== 1) {
        return JSBINPACK_SYNTAX_ERROR;
    }
    return unpackLayer(buf.slice(1), 1, new Map())[0];
}

const returnMark = Symbol();

function unpackLayer(buf: Uint8Array, offset: number, unpacked: Map<number, unknown>): Unpacker {
    const dv = new DataView(buf.buffer);
    let res: Unpacker = [JSBINPACK_SYNTAX_ERROR, Infinity];
    switch (buf[0]) {
        case PACK.UNDEFINED:
            res = [undefined, 1];
            break;
        case PACK.NULL:
            res = [null, 1];
            break;
        case PACK.INVALID:
            res = [JSBINPACK_INVALID_OBJECT, 1];
            break;
        case PACK.REF: {
            const pos = dv.getUint32(1);
            if (unpacked.has(pos)) {
                res = [unpacked.get(pos)!, 5];
            } else {
                res = [JSBINPACK_SYNTAX_ERROR, 5];
            }
            break;
        }

        case PACK.UINT8:
            res = [dv.getUint8(1), 2];
            break;
        case PACK.FLOAT64:
            res = [dv.getFloat64(1), 9];
            break;

        case PACK.TRUE:
            res = [true, 1];
            break;
        case PACK.FALSE:
            res = [false, 1];
            break;

        case PACK.SYMBOL_UNKNOWN:
            res = [Symbol(), 1];
            break;
        case PACK.SYMBOL_EXTENDED:
            res = [JSBINPACK_UNKNOWN_SYMBOL, 1];
            break;

        case PACK.STRING8:
            res = unpackString(buf, dv.getUint8(1), 2);
            break;
        case PACK.STRING16:
            res = unpackString(buf, dv.getUint16(1), 3);
            break;
        case PACK.STRING32:
            res = unpackString(buf, dv.getUint32(1), 5);
            break;

        case PACK.ARRAY:
            res = unpackArray(buf, offset, unpacked);
            break;
        case PACK.OBJECT:
            res = unpackObject(buf, offset, unpacked);
            break;
        case PACK.MAP:
            res = unpackMap(buf, offset, unpacked);
            break;
        case PACK.SET:
            res = unpackSet(buf, offset, unpacked);
            break;
        case PACK.RETURN:
            res = [returnMark, 1];
            break;

        case PACK.UINT8_ARRAY8: {
            const size = dv.getUint8(1);
            res = [buf.slice(2, 2 + size), size + 2];
            break;
        }
        case PACK.UINT8_ARRAY16: {
            const size = dv.getUint16(1);
            res = [buf.slice(3, 3 + size), size + 3];
            break;
        }
        case PACK.UINT8_ARRAY32: {
            const size = dv.getUint32(1);
            res = [buf.slice(5, 5 + size), size + 5];
            break;
        }

        case PACK.ARRAY_BUFFER8: {
            const size = dv.getUint8(1);
            res = [buf.slice(2, 2 + size).buffer, size + 2];
            break;
        }
        case PACK.ARRAY_BUFFER16: {
            const size = dv.getUint16(1);
            res = [buf.slice(3, 3 + size).buffer, size + 3];
            break;
        }
        case PACK.ARRAY_BUFFER32: {
            const size = dv.getUint32(1);
            res = [buf.slice(5, 5 + size).buffer, size + 5];
            break;
        }
    }
    unpacked.set(offset, res[0]);
    return res;
}

function unpackArray(buf: Uint8Array, objectOffset: number, unpacked: Map<number, unknown>): Unpacker {
    let itemOffset = 1;
    const result: unknown[] = [];
    unpacked.set(objectOffset, result);
    while (itemOffset < buf.length) {
        const [res, len] = unpackLayer(buf.slice(itemOffset), itemOffset + objectOffset, unpacked);
        itemOffset += len;
        if (res === returnMark) {
            return [result, itemOffset];
        } else {
            result.push(res);
        }
    }
    return [JSBINPACK_SYNTAX_ERROR, Infinity];
}

function unpackObject(buf: Uint8Array, objectOffset: number, unpacked: Map<number, unknown>): Unpacker {
    let itemOffset = 1;
    const result: Record<string, unknown> = {};
    unpacked.set(objectOffset, result);
    const dv = new DataView(buf.buffer);

    while (itemOffset < buf.length) {
        const labelLen = dv.getUint8(itemOffset);
        itemOffset++;
        if (labelLen === PACK.RETURN) {
            return [result, itemOffset];
        }
        const label = new TextDecoder().decode(buf.slice(itemOffset, itemOffset + labelLen));
        itemOffset += labelLen;
        const [res, len] = unpackLayer(buf.slice(itemOffset), itemOffset + objectOffset, unpacked);
        itemOffset += len;
        result[label] = res;
    }
    return [JSBINPACK_SYNTAX_ERROR, Infinity];
}

function unpackMap(buf: Uint8Array, objectOffset: number, unpacked: Map<number, unknown>): Unpacker {
    let itemOffset = 1;
    const result = new Map<unknown, unknown>();
    unpacked.set(objectOffset, result);
    while (itemOffset < buf.length) {
        const [key, keyLen] = unpackLayer(buf.slice(itemOffset), itemOffset + objectOffset, unpacked);
        itemOffset += keyLen;
        if (key === returnMark) {
            return [result, itemOffset];
        }
        const [value, valueLen] = unpackLayer(buf.slice(itemOffset), itemOffset + objectOffset, unpacked);
        itemOffset += valueLen;
        if (key === returnMark) {
            return [JSBINPACK_SYNTAX_ERROR, Infinity];
        }
        result.set(key, value);
    }
    return [JSBINPACK_SYNTAX_ERROR, Infinity];
}

function unpackSet(buf: Uint8Array, objectOffset: number, unpacked: Map<number, unknown>): Unpacker {
    let itemOffset = 1;
    const result = new Set<unknown>();
    unpacked.set(objectOffset, result);
    while (itemOffset < buf.length) {
        const [item, itemLen] = unpackLayer(buf.slice(itemOffset), itemOffset + objectOffset, unpacked);
        itemOffset += itemLen;
        if (item === returnMark) {
            return [result, itemOffset];
        }
        result.add(item);
    }
    return [JSBINPACK_SYNTAX_ERROR, Infinity];
}

function unpackString(buf: Uint8Array, size: number, offset: number): Unpacker {
    return [new TextDecoder().decode(buf.slice(offset, offset + size)), offset + size];
}
