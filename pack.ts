enum PACK {
    UNDEFINED = 0x00,
    NULL = 0x01,
    INVALID = 0x02,
    REF = 0x03,

    TRUE = 0x04,
    FALSE = 0x05,
    SYMBOL_UNKNOWN = 0x06,
    SYMBOL_EXTENDED = 0x07,

    U8 = 0x08,
    I8 = 0x09,
    U32 = 0x0a,
    I32 = 0x0b,
    U64 = 0x0c,
    I64 = 0x0d,
    F64 = 0x0e,

    OBJECT = 0x0f,
    ARRAY = 0x10,
    ARRAY_TYPED = 0x11,
    MAP = 0x12,
    MAP_TYPED = 0x13,
    SET = 0x14,
    SET_TYPED = 0x15,

    STRING8 = 0x16,
    STRING16 = 0x17,
    STRING32 = 0x18,
    STRING64 = 0x19,

    UINT8_ARRAY8 = 0x1a,
    UINT8_ARRAY16 = 0x1b,
    UINT8_ARRAY32 = 0x1c,
    UINT8_ARRAY64 = 0x1d,

    ARRAY_BUFFER8 = 0x1e,
    ARRAY_BUFFER16 = 0x1f,
    ARRAY_BUFFER32 = 0x20,
    ARRAY_BUFFER64 = 0x21,

    // - 0x30: reserved

    // 0xf0 - 0xfc: reserved
    // FLAG = 0xfd,
    SYNTAX_ERROR = 0xfe,
    RETURN = 0xff,
}

export const JSBINPACK_INVALID_OBJECT = Symbol(`PACK_INVALID_OBJECT`);
export const JSBINPACK_UNKNOWN_SYMBOL = Symbol(`PACK_UNKNOWN_SYMBOL`);
export const JSBINPACK_SYNTAX_ERROR = Symbol(`PACK_SYNTAX_ERROR`);

function mergeBuffer(input: Uint8Array[]): Uint8Array {
    const len = input.reduce((prev, curr) => prev + curr.length, 0);
    const res = new Uint8Array(len);
    let offset = 0;
    for (const buf of input) {
        res.set(buf, offset);
        offset += buf.length;
    }
    return res;
}

class GrowableUint8Array {
    private readonly items = Array<Uint8Array | number>();
    push(item: number | Uint8Array | GrowableUint8Array) {
        if (item instanceof GrowableUint8Array) {
            this.items.push(...item.items);
        } else {
            this.items.push(item);
        }
    }
    pack() {
        const len = this.items.reduce<number>((prev, curr) => prev + (typeof curr === "number" ? 1 : curr.length), 0);
        const res = new Uint8Array(len);
        let offset = 0;
        for (const buf of this.items) {
            if (typeof buf === "number") {
                res[offset] = buf;
                offset++;
            } else {
                res.set(buf, offset);
                offset += buf.length;
            }
        }
        return res;
    }
}

export class JsBinPack {
    readonly definedSymbolsBySymbol = new Map<symbol, number>();
    readonly definedSymbolsById = new Map<number, symbol>();
    defineSymbol(symbol: symbol, id: number) {
        this.definedSymbolsById.set(id, symbol);
        this.definedSymbolsBySymbol.set(symbol, id);
    }
    public extendedKeyMode = false;
    public directKeyMode = false;
    pack(data: unknown): Uint8Array {
        const packer = new Packer(this);
        packer.packValue(data, 0);
        return new Uint8Array();
    }
    unpack(data: Uint8Array): unknown {
        return true;
    }
}

class Packer {
    constructor(readonly host: JsBinPack) {

    }
    readonly result: (Uint8Array | string | number)[] = [];

    readonly propertyKeys = new Map<string, Uint8Array>();
    readonly propertyKeyIds = new Map<string, number>();

    readonly packed = new Map<unknown, number>();

