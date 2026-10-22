import {
    SNSClient,
    PublishCommand,
    PublishInput,
    PublishResponse,
    SNSClientConfig,
} from '@aws-sdk/client-sns';
import {
    Injectable,
    Inject,
    Logger,
    HttpStatus,
    HttpException,
} from '@nestjs/common';

import { CONFIG_CONNECTION_OPTIONS } from '../constants';

/**
 * @export
 * @class AwsSnsService
 */
@Injectable()
export class AwsSnsService {
    private readonly _sns: SNSClient;
    constructor(
        @Inject(CONFIG_CONNECTION_OPTIONS) private _options: SNSClientConfig,
    ) {
        Logger.log('initialising AWS Module', 'SNS SERVICE');
        this._sns = new SNSClient(this._options);
    }

    async sendSMS(smsOptions: PublishInput) {
        return this._sns
            .send(new PublishCommand(smsOptions))
            .then((info: PublishResponse) => {
                Logger.log(` success[sendSms]: ${JSON.stringify(info)}`);
                return [
                    {
                        statusCode: HttpStatus.OK,
                        message: 'Sms sent',
                        data: info,
                    },
                ];
            })
            .catch(err => {
                Logger.error('error[sendSms]:', err);
                throw new HttpException(
                    {
                        statusCode: HttpStatus.BAD_REQUEST,
                        message: 'Failed to send',
                        data: err,
                    },
                    HttpStatus.BAD_REQUEST,
                );
            });
    }
}
