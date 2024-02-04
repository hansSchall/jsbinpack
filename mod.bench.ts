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

import { JsBinPack } from "./mod.ts";

const testObject = {
    label: "sd\\\"h\\\"h\\\"hfkgjhdfkgj",
    items: [
        {
            id: 566546543564654
        },
        {
            label: "kksjhd",
            items: {
                id: null
            }
        }
    ]
};
const testSmallString = "1";
const testBigString = "12345890".repeat(10000); // 100000 bytes
const jsbin = new JsBinPack();
Deno.bench("pack", () => {
    jsbin.unpack(jsbin.pack(testObject));
});

Deno.bench("json", () => {
    JSON.parse(JSON.stringify(testObject));
});


Deno.bench("pack small string", () => {
    jsbin.unpack(jsbin.pack(testSmallString));
});

Deno.bench("textencoder small string", () => {
    new TextDecoder().decode(new TextEncoder().encode(testSmallString));
});

Deno.bench("json small string", () => {
    JSON.parse(JSON.stringify(testSmallString));
});


Deno.bench("pack big string", () => {
    jsbin.unpack(jsbin.pack(testBigString));
});

Deno.bench("textencoder big string", () => {
    new TextDecoder().decode(new TextEncoder().encode(testBigString));
});

Deno.bench("json big string", () => {
    JSON.parse(JSON.stringify(testBigString));
});
