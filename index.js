"use strict";
/*! noble-bls12-381 - MIT License (c) Paul Miller (paulmillr.com) */
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyBatch = exports.aggregateSignatures = exports.aggregatePublicKeys = exports.verify = exports.sign = exports.getPublicKey = exports.pairing = exports.PointG2 = exports.PointG1 = exports.utils = exports.CURVE = exports.Fp12 = exports.Fp2 = exports.Fr = exports.Fp = void 0;
const math_1 = require("./math");
Object.defineProperty(exports, "Fp", { enumerable: true, get: function () { return math_1.Fp; } });
Object.defineProperty(exports, "Fr", { enumerable: true, get: function () { return math_1.Fr; } });
Object.defineProperty(exports, "Fp2", { enumerable: true, get: function () { return math_1.Fp2; } });
Object.defineProperty(exports, "Fp12", { enumerable: true, get: function () { return math_1.Fp12; } });
Object.defineProperty(exports, "CURVE", { enumerable: true, get: function () { return math_1.CURVE; } });
const POW_2_381 = 2n ** 381n;
const POW_2_382 = POW_2_381 * 2n;
const POW_2_383 = POW_2_382 * 2n;
const PUBLIC_KEY_LENGTH = 48;
const SHA256_DIGEST_SIZE = 32;
let DST_LABEL = 'BLS_SIG_BLS12381G2_XMD:SHA-256_SSWU_RO_NUL_';
exports.utils = {
    hashToField: hash_to_field,
    async sha256(message) {
        if (typeof self == 'object' && 'crypto' in self) {
            const buffer = await self.crypto.subtle.digest('SHA-256', message.buffer);
            return new Uint8Array(buffer);
        }
        else if (typeof process === 'object' && 'node' in process.versions) {
            const { createHash } = require('crypto');
            const hash = createHash('sha256');
            hash.update(message);
            return Uint8Array.from(hash.digest());
        }
        else {
            throw new Error("The environment doesn't have sha256 function");
        }
    },
    randomBytes: (bytesLength = 32) => {
        if (typeof self == 'object' && 'crypto' in self) {
            return self.crypto.getRandomValues(new Uint8Array(bytesLength));
        }
        else if (typeof process === 'object' && 'node' in process.versions) {
            const { randomBytes } = require('crypto');
            return new Uint8Array(randomBytes(bytesLength).buffer);
        }
        else {
            throw new Error("The environment doesn't have randomBytes function");
        }
    },
    randomPrivateKey: () => {
        let i = 32;
        while (i--) {
            const b32 = exports.utils.randomBytes(32);
            const num = bytesToNumberBE(b32);
            if (num > 1n && num < math_1.CURVE.r)
                return b32;
        }
        throw new Error('Valid private key was not found in 32 iterations. PRNG is broken');
    },
    mod: math_1.mod,
    getDSTLabel() {
        return DST_LABEL;
    },
    setDSTLabel(newLabel) {
        if (typeof newLabel !== 'string' || newLabel.length > 2048 || newLabel.length === 0) {
            throw new TypeError('Invalid DST');
        }
        DST_LABEL = newLabel;
    },
};
function bytesToNumberBE(bytes) {
    let value = 0n;
    for (let i = bytes.length - 1, j = 0; i >= 0; i--, j++) {
        value += (BigInt(bytes[i]) & 255n) << (8n * BigInt(j));
    }
    return value;
}
function bytesToHex(uint8a) {
    let hex = '';
    for (let i = 0; i < uint8a.length; i++) {
        hex += uint8a[i].toString(16).padStart(2, '0');
    }
    return hex;
}
function hexToBytes(hex) {
    if (typeof hex !== 'string') {
        throw new TypeError('hexToBytes: expected string, got ' + typeof hex);
    }
    if (hex.length % 2)
        throw new Error('hexToBytes: received invalid unpadded hex');
    const array = new Uint8Array(hex.length / 2);
    for (let i = 0; i < array.length; i++) {
        const j = i * 2;
        array[i] = Number.parseInt(hex.slice(j, j + 2), 16);
    }
    return array;
}
function toPaddedHex(num, padding) {
    if (num < 0n)
        throw new Error('Expected valid number');
    if (typeof padding !== 'number')
        throw new TypeError('Expected valid padding');
    return num.toString(16).padStart(padding * 2, '0');
}
function ensureBytes(hex) {
    if (hex instanceof Uint8Array)
        return hex;
    if (typeof hex === 'string')
        return hexToBytes(hex);
    throw new TypeError('Expected hex string or Uint8Array');
}
function concatBytes(...arrays) {
    if (arrays.length === 1)
        return arrays[0];
    const length = arrays.reduce((a, arr) => a + arr.length, 0);
    const result = new Uint8Array(length);
    for (let i = 0, pad = 0; i < arrays.length; i++) {
        const arr = arrays[i];
        result.set(arr, pad);
        pad += arr.length;
    }
    return result;
}
function stringToBytes(str) {
    const bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
        bytes[i] = str.charCodeAt(i);
    }
    return bytes;
}
function os2ip(bytes) {
    let result = 0n;
    for (let i = 0; i < bytes.length; i++) {
        result <<= 8n;
        result += BigInt(bytes[i]);
    }
    return result;
}
function i2osp(value, length) {
    if (value < 0 || value >= 1 << (8 * length)) {
        throw new Error(`bad I2OSP call: value=${value} length=${length}`);
    }
    const res = Array.from({ length }).fill(0);
    for (let i = length - 1; i >= 0; i--) {
        res[i] = value & 0xff;
        value >>>= 8;
    }
    return new Uint8Array(res);
}
function strxor(a, b) {
    const arr = new Uint8Array(a.length);
    for (let i = 0; i < a.length; i++) {
        arr[i] = a[i] ^ b[i];
    }
    return arr;
}
async function expand_message_xmd(msg, DST, lenInBytes) {
    const H = exports.utils.sha256;
    const b_in_bytes = SHA256_DIGEST_SIZE;
    const r_in_bytes = b_in_bytes * 2;
    const ell = Math.ceil(lenInBytes / b_in_bytes);
    if (ell > 255)
        throw new Error('Invalid xmd length');
    const DST_prime = concatBytes(DST, i2osp(DST.length, 1));
    const Z_pad = i2osp(0, r_in_bytes);
    const l_i_b_str = i2osp(lenInBytes, 2);
    const b = new Array(ell);
    const b_0 = await H(concatBytes(Z_pad, msg, l_i_b_str, i2osp(0, 1), DST_prime));
    b[0] = await H(concatBytes(b_0, i2osp(1, 1), DST_prime));
    for (let i = 1; i <= ell; i++) {
        const args = [strxor(b_0, b[i - 1]), i2osp(i + 1, 1), DST_prime];
        b[i] = await H(concatBytes(...args));
    }
    const pseudo_random_bytes = concatBytes(...b);
    return pseudo_random_bytes.slice(0, lenInBytes);
}
async function hash_to_field(msg, degree, isRandomOracle = true, field = math_1.CURVE.P) {
    const count = isRandomOracle ? 2 : 1;
    const m = degree;
    const L = 64;
    const len_in_bytes = count * m * L;
    const DST = stringToBytes(DST_LABEL);
    const pseudo_random_bytes = await expand_message_xmd(msg, DST, len_in_bytes);
    const u = new Array(count);
    for (let i = 0; i < count; i++) {
        const e = new Array(m);
        for (let j = 0; j < m; j++) {
            const elm_offset = L * (j + i * m);
            const tv = pseudo_random_bytes.slice(elm_offset, elm_offset + L);
            e[j] = math_1.mod(os2ip(tv), field);
        }
        u[i] = e;
    }
    return u;
}
function normalizePrivKey(key) {
    let int;
    if (key instanceof Uint8Array && key.length === 32)
        int = bytesToNumberBE(key);
    else if (typeof key === 'string' && key.length === 64)
        int = BigInt(`0x${key}`);
    else if (typeof key === 'number' && key > 0 && Number.isSafeInteger(key))
        int = BigInt(key);
    else if (typeof key === 'bigint' && key > 0n)
        int = key;
    else
        throw new TypeError('Expected valid private key');
    int = math_1.mod(int, math_1.CURVE.r);
    if (int < 1n)
        throw new Error('Private key must be 0 < key < CURVE.r');
    return int;
}
function assertType(item, type) {
    if (!(item instanceof type))
        throw new Error('Expected Fp* argument, not number/bigint');
}
class PointG1 extends math_1.ProjectivePoint {
    constructor(x, y, z = math_1.Fp.ONE) {
        super(x, y, z, math_1.Fp);
        assertType(x, math_1.Fp);
        assertType(y, math_1.Fp);
        assertType(z, math_1.Fp);
    }
    static fromHex(bytes) {
        bytes = ensureBytes(bytes);
        const { P } = math_1.CURVE;
        let point;
        if (bytes.length === 48) {
            const compressedValue = bytesToNumberBE(bytes);
            const bflag = math_1.mod(compressedValue, POW_2_383) / POW_2_382;
            if (bflag === 1n) {
                return this.ZERO;
            }
            const x = new math_1.Fp(math_1.mod(compressedValue, POW_2_381));
            const right = x.pow(3n).add(new math_1.Fp(math_1.CURVE.b));
            let y = right.sqrt();
            if (!y)
                throw new Error('Invalid compressed G1 point');
            const aflag = math_1.mod(compressedValue, POW_2_382) / POW_2_381;
            if ((y.value * 2n) / P !== aflag)
                y = y.negate();
            point = new PointG1(x, y);
        }
        else if (bytes.length === 96) {
            if ((bytes[0] & (1 << 6)) !== 0)
                return PointG1.ZERO;
            const x = bytesToNumberBE(bytes.slice(0, PUBLIC_KEY_LENGTH));
            const y = bytesToNumberBE(bytes.slice(PUBLIC_KEY_LENGTH));
            point = new PointG1(new math_1.Fp(x), new math_1.Fp(y));
        }
        else {
            throw new Error('Invalid point G1, expected 48/96 bytes');
        }
        point.assertValidity();
        return point;
    }
    static fromPrivateKey(privateKey) {
        return this.BASE.multiplyPrecomputed(normalizePrivKey(privateKey));
    }
    toRawBytes(isCompressed = false) {
        return hexToBytes(this.toHex(isCompressed));
    }
    toHex(isCompressed = false) {
        this.assertValidity();
        const { P } = math_1.CURVE;
        if (isCompressed) {
            let hex;
            if (this.isZero()) {
                hex = POW_2_383 + POW_2_382;
            }
            else {
                const [x, y] = this.toAffine();
                const flag = (y.value * 2n) / P;
                hex = x.value + flag * POW_2_381 + POW_2_383;
            }
            return toPaddedHex(hex, PUBLIC_KEY_LENGTH);
        }
        else {
            if (this.isZero()) {
                return '4'.padEnd(2 * 2 * PUBLIC_KEY_LENGTH, '0');
            }
            else {
                const [x, y] = this.toAffine();
                return toPaddedHex(x.value, PUBLIC_KEY_LENGTH) + toPaddedHex(y.value, PUBLIC_KEY_LENGTH);
            }
        }
    }
    assertValidity() {
        if (this.isZero())
            return this;
        if (!this.isOnCurve())
            throw new Error('Invalid G1 point: not on curve Fp');
        if (!this.isTorsionFree())
            throw new Error('Invalid G1 point: must be of prime-order subgroup');
        return this;
    }
    [Symbol.for('nodejs.util.inspect.custom')]() {
        return this.toString();
    }
    millerLoop(P) {
        return math_1.millerLoop(P.pairingPrecomputes(), this.toAffine());
    }
    clearCofactor() {
        return this.multiplyUnsafe(math_1.CURVE.h);
    }
    isOnCurve() {
        const b = new math_1.Fp(math_1.CURVE.b);
        const { x, y, z } = this;
        const left = y.pow(2n).multiply(z).subtract(x.pow(3n));
        const right = b.multiply(z.pow(3n));
        return left.subtract(right).isZero();
    }
    sigma() {
        const BETA = 0x1a0111ea397fe699ec02408663d4de85aa0d857d89759ad4897d29650fb85f9b409427eb4f49fffd8bfd00000000aaacn;
        const [x, y] = this.toAffine();
        return new PointG1(x.multiply(BETA), y);
    }
    isTorsionFree() {
        const c1 = 0x396c8c005555e1560000000055555555n;
        const P = this;
        const S = P.sigma();
        const Q = S.double();
        const S2 = S.sigma();
        const left = Q.subtract(P).subtract(S2).multiplyUnsafe(c1);
        const C = left.subtract(S2);
        return C.isZero();
    }
}
exports.PointG1 = PointG1;
PointG1.BASE = new PointG1(new math_1.Fp(math_1.CURVE.Gx), new math_1.Fp(math_1.CURVE.Gy), math_1.Fp.ONE);
PointG1.ZERO = new PointG1(math_1.Fp.ONE, math_1.Fp.ONE, math_1.Fp.ZERO);
class PointG2 extends math_1.ProjectivePoint {
    constructor(x, y, z = math_1.Fp2.ONE) {
        super(x, y, z, math_1.Fp2);
        assertType(x, math_1.Fp2);
        assertType(y, math_1.Fp2);
        assertType(z, math_1.Fp2);
    }
    static async hashToCurve(msg) {
        msg = ensureBytes(msg);
        const u = await hash_to_field(msg, 2);
        const Q0 = new PointG2(...math_1.isogenyMapG2(math_1.map_to_curve_simple_swu_9mod16(u[0])));
        const Q1 = new PointG2(...math_1.isogenyMapG2(math_1.map_to_curve_simple_swu_9mod16(u[1])));
        const R = Q0.add(Q1);
        const P = R.clearCofactor();
        return P;
    }
    static fromSignature(hex) {
        hex = ensureBytes(hex);
        const { P } = math_1.CURVE;
        const half = hex.length / 2;
        if (half !== 48 && half !== 96)
            throw new Error('Invalid compressed signature length, must be 96 or 192');
        const z1 = bytesToNumberBE(hex.slice(0, half));
        const z2 = bytesToNumberBE(hex.slice(half));
        const bflag1 = math_1.mod(z1, POW_2_383) / POW_2_382;
        if (bflag1 === 1n)
            return this.ZERO;
        const x1 = z1 % POW_2_381;
        const x2 = z2;
        const x = new math_1.Fp2([x2, x1]);
        const y2 = x.pow(3n).add(new math_1.Fp2(math_1.CURVE.b2));
        let y = y2.sqrt();
        if (!y)
            throw new Error('Failed to find a square root');
        const [y0, y1] = y.values;
        const aflag1 = (z1 % POW_2_382) / POW_2_381;
        const isGreater = y1 > 0n && (y1 * 2n) / P !== aflag1;
        const isZero = y1 === 0n && (y0 * 2n) / P !== aflag1;
        if (isGreater || isZero)
            y = y.multiply(-1n);
        const point = new PointG2(x, y, math_1.Fp2.ONE);
        point.assertValidity();
        return point;
    }
    static fromHex(bytes) {
        bytes = ensureBytes(bytes);
        let point;
        if (bytes.length === 96) {
            throw new Error('Compressed format not supported yet.');
        }
        else if (bytes.length === 192) {
            if ((bytes[0] & (1 << 6)) !== 0) {
                return PointG2.ZERO;
            }
            const x1 = bytesToNumberBE(bytes.slice(0, PUBLIC_KEY_LENGTH));
            const x0 = bytesToNumberBE(bytes.slice(PUBLIC_KEY_LENGTH, 2 * PUBLIC_KEY_LENGTH));
            const y1 = bytesToNumberBE(bytes.slice(2 * PUBLIC_KEY_LENGTH, 3 * PUBLIC_KEY_LENGTH));
            const y0 = bytesToNumberBE(bytes.slice(3 * PUBLIC_KEY_LENGTH));
            point = new PointG2(new math_1.Fp2([x0, x1]), new math_1.Fp2([y0, y1]));
        }
        else {
            throw new Error('Invalid uncompressed point G2, expected 192 bytes');
        }
        point.assertValidity();
        return point;
    }
    static fromPrivateKey(privateKey) {
        return this.BASE.multiplyPrecomputed(normalizePrivKey(privateKey));
    }
    toSignature() {
        if (this.equals(PointG2.ZERO)) {
            const sum = POW_2_383 + POW_2_382;
            return toPaddedHex(sum, PUBLIC_KEY_LENGTH) + toPaddedHex(0n, PUBLIC_KEY_LENGTH);
        }
        const [[x0, x1], [y0, y1]] = this.toAffine().map((a) => a.values);
        const tmp = y1 > 0n ? y1 * 2n : y0 * 2n;
        const aflag1 = tmp / math_1.CURVE.P;
        const z1 = x1 + aflag1 * POW_2_381 + POW_2_383;
        const z2 = x0;
        return toPaddedHex(z1, PUBLIC_KEY_LENGTH) + toPaddedHex(z2, PUBLIC_KEY_LENGTH);
    }
    toRawBytes(isCompressed = false) {
        return hexToBytes(this.toHex(isCompressed));
    }
    toHex(isCompressed = false) {
        this.assertValidity();
        if (isCompressed) {
            throw new Error('Point compression has not yet been implemented');
        }
        else {
            if (this.equals(PointG2.ZERO)) {
                return '4'.padEnd(2 * 4 * PUBLIC_KEY_LENGTH, '0');
            }
            const [[x0, x1], [y0, y1]] = this.toAffine().map((a) => a.values);
            return (toPaddedHex(x1, PUBLIC_KEY_LENGTH) +
                toPaddedHex(x0, PUBLIC_KEY_LENGTH) +
                toPaddedHex(y1, PUBLIC_KEY_LENGTH) +
                toPaddedHex(y0, PUBLIC_KEY_LENGTH));
        }
    }
    assertValidity() {
        if (this.isZero())
            return this;
        if (!this.isOnCurve())
            throw new Error('Invalid G2 point: not on curve Fp2');
        if (!this.isTorsionFree())
            throw new Error('Invalid G2 point: must be of prime-order subgroup');
        return this;
    }
    psi() {
        return this.fromAffineTuple(math_1.psi(...this.toAffine()));
    }
    psi2() {
        return this.fromAffineTuple(math_1.psi2(...this.toAffine()));
    }
    mulNegX() {
        return this.multiplyUnsafe(math_1.CURVE.x).negate();
    }
    clearCofactor() {
        const P = this;
        let t1 = P.mulNegX();
        let t2 = P.psi();
        let t3 = P.double();
        t3 = t3.psi2();
        t3 = t3.subtract(t2);
        t2 = t1.add(t2);
        t2 = t2.mulNegX();
        t3 = t3.add(t2);
        t3 = t3.subtract(t1);
        const Q = t3.subtract(P);
        return Q;
    }
    isOnCurve() {
        const b = new math_1.Fp2(math_1.CURVE.b2);
        const { x, y, z } = this;
        const left = y.pow(2n).multiply(z).subtract(x.pow(3n));
        const right = b.multiply(z.pow(3n));
        return left.subtract(right).isZero();
    }
    isTorsionFree() {
        const P = this;
        const psi2 = P.psi2();
        const psi3 = psi2.psi();
        const zPsi3 = psi3.mulNegX();
        return zPsi3.subtract(psi2).add(P).isZero();
    }
    [Symbol.for('nodejs.util.inspect.custom')]() {
        return this.toString();
    }
    clearPairingPrecomputes() {
        this._PPRECOMPUTES = undefined;
    }
    pairingPrecomputes() {
        if (this._PPRECOMPUTES)
            return this._PPRECOMPUTES;
        this._PPRECOMPUTES = math_1.calcPairingPrecomputes(...this.toAffine());
        return this._PPRECOMPUTES;
    }
}
exports.PointG2 = PointG2;
PointG2.BASE = new PointG2(new math_1.Fp2(math_1.CURVE.G2x), new math_1.Fp2(math_1.CURVE.G2y), math_1.Fp2.ONE);
PointG2.ZERO = new PointG2(math_1.Fp2.ONE, math_1.Fp2.ONE, math_1.Fp2.ZERO);
function pairing(P, Q, withFinalExponent = true) {
    if (P.isZero() || Q.isZero())
        throw new Error('No pairings at point of Infinity');
    P.assertValidity();
    Q.assertValidity();
    const looped = P.millerLoop(Q);
    return withFinalExponent ? looped.finalExponentiate() : looped;
}
exports.pairing = pairing;
function normP1(point) {
    return point instanceof PointG1 ? point : PointG1.fromHex(point);
}
function normP2(point) {
    return point instanceof PointG2 ? point : PointG2.fromSignature(point);
}
async function normP2Hash(point) {
    return point instanceof PointG2 ? point : PointG2.hashToCurve(point);
}
function getPublicKey(privateKey) {
    const bytes = PointG1.fromPrivateKey(privateKey).toRawBytes(true);
    return typeof privateKey === 'string' ? bytesToHex(bytes) : bytes;
}
exports.getPublicKey = getPublicKey;
async function sign(message, privateKey) {
    const msgPoint = await normP2Hash(message);
    msgPoint.assertValidity();
    const sigPoint = msgPoint.multiply(normalizePrivKey(privateKey));
    if (message instanceof PointG2)
        return sigPoint;
    const hex = sigPoint.toSignature();
    return typeof message === 'string' ? hex : hexToBytes(hex);
}
exports.sign = sign;
async function verify(signature, message, publicKey) {
    const P = normP1(publicKey);
    const Hm = await normP2Hash(message);
    const G = PointG1.BASE;
    const S = normP2(signature);
    const ePHm = pairing(P.negate(), Hm, false);
    const eGS = pairing(G, S, false);
    const exp = eGS.multiply(ePHm).finalExponentiate();
    return exp.equals(math_1.Fp12.ONE);
}
exports.verify = verify;
function aggregatePublicKeys(publicKeys) {
    if (!publicKeys.length)
        throw new Error('Expected non-empty array');
    const agg = publicKeys.map(normP1).reduce((sum, p) => sum.add(p), PointG1.ZERO);
    if (publicKeys[0] instanceof PointG1)
        return agg.assertValidity();
    const bytes = agg.toRawBytes(true);
    if (publicKeys[0] instanceof Uint8Array)
        return bytes;
    return bytesToHex(bytes);
}
exports.aggregatePublicKeys = aggregatePublicKeys;
function aggregateSignatures(signatures) {
    if (!signatures.length)
        throw new Error('Expected non-empty array');
    const agg = signatures.map(normP2).reduce((sum, s) => sum.add(s), PointG2.ZERO);
    if (signatures[0] instanceof PointG2)
        return agg.assertValidity();
    const bytes = agg.toSignature();
    if (signatures[0] instanceof Uint8Array)
        return hexToBytes(bytes);
    return bytes;
}
exports.aggregateSignatures = aggregateSignatures;
async function verifyBatch(signature, messages, publicKeys) {
    if (!messages.length)
        throw new Error('Expected non-empty messages array');
    if (publicKeys.length !== messages.length)
        throw new Error('Pubkey count should equal msg count');
    const sig = normP2(signature);
    const nMessages = await Promise.all(messages.map(normP2Hash));
    const nPublicKeys = publicKeys.map(normP1);
    try {
        const paired = [];
        for (const message of new Set(nMessages)) {
            const groupPublicKey = nMessages.reduce((groupPublicKey, subMessage, i) => subMessage === message ? groupPublicKey.add(nPublicKeys[i]) : groupPublicKey, PointG1.ZERO);
            paired.push(pairing(groupPublicKey, message, false));
        }
        paired.push(pairing(PointG1.BASE.negate(), sig, false));
        const product = paired.reduce((a, b) => a.multiply(b), math_1.Fp12.ONE);
        const exp = product.finalExponentiate();
        return exp.equals(math_1.Fp12.ONE);
    }
    catch {
        return false;
    }
}
exports.verifyBatch = verifyBatch;
PointG1.BASE.calcMultiplyPrecomputes(4);
