"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTSConfigRootDirFromStack = getTSConfigRootDirFromStack;
const node_path_1 = __importDefault(require("node:path"));
/**
 * Infers the `tsconfigRootDir` from the current call stack, using the V8 API.
 *
 * See https://v8.dev/docs/stack-trace-api
 *
 * This API is implemented in Deno and Bun as well.
 */
function getTSConfigRootDirFromStack() {
    function getStack() {
        const stackTraceLimit = Error.stackTraceLimit;
        Error.stackTraceLimit = Infinity;
        const prepareStackTrace = Error.prepareStackTrace;
        Error.prepareStackTrace = (_, structuredStackTrace) => structuredStackTrace;
        const dummyObject = {};
        Error.captureStackTrace(dummyObject, getTSConfigRootDirFromStack);
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- stack is set by captureStackTrace
        const rv = dummyObject.stack;
        Error.prepareStackTrace = prepareStackTrace;
        Error.stackTraceLimit = stackTraceLimit;
        return rv;
    }
    for (const callSite of getStack()) {
        const stackFrameFilePath = callSite.getFileName();
        if (!stackFrameFilePath) {
            continue;
        }
        const parsedPath = node_path_1.default.parse(stackFrameFilePath);
        if (/^eslint\.config\.(c|m)?(j|t)s$/.test(parsedPath.base)) {
            return parsedPath.dir;
        }
    }
    return undefined;
}
