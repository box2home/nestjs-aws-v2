<h1 align="center"></h1>

<div align="center">
  <a href="http://nestjs.com/" target="_blank">
    <img src="https://nestjs.com/img/logo_text.svg" width="150" alt="Nest Logo" />
  </a>

  <h3>A MODULE FOR AWS SERVICES (sns, s3, ses)</h3>

  <div align="center">
    <a href="https://nestjs.com" target="_blank">
      <img src="https://img.shields.io/badge/license-MIT-brightgreen.svg" alt="MIT license" />
      <img src="https://img.shields.io/badge/built%20with-NestJs-red.svg" alt="NestJS" />
      <img src="https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg" alt="Node.js >= 20" />
      <img src="https://img.shields.io/badge/AWS%20SDK-v3-blue.svg" alt="AWS SDK v3" />
    </a>
  </div>
</div>

### Requirements

- Node.js `>= 20` (Node 24 supported and tested)
- A NestJS `10.x / 11.x / 12.x` application (declared as peer dependencies)
- *Developing/testing this package works on any active Node LTS* — verified on 20.19.4 / 22.16.0 / 24.22.0 with plain `npm test`. Jest compiles Nest's ES-module output automatically (`jest.transform.cjs` + a `transformIgnorePatterns` whitelist), so **no experimental flags are needed**.

### Installation

```bash
npm install github:box2home/nestjs-aws#v2.0.0
```

> Pin a tag (`#v2.0.0` or later). `v2.0.0` is the AWS SDK **v3** release and contains breaking changes (see [Migration from v1](#migration-from-v1)).

### About AWS SERVICES

This module is a thin layer on top of the [AWS SDK for JavaScript v3](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/welcome.html) (S3, SNS) and [nodemailer](https://nodemailer.com/) for SES over SMTP.

### Quick Start

To configure your API connection, import the `AwsModule` according to the service you want to use by using the appropriate method. For example, to use the SMS service you need to import the module with the `forRootSnsAsync()` method. Basically, you configure the module with an AWS SDK v3 client configuration object (`S3ClientConfig` / `SNSClientConfig`). See the [AWS SDK v3 documentation](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-region.html) for all options (credentials come from the standard provider chain: environment variables, shared config, IAM role, …).

For example, your `AppModule` might look like this:

```typescript
import { Module } from '@nestjs/common';
import { AwsModule } from 'nestjs-aws';

@Module({
    imports: [
        AwsModule.forRootSnsAsync({
            useFactory: async () => ({
                region: 'YOUR_AWS_REGION',
                // explicit credentials are optional — the default provider
                // chain (env vars, shared config, IAM role) is used otherwise
                credentials: {
                    accessKeyId: 'YOUR ACCESS KEY ID',
                    secretAccessKey: 'YOUR SECRET ACCESS KEY',
                },
            }),
            inject: [],
        }),
    ],
    controllers: [AppController],
    providers: [AppService],
})
export class AppModule {}
```

Depending on which service you use, you have access to the method of the requested service (`AwsSnsService`, `AwsS3Service`, `AwsSesService`) which you can inject into any provider:

```typescript
import { Injectable } from '@nestjs/common';
import { AwsSnsService } from 'nestjs-aws';

@Injectable()
export class NotificationService {
    constructor(private readonly sns: AwsSnsService) {}

    async send(mobileNumber: string, message: string, subject: string) {
        return this.sns.sendSMS({
            PhoneNumber: mobileNumber,
            Message: message,
            Subject: subject,
        });
    }
}
```

### Migration from v1 (AWS SDK v2 → v3)

`v2.0.0` of this module migrated from the end-of-life `aws-sdk` v2 to `@aws-sdk/*` v3. Breaking changes:

1. **Configuration shape** — credentials must be nested (v2 accepted them flat):

   ```diff
   - { accessKeyId: '...', secretAccessKey: '...', region: '...' }
   + { region: '...', credentials: { accessKeyId: '...', secretAccessKey: '...' } }
   ```

2. **Module option types** — `IS3ModuleAsyncOptions.useFactory` now returns `S3ClientConfig` and `ISNSModuleAsyncOptions.useFactory` returns `SNSClientConfig` (instead of `ConfigurationOptions`).
3. **Error payloads** — HTTP status codes are exposed as `err.$metadata.httpStatusCode` instead of `err.statusCode`.
4. **`GeneratorService.uuid()`** now returns a random (v4) UUID via Node's built-in `crypto.randomUUID()` instead of a time-based (v1) UUID.
5. **NestJS** — `@nestjs/common`, `rxjs` and `reflect-metadata` are now peer dependencies (`^10 || ^11 || ^12`).
6. **Nest ≥ 12.2 is an ES module** — `@nestjs/common@12.2.x` ships `"type": "module"` with no CommonJS entry. Loading it from a CommonJS codebase relies on Node's native `require(esm)` — verified working on **Node 20.19.4, 22.16.0 and 24.22.0** (Node 24 recommended). Nest 10/11 consumers are unaffected.

### To Do

- [x] Tests

### Change Log

See [Changelog](CHANGELOG.md) for more information.

### Author

**ABBES Mohamed Amine**

### License

MIT licensed. See the [LICENSE](LICENSE) file for details.
