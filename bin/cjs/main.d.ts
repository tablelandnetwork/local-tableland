/**
 *  Run end to end Tableland
 **/
/// <reference types="node" />
/// <reference types="node" />
import { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { Config, getAccounts } from "./util.js";
declare class LocalTableland {
    #private;
    config: Config;
    initEmitter: EventEmitter;
    registry?: ChildProcess;
    validator?: ChildProcess;
    validatorDir?: string;
    registryDir?: string;
    verbose?: boolean;
    silent?: boolean;
    constructor(configParams?: Config);
    start(): Promise<void>;
    shutdown(): Promise<void>;
    shutdownRegistry(): Promise<void>;
    shutdownValidator(): Promise<void>;
}
export { LocalTableland, getAccounts };
