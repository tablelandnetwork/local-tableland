/**
 *  Run end to end Tableland
 **/
/// <reference types="node" />
/// <reference types="node" />
import { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
export declare class LocalTableland {
    #private;
    config: any;
    initEmitter: EventEmitter;
    registry?: ChildProcess;
    validator?: ChildProcess;
    validatorDir?: string;
    registryDir?: string;
    verbose?: boolean;
    silent?: boolean;
    constructor(config: any);
    start(argv?: any): Promise<void>;
    shutdown(noExit?: boolean): Promise<void>;
    shutdownRegistry(): Promise<void>;
    shutdownValidator(): Promise<void>;
}
