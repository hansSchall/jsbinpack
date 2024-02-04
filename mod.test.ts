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

import { assertStrictEquals, assertEquals } from "https://deno.land/std@0.214.0/assert/mod.ts";
import { JsBinPack, PACK } from "./mod.ts";

Deno.test("pack/unpack", () => {
    const instance = new JsBinPack();
    function test(data: unknown, type?: PACK) {
        const packed = instance.pack(data);
        // console.log(data, packed);
        if (type) {
            assertEquals(packed[packed[2] + 3], type);
        }
        const unpacked = instance.unpack(packed);
        assertEquals(unpacked, data);
        return unpacked;
    }

    test(5, PACK.U8);
    test(0.5, PACK.F64);
    test(null, PACK.NULL);
    test(undefined, PACK.UNDEFINED);
    test(true, PACK.TRUE);
    test(false, PACK.FALSE);
    test(new Map([
        [5, 2],
    ]), PACK.MAP);
    test(new Set([5]), PACK.SET);
    test("abc", PACK.STRING8);
    test("abc".repeat(86), PACK.STRING16);
    test("abc".repeat(21846), PACK.STRING32);

    test(new Uint8Array(5).fill(1), PACK.UINT8_ARRAY8);
    test(new Uint8Array(255).fill(1), PACK.UINT8_ARRAY8);
    test(new Uint8Array(256).fill(1), PACK.UINT8_ARRAY16);
    test(new Uint8Array(0xffff + 1).fill(1), PACK.UINT8_ARRAY32);

    // running this test needs at least 8GB free RAM
    // const packed = instance.pack(new Uint8Array(0xffffffff + 1).fill(1));
    // assertEquals(packed[packed[2] + 3], PACK.UINT8_ARRAY64);
    // instance.unpack(packed);

    test(new ArrayBuffer(5), PACK.ARRAY_BUFFER8);
    test(new ArrayBuffer(255), PACK.ARRAY_BUFFER8);
    test(new ArrayBuffer(256), PACK.ARRAY_BUFFER16);
    test(new ArrayBuffer(0xffff + 1), PACK.ARRAY_BUFFER32);

    test([new Uint8Array([40, 2, 97, 98])], PACK.ARRAY);

    test({ a: new Uint8Array(255).fill(1) });

    test([
        {
            a: 5,
        },
        {
            a: 6
        }
    ]);

    const A = {
        one: 1,
        b: "b",
    };

    const B = {
        a1: A,
        a2: A,
    };

    const C: {
        b: typeof B,
        d: typeof D | null,
    } = {
        b: B,
        d: null,
    };

    const D = {
        a: C,
    };

    C.d = D;

    test(A);
    const B_ = test(B) as typeof B;
    assertStrictEquals(B_.a1 === B_.a2, true);
    test(C);
    test(D);
});
