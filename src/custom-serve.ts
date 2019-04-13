import {
    normalize,
    resolve,
    Path,
} from '@angular-devkit/core';
import {
    Builder,
    BuilderConfiguration,
    BuilderContext,
    BuilderDescription,
    BuildEvent
} from '@angular-devkit/architect';
import { Observable, of } from 'rxjs';
import { concatMap, tap, catchError } from 'rxjs/operators';

const { Stubby } = require('stubby');

export interface CustomServeBuilderOptions {
    devServerTarget: string;
    stubsConfigFile: string;
    watch?: boolean;
    stubs?: number;
    admin?: number;
    tls?: number;
    location?: string;
    key?: string;
    cert?: string;
    pfx?: string;
    _httpsOptions?: object;
}

export class CustomServeBuilder implements Builder<CustomServeBuilderOptions> {
    constructor(public context: BuilderContext) {}
    run(
        builderConfig: BuilderConfiguration<CustomServeBuilderOptions>
    ): Observable<BuildEvent> {
        const options = {
            ...builderConfig.options,
            project: builderConfig.root
        };
        return of(null)
            .pipe(
                concatMap(() => this.runStubs(options)),
                concatMap(() => this.startServer(options)),
                catchError((error) => {
                    this.context.logger.error(`
                        ++++++++++++++++++++++++++++++++++++
                            Error trying to load stubby
                        ++++++++++++++++++++++++++++++++++++
                        ${error}
                        ++++++++++++++++++++++++++++++++++++
                    `);
                    return of({ success: false });
                })
            );
    }

    private replacePathForWindows(path: string) {
        return path.replace(/^\/C\//, '/c/');
    }

    private normalizeResponseFilePaths(data: any[], rootPath: Path) {
        return data.map(({ request, response }) => {
            if(response.file) {
                return {
                    request,
                    response: {
                        ...response,
                        file: resolve(
                            rootPath,
                            normalize(this.replacePathForWindows(response.file))
                        )
                    }
                };
            }
            return { request, data };
        });
    }
    private runStubs(options: CustomServeBuilderOptions): Observable<BuildEvent> {
        const root = normalize(this.context.workspace.root);

        return Observable.create((observer: any) => {
            if (options.stubsConfigFile) {
                const stubsConfigFullPath = resolve(
                    root, 
                    normalize(options.stubsConfigFile)
                );
                const data = require(this.replacePathForWindows(stubsConfigFullPath));
                const stubsServer = new Stubby();

                stubsServer.start({
                    ...options,
                    quiet: false,
                    watch: stubsConfigFullPath,
                    location: 'localhost',
                    data: this.normalizeResponseFilePaths(data, root),
                }, () => {
                    this.context.logger.info('Stubby Server Running ...');
                    observer.next({ success: true })
                });
            } else {
                throw new Error('Please provide "stubsConfigFile" option on angular.json file for architecture "development"');
            }
        });
    }

    private startServer(options: CustomServeBuilderOptions) {
        const architect = this.context.architect;
        const [
            project,
            targetName,
            configuration
        ] = (options.devServerTarget as string).split(':');
        const overrides = { watch: true };
        const targetSpec = {
            project,
            target: targetName,
            configuration,
            overrides
        };
        const builderConfig = architect.getBuilderConfiguration<any>(targetSpec);
        let devServerDescription: BuilderDescription;

        return architect.getBuilderDescription(builderConfig).pipe(
            tap(
                description => (devServerDescription = description as BuilderDescription)
            ),
            concatMap(description =>
                architect.validateBuilderOptions(builderConfig, description)
            ),
            concatMap(() => {
                return of(
                    this.context.architect.getBuilder(devServerDescription, this.context)
                );
            }),
            concatMap(builder => builder.run(builderConfig))
          );
    }
}

export default CustomServeBuilder;