    packValue(value: unknown, valueId: number) {
        if ((typeof value === "string" && value.length > 5) || typeof value === "object") {
            if (this.packed.has(value)) {
                const ref = this.packed.get(value)!;
                const res = new Uint8Array(5);
                res[0] = PACK.REF;
                const dv = new DataView(res.buffer);
                dv.setUint32(1, ref);
                this.result.push(res);
                return;
            }
            this.packed.set(value, valueId);
        }

        switch (typeof value) {
            case "string": {
                const buf = new TextEncoder().encode(value);
                this.pushBuffer(buf, PACK.STRING8, PACK.STRING16, PACK.STRING32);
                break;
            }
            case "number": {
                if (Math.round(value) === value && value >= 0 && value <= 0xff) {
                    this.result.push(PACK.U8);
                    this.result.push(value);
                } else {
                    const res = new Uint8Array(9);
                    const dv = new DataView(res.buffer);
                    res[0] = PACK.F64;
                    dv.setFloat64(1, value);
                    this.result.push(res);
                }
                break;
            }
            case "boolean": {
                if (value) {
                    this.result.push(PACK.TRUE);
                } else {
                    this.result.push(PACK.FALSE);
                }
                break;
            }
            case "undefined": {
                this.result.push(PACK.UNDEFINED);
                break;
            }
            case "object": {
                if (value === null) {
                    this.result.push(PACK.NULL);
                } else {
                    if (value instanceof Array) {
                        // return packArray(obj, packed, offset);
                    } else if (value instanceof Uint8Array) {
                        this.pushBuffer(value, PACK.UINT8_ARRAY8, PACK.UINT8_ARRAY16, PACK.UINT8_ARRAY32);
                    } else if (value instanceof ArrayBuffer) {
                        this.pushBuffer(new Uint8Array(value), PACK.ARRAY_BUFFER8, PACK.ARRAY_BUFFER16, PACK.ARRAY_BUFFER32);
                    } else if (value instanceof Map) {
                        // return packMap(obj, packed, offset);
                    } else if (value instanceof Set) {
                        // return packSet(obj, packed, offset);
                    } else {
                        this.result.push(PACK.OBJECT);
                        let propertyValueId = valueId;
                        for (const itemId in value) {
                            if (!this.propertyKeys.has(itemId)) {
                                const propLabel = new TextEncoder().encode(itemId);
                                if (propLabel.length >= PACK.RETURN) {
                                    console.warn(`[JsBinPack]: property key too long, skipping`);
                                    continue;
                                }
                                this.propertyKeys.set(itemId, propLabel);

                            }
                            this.result.push(itemId);
                            // @ts-expect-error is index
                            const propertyValue = value[itemId];

                            propertyValueId++;
                            this.packValue(propertyValue, propertyValueId);

                        }
                        this.result.push(PACK.RETURN);
                    }
                }
                break;
            }
            default: {
                this.result.push(PACK.INVALID);
                break;
            }
        }
    }

    private packObject(obj: object, valueId: number) {

    }

    private packArray(arr: Array<unknown>, valueId: number) {

    }

    private pushBuffer(input: Uint8Array, short: number, long: number, longLong: number) {
        if (input.length <= 0xff) {
            this.result.push(short, input.length);
        } else if (input.length <= 0xffff) {
            const res = new Uint8Array(3);
            res[0] = long;
            const dv = new DataView(res.buffer);
            dv.setUint16(1, input.length);
            res.set(input, 3);
            this.result.push(res);
        } else {
            const res = new Uint8Array(5);
            res[0] = longLong;
            const dv = new DataView(res.buffer);
            dv.setUint32(1, input.length);
            res.set(input, 5);
            this.result.push(res);
        }
        this.result.push(input);
    }

    packKeyTable() {
        const table = new GrowableUint8Array();
        for (const key of this.propertyKeys) {
            const keyBin = new TextEncoder().encode(key);
            table.push(keyBin.length);
            table.push(keyBin);
        }
        return table;
    }

    packResult() {
        const result = new GrowableUint8Array();
        result.push(2); // Version Major
        result.push(0); // Version Minor
        result.push(this.packKeyTable());

    }
}
