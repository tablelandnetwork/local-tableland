/// <reference types="node" />
import { EventEmitter } from "node:events";
import { ChildProcess } from "node:child_process";
export declare type ConfigDescriptor = {
    name: string;
    env: "VALIDATOR_DIR" | "REGISTRY_DIR" | "VERBOSE" | "SILENT";
    file: "validatorDir" | "registryDir" | "verbose" | "silent";
    arg: "validator" | "registry" | "verbose" | "silent";
    isPath: boolean;
};
export declare type Config = {
    validator?: string;
    validatorDir?: string;
    registry?: string;
    registryDir?: string;
    verbose?: boolean;
    silent?: boolean;
};
export declare const buildConfig: (config: Config) => {
    [x: string]: string | boolean | undefined;
};
export declare const getConfigFile: () => Promise<any>;
export interface PipeOptions {
    message?: string;
    fails?: {
        message: string;
        hint: string;
    };
    verbose?: boolean;
    silent?: boolean;
    emitter?: EventEmitter;
    readyEvent?: string;
}
export declare const pipeNamedSubprocess: (prefix: string, prcss: ChildProcess, options?: PipeOptions) => Promise<void>;
export declare const waitForReady: (readyEvent: string, emitter: EventEmitter) => Promise<void>;
