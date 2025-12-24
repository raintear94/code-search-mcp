/**
 * view_files_full_context 通用版 (上帝视角/全景探针) - v1.4.4
 * 聚焦输出 LOCAL_IMPORTS / MODEL_FIELDS / DEPENDENCY_OUTLINES / SOURCE_CODE
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { pathExists, isFile, getExtension } from "../utils/fileSystem.js";
import { parseOutline } from "./viewFileOutline.js";

/**
 * 本地引用解析结果。
 */
interface ResolvedImportInfo {
    className: string;
    resolvedPath: string;
}

/**
 * Java 字段定义信息。
 */
interface JavaFieldInfo {
    name: string;
    type: string;
    comment: string;
}
/**
 * 注册核心全景工具
 */
export function registerViewFilesFullContext(server: McpServer): void {
    server.tool(
        "view_files_full_context",
        "Code analysis tool with 'Panoramic Vision'. Optimized for Java/Spring to provide a bird's-eye view across multiple files. \n" +
        "Key Effects: \n" +
        "1. [Dependency Transparency]: Automatically lists injected components (Service/Mapper/MQ) and resolves local imports to absolute paths.\n" +
        "2. [Model Auto-Expansion]: For any DTO/Entity/VO imported in the current file, it automatically extracts their fields and comments. You don't need to open those files separately to understand the data structure.\n" +
        "3. [Logic Flow Alignment]: Auto-sorts files by architectural role (Controller -> Service -> Mapper) to follow the business call chain.\n" +
        "4. [API Outline]: Provides method outlines for dependencies to understand their interface at a glance.\n" +
        "Tips: (1) Batch related files (e.g. Controller+ServiceImpl) in one call. (2) NOT recommended to read DTO/VO/Entity/Query individually as they are auto-expanded when reading their consumers.",
        {
            AbsolutePaths: z.array(z.string()).describe("Absolute paths of files to analyze."),
            StartLine: z.number().optional().default(1),
            EndLine: z.number().optional(),
        } as any,
        async (input: any) => {
            const { AbsolutePaths, StartLine, EndLine } = input;

            if (!AbsolutePaths?.length) {
                return { content: [{ type: "text", text: "Error: No paths provided." }] } as any;
            }

            // 1. 角色权重排序 (通用 Java/Spring 命名规范)
            const roleWeight = (p: string) => {
                const lp = p.toLowerCase();
                if (lp.includes("controller") || lp.includes("api")) return 1;
                if (lp.includes("service") && !lp.includes("impl")) return 2;
                if (lp.includes("impl")) return 3;
                if (lp.includes("mq") || lp.includes("listener") || lp.includes("consumer") || lp.includes("producer")) return 4;
                if (lp.includes("mapper") || lp.includes("repository") || lp.includes("dao")) return 5;
                if (lp.includes("dto") || lp.includes("vo") || lp.includes("entity") || lp.includes("model")) return 6;
                return 10;
            };

            const sortedPaths = [...AbsolutePaths].sort((a, b) => roleWeight(a) - roleWeight(b));

            const results = await Promise.all(sortedPaths.map(async (AbsolutePath) => {
                // 2. 移除硬编码，改用通用寻找根目录逻辑
                if (!pathExists(AbsolutePath) || !isFile(AbsolutePath)) {
                    const suggestion = await findSimiliarFileGeneric(AbsolutePath);
                    return `--- [MISSING] ${AbsolutePath} ---\n${suggestion}`;
                }

                try {
                    const fullContent = fs.readFileSync(AbsolutePath, "utf-8");
                    const ext = getExtension(AbsolutePath);
                    const lines = fullContent.split("\n");

                    const effectiveStart = Math.max(1, StartLine || 1);
                    const effectiveEnd = EndLine || Math.min(lines.length, effectiveStart + 499);
                    const slicedContent = lines.slice(effectiveStart - 1, effectiveEnd).join("\n");

                    let output = `[FILE_PATH]: ${AbsolutePath}\n`;
                    output += `[PAGINATION]: Lines ${effectiveStart}-${effectiveEnd} (Total ${lines.length})\n`;

                    if (ext === "java") {
                        // 依赖注入增强：列出注入的字段 (Service/Mapper/MQ/Redis)
                        output += `\n[DEPENDENCY_INJECTIONS]: (Injected Components)\n`;
                        const fieldMatches = fullContent.matchAll(/private\s+(?:final\s+)?([A-Z][a-zA-Z0-9_<>,\s?]+)\s+([a-zA-Z0-9]+)\s*;/g);
                        let hasInjections = false;
                        for (const match of fieldMatches) {
                            const type = match[1].trim();
                            const name = match[2];
                            // 过滤明显的基础类型，仅保留可能的依赖注入对象
                            if (!isLikelyInjectedType(type)) continue;
                            output += `  - [INJECT] ${type} ${name}\n`;
                            hasInjections = true;
                        }
                        if (!hasInjections) output += `  (No significant injections detected)\n`;


                        // 通用包前缀提取
                        const packageMatch = fullContent.match(/package\s+([^;]+)/);
                        if (packageMatch) {
                            const fullPackage = packageMatch[1].trim();
                            // 提取前两段作为项目标识 (如 com.example)
                            const segments = fullPackage.split('.');
                            const projectPrefix = segments.slice(0, Math.min(segments.length, 2)).join('.');

                            const importRegex = /import\s+([^;]+);/g;
                            const imports = fullContent.match(importRegex);
                            if (imports) {
                                // 仅保留可解析的项目内引入，用于定位应跳转阅读的代码
                                const resolvedImports: ResolvedImportInfo[] = [];
                                const seenImport = new Set<string>();
                                const projectImportCount = new Map<string, number>();
                                for (const imp of imports) {
                                    const className = imp.replace(/import\s+|;/g, "").trim();
                                    if (!className.startsWith(projectPrefix + ".")) {
                                        continue;
                                    }
                                    if (className.includes(".annotation.")) continue;
                                    if (seenImport.has(className)) continue;
                                    const resolved = resolveJavaPathGeneric(AbsolutePath, className);
                                    if (resolved && pathExists(resolved)) {
                                        resolvedImports.push({ className, resolvedPath: resolved });
                                        seenImport.add(className);
                                    }
                                    const simpleName = className.split(".").pop() || "";
                                    if (simpleName) {
                                        projectImportCount.set(simpleName, (projectImportCount.get(simpleName) || 0) + 1);
                                    }
                                }
                                if (resolvedImports.length > 0) {
                                    output += `\n[LOCAL_IMPORTS]: (Resolved Project Imports)\n`;
                                    resolvedImports.slice(0, 20).forEach(item => {
                                        output += `  - ${item.className.split('.').pop()} => ${item.resolvedPath}\n`;
                                    });
                                }

                                // 针对同名类的未解析项目内 import，尝试在工程内兜底查找
                                const unresolvedCandidates: string[] = [];
                                for (const [simpleName, count] of projectImportCount.entries()) {
                                    if (count <= 1) {
                                        const alreadyResolved = resolvedImports.some(item => item.className.endsWith("." + simpleName));
                                        if (!alreadyResolved) {
                                            unresolvedCandidates.push(simpleName);
                                        }
                                    }
                                }
                                if (unresolvedCandidates.length > 0) {
                                    const fallbackResolved = resolveBySimpleNames(AbsolutePath, unresolvedCandidates);
                                    fallbackResolved.forEach(item => {
                                        if (!seenImport.has(item.className)) {
                                            resolvedImports.push(item);
                                            seenImport.add(item.className);
                                        }
                                    });
                                    if (fallbackResolved.length > 0) {
                                        output += `\n[LOCAL_IMPORTS]: (Resolved Project Imports - Fallback)\n`;
                                        fallbackResolved.slice(0, 20).forEach(item => {
                                            output += `  - ${item.className.split('.').pop()} => ${item.resolvedPath}\n`;
                                        });
                                    }
                                }

                                const modelImports = resolvedImports.filter(item => {
                                    const simpleName = item.className.split('.').pop() || "";
                                    return isModelLikeClass(simpleName, item.resolvedPath);
                                });
                                const otherImports = resolvedImports.filter(item => !modelImports.includes(item));

                                if (modelImports.length > 0) {
                                    output += `\n[MODEL_FIELDS]: (DTO/VO/Entity Fields)\n`;
                                    modelImports.slice(0, 15).forEach(item => {
                                        const simpleName = item.className.split('.').pop() || "";
                                        const content = fs.readFileSync(item.resolvedPath, "utf-8");
                                        const fields = extractJavaFieldDetails(content);
                                        output += `>> ${simpleName} => ${item.resolvedPath}\n`;
                                        if (fields.length === 0) {
                                            output += `   - (No fields detected)\n`;
                                            return;
                                        }
                                        fields.forEach(field => {
                                            const comment = field.comment ? field.comment : "无注释";
                                            output += `   - ${field.name} | ${field.type} | ${comment}\n`;
                                        });
                                    });
                                }

                                if (otherImports.length > 0) {
                                    output += `\n[DEPENDENCY_OUTLINES]: (Other Class Outlines)\n`;
                                    let depCount = 0;
                                    for (const item of otherImports) {
                                        if (depCount >= 12) break;
                                        const depOutline = parseOutline(fs.readFileSync(item.resolvedPath, "utf-8"), "java");
                                        output += `>> ${item.className.split('.').pop()}:\n`;
                                        depOutline.forEach(item => {
                                            // 仅保留非字段、非噪音的方法
                                            if (item.type !== 'field') {
                                                output += `   - ${item.name}@L${item.startLine}${item.endLine ? '-' + item.endLine : ''}\n`;
                                            }
                                        });
                                        depCount++;
                                    }
                                }
                            }
                        }
                    }

                    output += `\n[SOURCE_CODE]:\n${slicedContent}`;
                    return output;
                } catch (e) {
                    return `--- [ERROR] Reading ${AbsolutePath} ---`;
                }
            }));

            return {
                content: [{ type: "text", text: results.join("\n\n" + "#".repeat(70) + "\n\n") }],
            } as any;
        }
    );
}

