/**
 * Functional verification of every nestjs-aws service method.
 *
 * Requires running infrastructure first (see docs/node24-upgrade.md §7):
 *   docker run -d --name ls24      -p 4566:4566 -e SERVICES=s3,sns localstack/localstack:3.8.1
 *   docker run -d --name mailhog24 -p 1025:1025 -p 8025:8025 mailhog/mailhog
 *
 * Copy this file into a scratch consumer project that has `nestjs-aws`
 * (the packed tarball), @nestjs/common, reflect-metadata and rxjs installed,
 * then run:  node functional-check.js     — expects 13/13 checks passed.
 */
require('reflect-metadata');
const { AwsS3Service, AwsSnsService, AwsSesService } = require('nestjs-aws');
const {
    S3Client,
    CreateBucketCommand,
} = require('@aws-sdk/client-s3');

const LS = 'http://localhost:4566';
const creds = { accessKeyId: 'test', secretAccessKey: 'test' };
// The NEW v3 configuration shape: nested credentials + endpoint override
const s3cfg = {
    region: 'us-east-1',
    endpoint: LS,
    forcePathStyle: true,
    credentials: creds,
};
const snsCfg = { region: 'us-east-1', endpoint: LS, credentials: creds };

const results = [];
function check(name, cond, detail = '') {
    results.push({ name, ok: !!cond, detail });
    console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`);
}

async function main() {
    // --- setup: fresh bucket -------------------------------------------
    const bucket = 'verify-' + Date.now();
    await new S3Client(s3cfg).send(new CreateBucketCommand({ Bucket: bucket }));
    console.log(`bucket created: ${bucket}\n`);

    const s3 = new AwsS3Service(s3cfg);

    // 1. upload
    const up = await s3.upload({ Bucket: bucket, Key: 'hello.txt', Body: 'Hello Node 24' });
    check('upload → statusCode 200 + url', up[0]?.statusCode === 200 && up[0]?.data?.url, up[0]?.data?.url);

    // 2. getObject (utf8 round-trip)
    const txt = await s3.getObject({ Bucket: bucket, Key: 'hello.txt' });
    check('getObject utf8 round-trip', txt === 'Hello Node 24', JSON.stringify(txt));

    // 3. getObject (binary via base64 encoding param)
    const bin = Buffer.from([0, 1, 2, 250, 251, 252]);
    await s3.upload({ Bucket: bucket, Key: 'bin.dat', Body: bin });
    const b64 = await s3.getObject({ Bucket: bucket, Key: 'bin.dat' }, 'base64');
    check('getObject base64 binary round-trip', Buffer.from(b64, 'base64').equals(bin), b64);

    // 4. getUploadSignedUrl (Expires lifted out of the command → presigner)
    const url = await s3.getUploadSignedUrl({
        Bucket: bucket,
        Key: 'signed-upload.txt',
        Expires: 60,
    });
    check('getUploadSignedUrl returns URL', typeof url === 'string' && url.includes(bucket), String(url).slice(0, 90));
    const put = await fetch(url, { method: 'PUT', body: 'via signed url' });
    check('signed URL HTTP PUT → 200', put.status === 200, `status ${put.status}`);
    const viaSigned = await s3.getObject({ Bucket: bucket, Key: 'signed-upload.txt' });
    check('signed-url object readable after PUT', viaSigned === 'via signed url');

    // 5. copyObject (v2 had a latent bug here — callback on .promise())
    await s3.copyObject({ Bucket: bucket, Key: 'copy.txt', CopySource: `${bucket}/hello.txt` });
    const copied = await s3.getObject({ Bucket: bucket, Key: 'copy.txt' });
    check('copyObject + read-back matches', copied === 'Hello Node 24');

    // 6. listObjects
    const list = await s3.listObjects({ Bucket: bucket });
    check('listObjects sees ≥4 keys', (list.Contents?.length ?? 0) >= 4, `keys=${list.Contents?.length}`);

    // 7. checkExistenceFileFromBucket
    const exists = await s3.checkExistenceFileFromBucket({ Bucket: bucket, Key: 'hello.txt' });
    const missing = await s3.checkExistenceFileFromBucket({ Bucket: bucket, Key: 'nope.txt' });
    check('existence: present=true, absent=false', exists === true && missing === false);

    // 8. deleteObject → existence flips false
    await s3.deleteObject({ Bucket: bucket, Key: 'hello.txt' });
    const after = await s3.checkExistenceFileFromBucket({ Bucket: bucket, Key: 'hello.txt' });
    check('deleteObject → existence=false', after === false);

    // 9. SNS sendSMS
    try {
        const sns = new AwsSnsService(snsCfg);
        const res = await sns.sendSMS({ PhoneNumber: '+15551234567', Message: 'node24 functional tier' });
        check('SNS sendSMS → MessageId', !!res[0]?.data?.MessageId, JSON.stringify(res[0]?.data));
    } catch (e) {
        check('SNS sendSMS → MessageId', false, JSON.stringify(e?.response ?? e?.message ?? e));
    }

    // 10. SES via SMTP → MailHog capture
    try {
        const ses = new AwsSesService({
            host: 'localhost',
            port: 1025,
            secure: false,
            ignoreTLS: true,
        });
        const sent = await ses.sendMail({
            from: 'verify@example.com',
            to: 'dev@example.com',
            subject: 'node24-functional-tier',
            text: 'SES transporter check',
        });
        check('SES sendMail → statusCode 200', sent.statusCode === 200, sent.message);
        await new Promise((r) => setTimeout(r, 800));
        const msgs = await (await fetch('http://localhost:8025/api/v2/messages?limit=10')).json();
        const found = (msgs.items ?? []).find(
            (m) =>
                m?.Content?.Headers?.Subject?.[0] === 'node24-functional-tier' ||
                m?.Subject === 'node24-functional-tier',
        );
        check('MailHog captured the message', !!found, `messages in MailHog=${msgs.total}`);
    } catch (e) {
        check('SES sendMail', false, JSON.stringify(e?.response?.data ?? e?.message ?? e));
    }

    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} functional checks passed`);
    process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
    console.error('FATAL:', e);
    process.exit(1);
});
