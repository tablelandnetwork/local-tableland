import { EventEmitter } from "node:events";
export declare const confGetter: (confName: string) => Promise<() => any>;
export declare const pipeNamedSubprocess: (prefix: string, prcss: any, options?: any) => Promise<void>;
export declare const waitForReady: (readyEvent: string, emitter: EventEmitter) => Promise<void>;