/**
 * 判断字段类型是否可能为依赖注入对象。
 *
 * @param rawType 字段类型字符串
 * @returns 是否可能为注入对象
 */
function isLikelyInjectedType(rawType: string): boolean {
    const type = rawType.replace(/\s+/g, " ");
    const baseType = type.replace(/<.*>/g, "").trim();
    const baseIgnore = [
        "String",
        "Integer",
        "Long",
        "BigDecimal",
        "Date",
        "LocalDate",
        "LocalDateTime",
        "LocalTime",
        "Duration",
        "Boolean",
        "boolean",
        "int",
        "long",
        "double",
        "float",
        "BigInteger",
        "BigDecimal",
    ];
    if (baseIgnore.includes(baseType)) {
        return false;
    }
    if (["List", "Map", "Set"].includes(baseType)) {
        const genericMatch = type.match(/<([^>]+)>/);
        if (!genericMatch) {
            return false;
        }
        const genericTypes = genericMatch[1].split(",").map(item => item.trim());
        return genericTypes.some(item => isLikelyInjectedType(item));
    }
    return true;
}

/**
 * 判断是否为 VO/DTO/实体等模型类。
 *
 * @param simpleName 类名
 * @param resolvedPath 解析到的文件路径
 */
function isModelLikeClass(simpleName: string, resolvedPath: string): boolean {
    const lowerName = simpleName.toLowerCase();
    const lowerPath = resolvedPath.replace(/\\/g, "/").toLowerCase();
    if (lowerPath.includes("/dto/")
        || lowerPath.includes("/vo/")
        || lowerPath.includes("/entity/")
        || lowerPath.includes("/model/")
        || lowerPath.includes("/po/")
        || lowerPath.includes("/bo/")
        || lowerPath.includes("/query/")
        || lowerPath.includes("/request/")
        || lowerPath.includes("/response/")
        || lowerPath.includes("/enums/")
        || lowerPath.includes("/enum/")) {
        return true;
    }
    const suffixes = [
        "dto",
        "vo",
        "entity",
        "model",
        "po",
        "bo",
        "query",
        "request",
        "response",
        "enum",
    ];
    return suffixes.some(suffix => lowerName.endsWith(suffix));
}

