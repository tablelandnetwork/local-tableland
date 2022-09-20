/**
 *  Run end to end Tableland
 **/
/// <reference types="node" />
import { EventEmitter } from "node:events";
export declare class LocalTableland {
    #private;
    config: any;
    initEmitter: EventEmitter;
    validatorDir?: string;
    registryDir?: string;
    verbose?: boolean;
    silent?: boolean;
    constructor(config: any);
    start(argv?: any): Promise<void>;
    shutdown(noExit?: boolean): void;
}
