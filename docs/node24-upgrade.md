# Node 24 Upgrade — Audit & Migration Report

**Package:** `nestjs-aws` `1.0.0` → `2.0.0` (breaking)
**Scope:** full Node 24 compatibility, AWS SDK v2 → v3, tooling modernization,
consumer-facing export/type validation, and runtime functional verification.

---

## 1. Why this is a breaking release

| Area | Before (v1) | After (v2) |
|---|---|---|
| AWS SDK | `aws-sdk` v2 (monolith) | `@aws-sdk/client-s3`, `@aws-sdk/client-sns`, `@aws-sdk/s3-request-presigner` |
| Config shape | flat `{accessKeyId, secretAccessKey, region}` | nested `{region, credentials: {accessKeyId, secretAccessKey}}` (SDK v3 `S3ClientConfig`/`SNSClientConfig`) |
| NestJS peers | `^10 \|\| ^11` | `^10 \|\| ^11 \|\| ^12` |
| Node engines | implicit | `>=20` (verified on 20.19.4 / 22.16.0 / 24.22.0) |
| Linting | TSLint + `.eslintrc.json` | ESLint 10 flat config (`eslint.config.mjs`) |
| Testing | ts-jest with e2e scaffold | Jest 30 + ts-jest 29.4 + transform shim (no experimental flags) |
| Types entry | `main` only | `main` + `types` + full `exports` map (node10 / node16 / bundler resolution all verified) |

> **Consumers must update their module config** to the nested `credentials`
> shape — flat credential keys are silently ignored by SDK v3 clients and fall
> back to the default provider chain (IAM role / env vars). See README.

## 2. Source migration details

### S3 (`src/service/aws.s3.service.ts`)
- `S3` → `S3Client`; `Upload`/`PutObject`/`GetObject`/`CopyObject`/`DeleteObject`/
  `ListObjects`/`HeadObject` v2 calls → v3 command classes.
- Binary reads: `Body.transformToString(encoding)` (utf8 and `base64` round-trips
  verified at runtime).
- `getSignedUrl` from `@aws-sdk/s3-request-presigner`; `Expires` lifted **out of
  the command input** into `{ expiresIn }` (presigner option), per `IGetSignedUrlRequest`.
- `copyObject` latent v2 bug (callback passed to `.promise()`, which never
  resolved) removed by the command-based rewrite.

### SNS (`src/service/aws.sns.service.ts`)
- `new AWS.SNS().publish()` → `new SNSClient().send(new PublishCommand())`.
- Response type is `PublishResponse` (v3 naming — `PublishOutput` does not exist).

### SES (`src/service/aws.ses.service.ts`)
- Unchanged at the API level: nodemailer SMTP transport wrapping SES. Only the
  interface types were refreshed. Verified end-to-end against a real SMTP
  endpoint (see §5).

### Generator (`src/service/generator.service.ts`)
- `uuid` package → built-in `crypto.randomUUID()`.

## 3. Tooling migration findings (and traps)

1. **Incremental emit trap.** `tsconfig.json` uses composite/incremental builds;
   a stale `tsconfig.tsbuildinfo` makes `tsc -p tsconfig.build.json` emit
   *nothing*. `prebuild` now deletes **both** `dist/` and `tsconfig.tsbuildinfo`
   using node's built-in `fs.rmSync` (no `rimraf` dependency).
2. **Jest 30 + `import.meta`.** Nest 12 (`@nestjs/common`) is pure ESM. Running
   tests via Jest's native-ESM path requires `--experimental-vm-modules` **and**
   Node ≥ 24.9. Instead, `jest.transform.cjs` wraps ts-jest and shims
   `import.meta` → `('file://' + __filename)` while compiling to CJS, with a
   `transformIgnorePatterns` whitelist for the ESM dependency chain
   (`@nestjs/*`, `file-type`, `strtok3`, `token-types`, `@tokenizer/*`,
   `uint8array-extras`, `@standard-schema/*`). Tests therefore run with plain
   `jest` on **any** supported Node version — no flags, no version floor.
3. **Transform path gotcha.** `transform` patterns resolve against `<rootDir>`;
   the transform lives at the repo root while `rootDir` is `src/`, so the
   config points at `<rootDir>/../jest.transform.cjs`.
4. **TypeScript 7 unusable** for this codebase today (decorators/tooling
   constraints); pinned to `^5.9.3`.
5. **`@aws-sdk/client-sns`** exports `PublishResponse`, not `PublishOutput`.

## 4. Static validation (all green)

| Check | Node 20.19.4 | Node 22.16.0 | Node 24.22.0 |
|---|---|---|---|
| `npm ci` | ✅ | ✅ | ✅ |
| `npm run lint` (0 problems) | ✅ | ✅ | ✅ |
| `npm test` (4/4, no flags) | ✅ | ✅ | ✅ |
| `npm run build` (fresh emit) | ✅ | ✅ | ✅ |
| `npm audit --omit=dev` | 0 vulns | 0 vulns | 0 vulns |
| `dist` loads (require) | ✅ | ✅ | ✅ |

## 5. Functional verification (Layer 2 — real AWS calls)