/**
 * 提取 Java 字段定义（名称、类型、注释）。
 *
 * @param content Java 文件内容
 */
function extractJavaFieldDetails(content: string): JavaFieldInfo[] {
    const lines = content.split("\n");
    const results: JavaFieldInfo[] = [];
    let pendingComment = "";

    /**
     * 提取并清空缓存注释。
     */
    const flushComment = () => {
        const value = pendingComment.trim();
        pendingComment = "";
        return value;
    };

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimLine = line.trim();

        if (trimLine.startsWith("/**")) {
            const buffer: string[] = [];
            buffer.push(trimLine.replace("/**", "").trim());
            let j = i + 1;
            while (j < lines.length) {
                const blockLine = lines[j].trim();
                if (blockLine.includes("*/")) {
                    buffer.push(blockLine.replace("*/", "").replace("*", "").trim());
                    break;
                }
                buffer.push(blockLine.replace("*", "").trim());
                j++;
            }
            pendingComment = buffer.filter(Boolean).join(" ");
            i = j;
            continue;
        }

        if (trimLine.startsWith("//")) {
            pendingComment = trimLine.replace("//", "").trim();
            continue;
        }

        if (trimLine.startsWith("@")) {
            continue;
        }

        if (trimLine.includes("(")) {
            pendingComment = "";
            continue;
        }

        const fieldMatch = trimLine.match(/^(?:public|protected|private)?\s*(?:static\s+)?(?:final\s+)?([\w<>,\s\[\]?]+)\s+([a-zA-Z0-9_$]+)\s*(?:=.*)?;/);
        if (fieldMatch) {
            const type = fieldMatch[1].trim();
            const name = fieldMatch[2].trim();
            results.push({
                name,
                type,
                comment: flushComment(),
            });
        }
    }

    return results;
}

