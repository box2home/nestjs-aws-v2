import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';

/**
 * @export
 * @class GeneratorService
 */
@Injectable()
export class GeneratorService {
    public uuid(): string {
        return randomUUID();
    }

    public fileName(ext: string) {
        return this.uuid() + '.' + ext;
    }
}