Unit tests only cover module wiring. Every S3/SNS/SES method was exercised at
runtime through the **packed consumer artifact** (`npm pack` → install into a
scratch Nest consumer), against:

- **LocalStack 3.8.1** (`SERVICES=s3,sns`, path-style, endpoint override) for S3 + SNS
- **MailHog** (SMTP capture on `:1025`, API on `:8025`) for the SES nodemailer transport

**Result: 13/13 checks passed** — `upload` (url + 200), `getObject` utf8 and
base64 binary round-trips, `getUploadSignedUrl` + real HTTP PUT → 200 +
read-back, `copyObject` + read-back, `listObjects`, `checkExistenceFileFromBucket`
true/false, `deleteObject` → existence flips false, `sendSMS` → `MessageId`,
`sendMail` → captured and asserted in MailHog.

The harness lives at `scripts/functional-check.js` (see §7).

### Finding A — presigned URL checksum trap (fixed)

SDK v3 ≥ 3.7xx enables *flexible checksums* by default
(`requestChecksumCalculation: 'WHEN_SUPPORTED'`). For **presigned PUT URLs**
this appends `x-amz-checksum-crc32=<CRC32 of an EMPTY body>` +
`x-amz-sdk-checksum-algorithm=CRC32` to the query string. Any client that then
uploads a real body gets **HTTP 400** (checksum mismatch) — this affects real
AWS, not only mocks, and is a widely reported SDK issue for presigned uploads.

**Fix:** the service now builds a second, presigner-only client with
`requestChecksumCalculation: 'WHEN_REQUIRED'`; normal requests keep the SDK
default. (Note: the per-command escape hatch
`ChecksumAlgorithm: 'NONE'` exists at runtime but is **not assignable** in this
SDK version's `ChecksumAlgorithm` TS union, so the client-level option is used.)

### Finding B — LocalStack ≥ 2026 requires a license token

The current `localstack/localstack:latest` (CalVer 2026.x) refuses to start
without `LOCALSTACK_AUTH_TOKEN` (exit code 55), even for community services.
Pinned `localstack/localstack:3.8.1` runs token-free — the harness and CI
should pin a tag, not `latest`.

### Finding C — SDK Node support horizon

`@aws-sdk/client-s3@3.1154.0` emits `NodeVersionSupportWarning` on Node 20:
SDK releases after the first week of **January 2027** will require Node ≥ 22.
`engines: >=20` remains valid today; Node 20 is already EOL (Apr 2026), so
Node 22/24 are the recommended runtimes for consumers.

## 6. Artifact verification (Layer 1 — what consumers install)

`npm pack` (same `prepare`→build + `files` whitelist as a GitHub install)
produced a lean tarball (`dist/` + md only). In a scratch consumer:

- `require('nestjs-aws')` → all 7 exports load
- `dist/index.d.ts` present
- peers dedupe to a single `@nestjs/common@12.2.0`
- TypeScript resolution verified: `moduleResolution: node` (TS 5.9),
  `nodenext` (TS 5.9 and TS 7), `bundler` (TS 7)

Git installs only include **committed** files, so this must be re-run against
the pushed ref before release:

```bash
npm i github:box2home/nestjs-aws#<branch>   # pre-merge
npm i github:box2home/nestjs-aws#v2.0.0     # post-tag — pin the tag
```

## 7. How to re-run the functional tier

```bash
docker run -d --name ls24     -p 4566:4566 -e SERVICES=s3,sns localstack/localstack:3.8.1
docker run -d --name mailhog24 -p 1025:1025 -p 8025:8025 mailhog/mailhog

cd "$(mktemp -d)" && npm init -y
npm i /path/to/nestjs-aws-2.0.0.tgz @nestjs/common reflect-metadata rxjs
cp /path/to/repo/scripts/functional-check.js .
node functional.test.js        # expects 13/13

docker rm -f ls24 mailhog24    # cleanup
```

## 8. Remaining rollout checklist

- [ ] Push branch; install it in each downstream microservice
      (`npm i github:box2home/nestjs-aws#<branch>`).
- [ ] In each consumer: migrate flat credentials → nested `credentials`,
      run their test suites, confirm `npm ls aws-sdk` is empty (no v2 remnants).
- [ ] CI matrix on Node 20/22/24 (`npm ci`, lint, test, audit, pack-consumer smoke).
- [ ] Tag `v2.0.0`; repoint consumers to `#v2.0.0` (never track `master`).
- [ ] Optional dev-only follow-ups: `lint-staged` ^17, `@commitlint/*`, husky ≥9
      (fixes remaining fresh-install deprecation warnings; no runtime impact).

## Appendix — applied-migration quick reference

- Breaking: config `credentials` nesting; SDK v3 response types; `Expires` → `expiresIn`.
- `prebuild` must clean `dist` **and** `*.tsbuildinfo`.
- Jest needs `jest.transform.cjs` + `transformIgnorePatterns` whitelist — never
  `--experimental-vm-modules`.
- Presigning must use the `WHEN_REQUIRED` checksum client (Finding A).
- Pin LocalStack images; never `latest` (Finding B).
