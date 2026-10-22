import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    CopyObjectCommand,
    DeleteObjectCommand,
    ListObjectsCommand,
    HeadObjectCommand,
    CopyObjectCommandInput,
    DeleteObjectCommandInput,
    GetObjectCommandInput,
    HeadObjectCommandInput,
    ListObjectsCommandInput,
    PutObjectCommandInput,
    S3ClientConfig,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
    Injectable,
    Inject,
    Logger,
    HttpStatus,
    HttpException,
} from '@nestjs/common';

import { CONFIG_CONNECTION_OPTIONS } from '../constants';
import { IGetSignedUrlRequest } from '../interfaces/s3-get-signed-url-request.interface';

/**
 * @export
 * @class AwsS3Service
 */
@Injectable()
export class AwsS3Service {
    private readonly _s3: S3Client;
    // SDK v3 (>=3.7xx) auto-attaches a flexible checksum (CRC32 of an empty
    // body) to presigned PUT URLs, which makes any real upload body fail
    // with HTTP 400. WHEN_REQUIRED keeps presigned URLs free of checksum
    // query params while normal requests keep the default behaviour.
    private readonly _s3Presign: S3Client;

    constructor(
        @Inject(CONFIG_CONNECTION_OPTIONS)
        private _options: S3ClientConfig,
    ) {
        Logger.log('initialising Aws Module', 'AWS S3 SERVICE');
        this._s3 = new S3Client(_options);
        this._s3Presign = new S3Client({
            ..._options,
            requestChecksumCalculation: 'WHEN_REQUIRED',
        });
    }

    async upload(params: PutObjectCommandInput) {
        return this._s3
            .send(new PutObjectCommand(params))
            .then(async info => {
                Logger.log(`success[S3]: ${JSON.stringify(info)}`);
                const region = await this._s3.config.region();
                return [
                    {
                        statusCode: HttpStatus.OK,
                        message: 'success',
                        data: {
                            url: `https://${params.Bucket}.s3-${region}.amazonaws.com/${params.Key}`,
                        },
                    },
                ];
            })
            .catch((err: any) => {
                Logger.error(
                    err.message,
                    `error[S3]: ${JSON.stringify(err)}`,
                );
                throw new HttpException(
                    {
                        statusCode:
                            err.$metadata?.httpStatusCode ??
                            HttpStatus.BAD_REQUEST,
                        message: 'error',
                        data: err,
                    },
                    HttpStatus.BAD_REQUEST,
                );
            });
    }

    async getObject(
        params: GetObjectCommandInput,
        encoding: BufferEncoding = 'utf8',
    ) {
        try {
            const fileData = await this._s3.send(
                new GetObjectCommand(params),
            );
            return fileData.Body
                ? await fileData.Body.transformToString(encoding)
                : '';
        } catch (error: any) {
            throw new HttpException(
                {
                    statusCode:
                        error.$metadata?.httpStatusCode ??
                        HttpStatus.BAD_REQUEST,
                    message: 'error',
                    data: error,
                },
                HttpStatus.BAD_REQUEST,
            );
        }
    }

    async getUploadSignedUrl(params: IGetSignedUrlRequest) {
        try {
            const { Expires, ...commandParams } = params;
            const signedUrl = await getSignedUrl(
                this._s3Presign,
                new PutObjectCommand({
                    ...commandParams,
                    ACL: 'public-read',
                }),
                { expiresIn: Expires ?? 900 },
            );
            Logger.log(`signed url generated successfully: ${signedUrl}`);
            return signedUrl;
        } catch (err: any) {
            Logger.error(
                err.message,
                `unable to generate the signed url: ${JSON.stringify(err)}`,
            );
            throw new HttpException(err.message, HttpStatus.BAD_REQUEST);
        }
    }

    async copyObject(params: CopyObjectCommandInput) {
        try {
            const data = await this._s3.send(new CopyObjectCommand(params));
            Logger.log(JSON.stringify(data));
            return data;
        } catch (err: any) {
            Logger.error(
                err.message,
                `unable to copy object: ${JSON.stringify(err)}`,
            );
            throw new HttpException(err.message, HttpStatus.BAD_REQUEST);
        }
    }

    async deleteObject(params: DeleteObjectCommandInput) {
        try {
            return await this._s3.send(new DeleteObjectCommand(params));
        } catch (err: any) {
            Logger.error(
                err.message,
                `unable to delete object: ${JSON.stringify(err)}`,
            );
            throw new HttpException(err.message, HttpStatus.BAD_REQUEST);
        }
    }

    async listObjects(params: ListObjectsCommandInput) {
        try {
            return await this._s3.send(new ListObjectsCommand(params));
        } catch (err: any) {
            Logger.error(err.message, `unable to  ${JSON.stringify(err)}`);
            throw new HttpException(err.message, HttpStatus.BAD_REQUEST);
        }
    }

    async checkExistenceFileFromBucket(params: HeadObjectCommandInput) {
        try {
            // Check if the object exists
            await this._s3.send(new HeadObjectCommand(params));

            return true;
        } catch (err: any) {
            // Log the error and throw an exception
            console.error('Error checking object existence:', err.message);
            Logger.error(err.message, `Unable to ${JSON.stringify(err)}`);
            return false;
        }
    }
}
