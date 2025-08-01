"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    Object.defineProperty(o, k2, { enumerable: true, get: function() { return m[k]; } });
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateDiamondAbi = exports.CONTRACT_PATH = exports.PLUGIN_VERSION = exports.PLUGIN_NAME = void 0;
const path = __importStar(require("path"));
const crypto_1 = require("crypto");
const debug_1 = __importDefault(require("debug"));
const ethers_1 = require("ethers");
const task_names_1 = require("hardhat/builtin-tasks/task-names");
const config_1 = require("hardhat/config");
const plugins_1 = require("hardhat/plugins");
// TODO: Avoid Hardhat internals
const compilation_job_1 = require("hardhat/internal/solidity/compilation-job");
// TODO: Avoid Hardhat internals
const resolver_1 = require("hardhat/internal/solidity/resolver");
const pkg = __importStar(require("../package.json"));
exports.PLUGIN_NAME = pkg.name;
exports.PLUGIN_VERSION = pkg.version;
// An empty contract file is provided in the plugin otherwise Hardhat will eject us from the cache
exports.CONTRACT_PATH = path.join(__dirname, "contract.sol");
const CONTRACT_NAME = "HardhatDiamondABI.sol";
const log = debug_1.default(exports.PLUGIN_NAME);
function createArtifact(artifactName, abi) {
    return {
        _format: "hh-sol-artifact-1",
        contractName: artifactName,
        sourceName: `${exports.PLUGIN_NAME}/${CONTRACT_NAME}`,
        abi: abi,
        deployedBytecode: "",
        bytecode: "",
        linkReferences: {},
        deployedLinkReferences: {},
    };
}
// This is our custom CompilationJob with information about the Diamond ABI
class DiamondAbiCompilationJob extends compilation_job_1.CompilationJob {
    constructor() {
        // Dummy solidity version that can never be valid
        super({ version: "X.X.X", settings: {} });
        Object.defineProperty(this, "pluginName", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: exports.PLUGIN_NAME
        });
        Object.defineProperty(this, "pluginVersion", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: exports.PLUGIN_VERSION
        });
        Object.defineProperty(this, "_file", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: void 0
        });
        Object.defineProperty(this, "artifacts", {
            enumerable: true,
            configurable: true,
            writable: true,
            value: []
        });
        const sourceName = `${this.pluginName}/${CONTRACT_NAME}`;
        const absolutePath = exports.CONTRACT_PATH;
        const content = { rawContent: "", imports: [], versionPragmas: [] };
        // Dummy a content hash with the plugin name & version
        const contentHash = crypto_1.createHash("md5").update(`${this.pluginName}_${this.pluginVersion}`).digest("hex");
        const lastModificationDate = new Date();
        this._file = new resolver_1.ResolvedFile(sourceName, absolutePath, content, contentHash, lastModificationDate, this.pluginName, this.pluginVersion);
    }
    emitsArtifacts() {
        return true;
    }
    hasSolc9573Bug() {
        return false;
    }
    getResolvedFiles() {
        return [this._file];
    }
    getFile() {
        return this._file;
    }
    addArtifact(artifact) {
        this.artifacts.push(artifact);
    }
    getArtifactsEmitted() {
        return this.artifacts.map((artifact) => artifact.contractName);
    }
}
config_1.extendConfig((config, userConfig) => {
    config.diamondAbi = [userConfig.diamondAbi].flat().map(function (userConfig) {
        const { name, include = [], exclude = [], filter, strict = true } = userConfig ?? {};
        if (!name) {
            throw new plugins_1.HardhatPluginError(exports.PLUGIN_NAME, "`name` config is required.");
        }
        if (typeof name !== "string") {
            throw new plugins_1.HardhatPluginError(exports.PLUGIN_NAME, "`name` config must be a string.");
        }
        if (include && !Array.isArray(include)) {
            throw new plugins_1.HardhatPluginError(exports.PLUGIN_NAME, "`include` config must be an array if provided.");
        }
        if (exclude && !Array.isArray(exclude)) {
            throw new plugins_1.HardhatPluginError(exports.PLUGIN_NAME, "`exclude` config must be an array if provided.");
        }
        if (filter && typeof filter !== "function") {
            throw new plugins_1.HardhatPluginError(exports.PLUGIN_NAME, "`filter` config must be a function if provided.");
        }
        if (typeof strict !== "boolean") {
            throw new plugins_1.HardhatPluginError(exports.PLUGIN_NAME, "`strict` config must be a boolean if provided.");
        }
        return {
            name,
            include,
            exclude,
            filter,
            strict,
        };
    });
});
// We ONLY hook this task, instead of providing a separate task to run, because
// Hardhat will clear out old artifacts on next run if we don't work around their
// caching mechanisms.
config_1.subtask(task_names_1.TASK_COMPILE_SOLIDITY_COMPILE_JOBS).setAction(generateDiamondAbi);
async function generateDiamondAbi(args, hre, runSuper) {
    const out = await runSuper(args);
    if (out.artifactsEmittedPerJob.length === 0) {
        return out;
    }
    const compilationJob = new DiamondAbiCompilationJob();
    const contracts = await hre.artifacts.getAllFullyQualifiedNames();
    for (const config of hre.config.diamondAbi) {
        const mergedAbis = [];
        for (const contractName of contracts) {
            // We can't accept a RegExp until https://github.com/nomiclabs/hardhat/issues/2181
            if (config.include && config.include.length && !config.include.some((m) => contractName.match(m))) {
                log(`Skipping ${contractName} because it didn't match any \`include\` patterns.`);
                continue;
            }
            // We can't accept a RegExp until https://github.com/nomiclabs/hardhat/issues/2181
            if (config.exclude && config.exclude.length && config.exclude.some((m) => contractName.match(m))) {
                log(`Skipping ${contractName} because it did matched an \`exclude\` pattern.`);
                continue;
            }
            // this should be the output filename, but this will work too
            if (contractName.startsWith(exports.PLUGIN_NAME)) {
                log(`Skipping ${contractName} because it is the stub ABI produced by ${exports.PLUGIN_NAME}.`);
                continue;
            }
            // debug(including contractName in Name ABI)
            log(`Including ${contractName} in your ${config.name} ABI.`);
            const { abi } = await hre.artifacts.readArtifact(contractName);
            mergedAbis.push(...abi.filter((abiElement, index, abi) => {
                if (abiElement.type === "constructor") {
                    return false;
                }
                if (abiElement.type === "fallback") {
                    return false;
                }
                if (abiElement.type === "receive") {
                    return false;
                }
                if (typeof config.filter === "function") {
                    return config.filter(abiElement, index, abi, contractName);
                }
                return true;
            }));
        }
        if (config.strict) {
            // Validate the ABI if `strict` option is `true`
            // Consumers may opt to validate their Diamond doesn't contain duplicate
            // functions before a deployment. There isn't a great way to determine
            // this before a deployment, but `diamondCut` will fail if you try to cut
            // multiple functions (thus failing a deploy).
            const diamondAbiSet = new Set();
            mergedAbis.forEach((abi) => {
                const sighash = ethers_1.Fragment.from(abi).format("sighash");
                if (diamondAbiSet.has(sighash)) {
                    throw new plugins_1.HardhatPluginError(exports.PLUGIN_NAME, `Failed to create ${config.name} ABI - \`${sighash}\` appears twice.`);
                }
                diamondAbiSet.add(sighash);
            });
        }
        const artifact = createArtifact(config.name, mergedAbis);
        // Save into the Hardhat cache so artifact utilities can load it
        await hre.artifacts.saveArtifactAndDebugFile(artifact);
        compilationJob.addArtifact(artifact);
    }
    const file = compilationJob.getFile();
    const artifactsEmitted = compilationJob.getArtifactsEmitted();
    return {
        artifactsEmittedPerJob: [
            ...out.artifactsEmittedPerJob,
            // Add as another job to the list
            {
                compilationJob,
                artifactsEmittedPerFile: [
                    {
                        file,
                        artifactsEmitted,
                    },
                ],
            },
        ],
    };
}
exports.generateDiamondAbi = generateDiamondAbi;