/**
 * 通过类名在工程内兜底解析路径（避免多模块未命中）。
 *
 * @param currentPath 当前文件路径
 * @param simpleNames 类名列表
 */
function resolveBySimpleNames(currentPath: string, simpleNames: string[]): ResolvedImportInfo[] {
    const root = findProjectRoot(currentPath);
    if (!root || simpleNames.length === 0) {
        return [];
    }
    const nameSet = new Set(simpleNames);
    const results: ResolvedImportInfo[] = [];
    const seen = new Set<string>();

    const walk = (dir: string) => {
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (entry.name === "node_modules" || entry.name === ".git" || entry.name.startsWith(".")) {
                    continue;
                }
                walk(path.join(dir, entry.name));
                continue;
            }
            if (!entry.name.endsWith(".java")) {
                continue;
            }
            const className = entry.name.replace(/\.java$/, "");
            if (!nameSet.has(className)) {
                continue;
            }
            const fullPath = path.join(dir, entry.name);
            const packageName = extractPackageName(fullPath);
            if (!packageName) {
                continue;
            }
            const fqcn = `${packageName}.${className}`;
            if (seen.has(fqcn)) {
                continue;
            }
            results.push({
                className: fqcn,
                resolvedPath: fullPath,
            });
            seen.add(fqcn);
        }
    };

    walk(root);
    return results;
}

/**
 * 解析 Java 文件的包名。
 *
 * @param filePath 文件路径
 */
function extractPackageName(filePath: string): string | null {
    try {
        const content = fs.readFileSync(filePath, "utf-8");
        const match = content.match(/package\s+([^;]+);/);
        return match ? match[1].trim() : null;
    } catch (e) {
        return null;
    }
}

/**
 * 寻找根目录：向上查找包含 src 的最近文件夹
 */
