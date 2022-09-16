import { EventEmitter } from "node:events";
export declare const configGetter: (configName: string, configFile: any, argv: any) => Promise<any>;
export declare const getConfigFile: () => Promise<any>;
export declare const pipeNamedSubprocess: (prefix: string, prcss: any, options?: any) => Promise<void>;
export declare const waitForReady: (readyEvent: string, emitter: EventEmitter) => Promise<void>;
