/**
 * Jest transformer: ts-jest + an `import.meta` shim for CommonJS output.
 *
 * Why this exists: @nestjs/common@12.2 is pure ESM and one of the files in
 * its eager require chain (`utils/load-package.util.js`) uses
 * `createRequire(import.meta.url)`. TypeScript preserves `import.meta` even
 * when emitting CommonJS, and `import.meta` is a SyntaxError inside a CJS
 * module — so plain ts-jest output fails to compile under Jest's CJS loader
 * on Node versions that lack native `require(esm)` (Node < 22.12, or any
 * Node without `--experimental-vm-modules` + 24.9).
 *
 * Rewriting `import.meta.url` to a `file://` URL built from `__filename` is
 * semantically equivalent for a CJS module. This lets the test suite run on
 * any active Node LTS without experimental flags.
 */
const crypto = require('node:crypto');

const tsJest = require('ts-jest');

// Same resolution Jest itself uses when loading "ts-jest": unwrap the
// `default` factory and call createTransformer(transformerConfig).
const factory =
    tsJest.default && typeof tsJest.default.createTransformer === 'function'
        ? tsJest.default
        : tsJest;

if (typeof factory.createTransformer !== 'function') {
    throw new Error(
        'jest.transform.cjs: could not locate the ts-jest transformer factory',
    );
}

const SHIM_VERSION = 'import-meta-shim-v1';

/** One ts-jest instance per transformer config (matching how Jest caches). */
const instances = new Map();
function innerFor(transformerConfig) {
    const key = JSON.stringify(transformerConfig ?? null);
    if (!instances.has(key)) {
        instances.set(key, factory.createTransformer(transformerConfig));
    }
    return instances.get(key);
}

function shimImportMeta(code) {
    if (!code.includes('import.meta')) {
        return code;
    }
    return code
        .replace(/import\.meta\.url/g, "('file://' + __filename)")
        .replace(/import\.meta\b/g, "({ url: 'file://' + __filename })");
}

module.exports = {
    process(src, filename, options) {
        const result = innerFor(options?.transformerConfig).process(
            src,
            filename,
            options,
        );
        if (result == null) {
            return result;
        }
        if (typeof result === 'string') {
            return shimImportMeta(result);
        }
        return { ...result, code: shimImportMeta(result.code ?? '') };
    },
    getCacheKey(src, filename, options, transformOptions) {
        const base =
            typeof innerFor(options?.transformerConfig).getCacheKey === 'function'
                ? innerFor(options?.transformerConfig).getCacheKey(
                      src,
                      filename,
                      options,
                      transformOptions,
                  )
                : crypto.createHash('sha1').update(src).digest('hex');
        return `${base}|${SHIM_VERSION}`;
    },
};
