import { SNSClientConfig } from '@aws-sdk/client-sns';
import { ModuleMetadata } from '@nestjs/common';

/**
 *  @export
 * @interface ISNSModuleAsyncOptions
 * @extends {Pick<ModuleMetadata, 'imports'>}
 */
export interface ISNSModuleAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
    useFactory: (...args: any[]) => Promise<SNSClientConfig> | SNSClientConfig;
    inject?: any[];
}
