import { AwsModule } from './aws.module';
import { GeneratorService } from './service/generator.service';

describe('AwsModule', () => {
    it('forRootS3Async returns a dynamic module exporting AwsS3Service + GeneratorService', () => {
        const mod = AwsModule.forRootS3Async({
            useFactory: () => ({ region: 'eu-west-1' }),
        });
        expect(mod.module).toBe(AwsModule);
        expect(mod.exports?.length).toBe(2);
    });

    it('forRootSnsAsync returns a dynamic module exporting AwsSnsService', () => {
        const mod = AwsModule.forRootSnsAsync({
            useFactory: () => ({ region: 'eu-west-1' }),
        });
        expect(mod.module).toBe(AwsModule);
        expect(mod.exports?.length).toBe(1);
    });
});

describe('GeneratorService', () => {
    it('produces a uuid (v4, via crypto.randomUUID)', () => {
        const g = new GeneratorService();
        const id = g.uuid();
        expect(id).toMatch(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
    });

    it('fileName appends the extension', () => {
        const g = new GeneratorService();
        expect(g.fileName('png')).toMatch(/\.png$/);
    });
});