function findProjectRoot(startPath: string): string | null {
    let current = path.dirname(startPath);
    let lastSrcRoot: string | null = null;
    let lastMultiModuleRoot: string | null = null;
    const topPomRoot = findTopPomRoot(startPath);

    while (current !== path.parse(current).root) {
        const srcPath = path.join(current, "src");
        const pomPath = path.join(current, "pom.xml");
        if (fs.existsSync(srcPath)) {
            lastSrcRoot = current;
        }
        // 识别多模块工程根目录：存在 pom.xml 且包含多个 src/main/java 子模块
        if (fs.existsSync(pomPath) && hasModuleJavaRoots(current)) {
            lastMultiModuleRoot = current;
        }
        current = path.dirname(current);
    }

    // 优先返回最高层级的多模块根目录
    if (topPomRoot && lastMultiModuleRoot) {
        return lastMultiModuleRoot;
    }
    if (lastMultiModuleRoot) {
        return lastMultiModuleRoot;
    }
    // 回退到最近的 src 根目录
    return lastSrcRoot;
}

/**
 * 查找包含 pom.xml 的最高层目录。
 *
 * @param startPath 起始路径
 */
function findTopPomRoot(startPath: string): string | null {
    let current = path.dirname(startPath);
    let lastPomRoot: string | null = null;
    while (current !== path.parse(current).root) {
        const pomPath = path.join(current, "pom.xml");
        if (fs.existsSync(pomPath)) {
            lastPomRoot = current;
        }
        current = path.dirname(current);
    }
    return lastPomRoot;
}

/**
 * 判断目录下是否存在多个 Java 模块目录。
 *
 * @param root 根目录
 */
function hasModuleJavaRoots(root: string): boolean {
    try {
        const entries = fs.readdirSync(root, { withFileTypes: true });
        let count = 0;
        for (const entry of entries) {
            if (!entry.isDirectory()) {
                continue;
            }
            const javaRoot = path.join(root, entry.name, "src/main/java");
            if (fs.existsSync(javaRoot)) {
                count++;
                if (count >= 2) {
                    return true;
                }
            }
        }
    } catch (e) {
        return false;
    }
    return false;
}

/**
 * 通用路径解析：搜索所有 src/main/java 目录
 */
function resolveJavaPathGeneric(currentPath: string, fullClassName: string): string | null {
    const root = findProjectRoot(currentPath);
    if (!root) return null;

    const pathPart = fullClassName.replace(/\./g, "/");
    const directJavaRoot = path.join(root, "src/main/java");
    if (fs.existsSync(directJavaRoot)) {
        const directTarget = path.join(directJavaRoot, `${pathPart}.java`);
        if (fs.existsSync(directTarget)) {
            return directTarget;
        }
    }

    const findInDir = (dir: string): string | null => {
        try {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const fullPath = path.join(dir, entry.name);
                    const javaRoot = path.join(fullPath, "src/main/java");
                    if (fs.existsSync(javaRoot)) {
                        const target = path.join(javaRoot, `${pathPart}.java`);
                        if (fs.existsSync(target)) return target;
                    } else if (entry.name !== "node_modules" && entry.name !== ".git" && !entry.name.startsWith(".")) {
                        const found = findInDir(fullPath);
                        if (found) return found;
                    }
                }
            }
        } catch (e) { return null; }
        return null;
    };

    return findInDir(root);
}

/**
 * 通用相似文件建议
 */
async function findSimiliarFileGeneric(attemptedPath: string): Promise<string> {
    const root = findProjectRoot(attemptedPath);
    if (!root) return "Suggestion: Check the file path accuracy.";

    try {
        const entries = fs.readdirSync(root, { withFileTypes: true });
        const modules = entries.filter(e => e.isDirectory() && fs.existsSync(path.join(root, e.name, "src"))).map(e => e.name);
        return `Suggestion: The file might belong to another module. Modules found at root: ${modules.join(", ")}`;
    } catch {
        return "Suggestion: Verify the absolute path.";
    }
}
