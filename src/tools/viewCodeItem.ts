/**
 * view_code_items 工具 (批量版)
 * 查看多个特定的代码项（类、方法或函数）
 *
 * 推荐使用场景：
 * 1. 已明确文件路径与目标名称，需要快速查看类/方法/函数的完整定义块。
 * 2. 想对接口与实现类进行对比，确认接口声明与实现逻辑是否一致。
 * 3. 需要在分析调用链之前，先精确抽取关键方法的实现代码片段。
 *
 * 能做到的功能：
 * 1. 按“文件路径 + 代码项名称”批量定位并返回定义块或附近片段。
 * 2. 对 Java 接口自动尝试匹配 Impl 实现类，并返回同名方法/类片段。
 * 3. 提取方法片段中的字段调用，并尝试推导字段对应类型的类路径。
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "fs";
import * as path from "path";
import { pathExists, isFile } from "../utils/fileSystem.js";

/**
 * 默认忽略的目录名称集合。
 */
const DEFAULT_IGNORE_DIRS = new Set([
    ".git",
    ".idea",
    ".vscode",
    "node_modules",
    "dist",
    "build",
    "out",
    "target",
    ".gradle",
    ".mvn",
    "logs",
    "log",
    "tmp",
    "temp",
]);

/**
 * 代码项提取结果。
 */
type SnippetResult = {
    found: boolean;
    text: string;
    startLine?: number;
    endLine?: number;
};

/**
 * 提取指定代码项的片段信息。
 * @param filePath 文件路径
 * @param itemName 代码项名称
 */
function extractSnippet(filePath: string, itemName: string): SnippetResult {
    if (!pathExists(filePath) || !isFile(filePath)) {
        return { found: false, text: `--- 文件: ${filePath} (错误: 文件不存在或无效) ---` };
    }
    try {
        const content = fs.readFileSync(filePath, "utf-8");
        const lines = content.split("\n");
        const itemIndex = lines.findIndex(line => line.includes(itemName));
        if (itemIndex === -1) {
            return { found: false, text: `--- 文件: ${filePath} (错误: 找不到代码项 '${itemName}') ---` };
        }
        const blockRange = findBlockRange(lines, itemIndex);
        if (!blockRange) {
            const start = Math.max(0, itemIndex - 10);
            const end = Math.min(lines.length, itemIndex + 60);
            const snippet = lines.slice(start, end).join("\n");
            return {
                found: true,
                text: `--- 文件: ${filePath} (第 ${start + 1} 行至第 ${end} 行, 定位: '${itemName}') ---\n\n${snippet}`,
                startLine: start + 1,
                endLine: end,
            };
        }
        const snippet = lines.slice(blockRange.start, blockRange.end + 1).join("\n");
        return {
            found: true,
            text: `--- 文件: ${filePath} (第 ${blockRange.start + 1} 行至第 ${blockRange.end + 1} 行, 定位: '${itemName}') ---\n\n${snippet}`,
            startLine: blockRange.start + 1,
            endLine: blockRange.end + 1,
        };
    } catch (error) {
        return {
            found: false,
            text: `--- 文件: ${filePath} (错误: 读取失败 - ${error instanceof Error ? error.message : String(error)}) ---`
        };
    }
}

/**
 * 根据接口文件路径推导实现类文件路径。
 * @param filePath 接口文件路径
 */
function buildImplFilePath(filePath: string): string | null {
    if (!filePath.endsWith(".java")) {
        return null;
    }
    const fileName = path.basename(filePath);
    if (!fileName.endsWith("Service.java")) {
        return null;
    }
    const implFileName = fileName.replace("Service.java", "ServiceImpl.java");
    const serviceDirToken = `${path.sep}service${path.sep}`;
    const implDirToken = `${path.sep}service${path.sep}impl${path.sep}`;
    if (filePath.includes(implDirToken)) {
        return path.join(path.dirname(filePath), implFileName);
    }
    if (filePath.includes(serviceDirToken)) {
        return filePath.replace(serviceDirToken, implDirToken).replace(fileName, implFileName);
    }
    return path.join(path.dirname(filePath), implFileName);
}

/**
 * 基于花括号匹配推导完整代码块范围。
 * @param lines 文件行列表
 * @param hitIndex 命中行索引
 */
function findBlockRange(lines: string[], hitIndex: number): { start: number; end: number } | null {
    const signatureIndex = findSignatureStart(lines, hitIndex);
    const signatureEndIndex = findSignatureEndIndex(lines, signatureIndex);
    if (signatureEndIndex !== -1) {
        return { start: signatureIndex, end: signatureEndIndex };
    }
    const openIndex = findOpenBraceIndex(lines, signatureIndex);
    if (openIndex === -1) {
        return null;
    }
    const endIndex = findMatchingBraceIndex(lines, openIndex);
    if (endIndex === -1) {
        return null;
    }
    return { start: signatureIndex, end: endIndex };
}

/**
 * 向上定位方法/类签名的起始行（包含注解与注释）。
 * @param lines 文件行列表
 * @param hitIndex 命中行索引
 */
function findSignatureStart(lines: string[], hitIndex: number): number {
    let index = hitIndex;
    while (index > 0) {
        const line = lines[index - 1];
        const trimmed = line.trim();
        if (trimmed === "") {
            index -= 1;
            continue;
        }
        if (trimmed.startsWith("@") || trimmed.startsWith("*") || trimmed.startsWith("/**") || trimmed.startsWith("*/")) {
            index -= 1;
            continue;
        }
        if (trimmed.endsWith(";") || trimmed.endsWith("}") || trimmed.startsWith("}")) {
            break;
        }
        break;
    }
    return index;
}

/**
 * 从指定行开始向下查找第一个左花括号位置。
 * @param lines 文件行列表
 * @param startIndex 起始行索引
 */
function findOpenBraceIndex(lines: string[], startIndex: number): number {
    for (let i = startIndex; i < lines.length; i += 1) {
        if (lines[i].includes("{")) {
            return i;
        }
    }
    return -1;
}

/**
 * 向下查找方法签名结束位置（接口/抽象方法的分号）。
 * @param lines 文件行列表
 * @param startIndex 起始行索引
 */
function findSignatureEndIndex(lines: string[], startIndex: number): number {
    for (let i = startIndex; i < lines.length; i += 1) {
        const line = lines[i];
        if (line.includes("{")) {
            return -1;
        }
        if (line.includes(";")) {
            return i;
        }
    }
    return -1;
}

/**
 * 从左花括号行开始进行花括号计数匹配。
 * @param lines 文件行列表
 * @param openIndex 左花括号行索引
 */
function findMatchingBraceIndex(lines: string[], openIndex: number): number {
    let depth = 0;
    for (let i = openIndex; i < lines.length; i += 1) {
        const line = lines[i];
        for (const char of line) {
            if (char === "{") {
                depth += 1;
            } else if (char === "}") {
                depth -= 1;
                if (depth === 0) {
                    return i;
                }
            }
        }
    }
    return -1;
}

/**
 * 根据文件路径推导实现类名称。
 * @param filePath 文件路径
 */
function buildImplClassName(filePath: string): string | null {
    if (!filePath.endsWith(".java")) {
        return null;
    }
    const baseName = path.basename(filePath, ".java");
    if (baseName.endsWith("Impl")) {
        return baseName;
    }
    return `${baseName}Impl`;
}

/**
 * 从类文件中提取字段与类型映射。
 * @param lines 文件行列表
 */
function extractFieldTypeMap(lines: string[]): Map<string, string> {
    const map = new Map<string, string>();
    const fieldRegex = /^\s*(private|protected|public)\s+(final\s+)?([A-Za-z_][\w<>]*)\s+([A-Za-z_][\w]*)\s*;/;
    for (const line of lines) {
        const match = line.match(fieldRegex);
        if (!match) {
            continue;
        }
        const rawType = match[3];
        const fieldName = match[4];
        const cleanType = rawType.replace(/<.*>/g, "");
        map.set(fieldName, cleanType);
    }
    return map;
}

/**
 * 从方法代码中提取调用到的字段名称。
 * @param snippet 代码片段
 */
function extractCalledFields(snippet: string): Set<string> {
    const result = new Set<string>();
    const callRegex = /\b([A-Za-z_][\w]*)\s*\./g;
    let match: RegExpExecArray | null;
    while ((match = callRegex.exec(snippet)) !== null) {
        result.add(match[1]);
    }
    return result;
}

/**
 * 生成方法调用类路径说明。
 * @param filePath 文件路径
 * @param snippetText 代码片段文本
 */
function buildCallPathSection(filePath: string, snippetText: string): string | null {
    if (!filePath.endsWith(".java")) {
        return null;
    }
    if (!pathExists(filePath) || !isFile(filePath)) {
        return null;
    }
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n");
    const fieldTypeMap = extractFieldTypeMap(lines);
    const calledFields = extractCalledFields(snippetText);
    const callEntries: string[] = [];
    calledFields.forEach(fieldName => {
        const typeName = fieldTypeMap.get(fieldName);
        if (!typeName) {
            return;
        }
        const classFiles = findClassFiles(process.cwd(), typeName);
        if (classFiles.length === 0) {
            callEntries.push(`${fieldName} -> ${typeName} -> 未找到路径`);
            return;
        }
        classFiles.forEach(classFile => {
            callEntries.push(`${fieldName} -> ${typeName} -> ${classFile}`);
        });
    });
    if (callEntries.length === 0) {
        return null;
    }
    return ["--- 方法调用类路径 ---", ...callEntries].join("\n");
}

/**
 * 全局搜索指定类名对应的 Java 文件。
 * @param rootDir 搜索根目录
 * @param className 类名
 */
function findClassFiles(rootDir: string, className: string): string[] {
    const results: string[] = [];
    const targetFileName = `${className}.java`;
    const classRegex = new RegExp(`\\b(class|interface|enum)\\s+${className}\\b`);
    const stack: string[] = [rootDir];

    while (stack.length > 0) {
        const current = stack.pop();
        if (!current) {
            continue;
        }
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch (error) {
            continue;
        }
        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (DEFAULT_IGNORE_DIRS.has(entry.name)) {
                    continue;
                }
                stack.push(path.join(current, entry.name));
                continue;
            }
            if (!entry.isFile() || entry.name !== targetFileName) {
                continue;
            }
            const filePath = path.join(current, entry.name);
            try {
                const content = fs.readFileSync(filePath, "utf-8");
                if (classRegex.test(content)) {
                    results.push(filePath);
                }
            } catch (error) {
                continue;
            }
        }
    }

    return results;
}

/**
 * 全局搜索指定实现类名对应的 Java 文件。
 * @param rootDir 搜索根目录
 * @param implClassName 实现类名称
 */
function findImplFiles(rootDir: string, implClassName: string): string[] {
    const results: string[] = [];
    const targetFileName = `${implClassName}.java`;
    const classRegex = new RegExp(`\\bclass\\s+${implClassName}\\b`);
    const stack: string[] = [rootDir];

    while (stack.length > 0) {
        const current = stack.pop();
        if (!current) {
            continue;
        }
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(current, { withFileTypes: true });
        } catch (error) {
            continue;
        }
        for (const entry of entries) {
            if (entry.isDirectory()) {
                if (DEFAULT_IGNORE_DIRS.has(entry.name)) {
                    continue;
                }
                stack.push(path.join(current, entry.name));
                continue;
            }
            if (!entry.isFile() || entry.name !== targetFileName) {
                continue;
            }
            const filePath = path.join(current, entry.name);
            try {
                const content = fs.readFileSync(filePath, "utf-8");
                if (classRegex.test(content)) {
                    results.push(filePath);
                }
            } catch (error) {
                continue;
            }
        }
    }

    return results;
}

/**
 * 注册 view_code_items 工具到 MCP 服务器
 * @param server MCP 服务器实例
 */
export function registerViewCodeItem(server: McpServer): void {
    server.tool(
        "view_code_items",
        "[Precise Code Retrieval] Best for cases where the file path and item name are known. Batch returns full definition blocks for classes/methods/functions. If the input is a Java interface and implementations exist, it will attempt to traverse to Impl classes and return same-named method snippets (multiple implementations are supported and labeled). It also parses fields referenced in the method snippet to infer their type-to-class paths. Ideal for interface/implementation comparison, fast location of key methods, and precise extraction before call-chain analysis; if the path or name is unknown, use file search tools first.",
        {
            // Batch request list
            Items: z.array(z.object({
                File: z.string().describe("Absolute path of the file"),
                ItemName: z.string().describe("Exact name of the code item to locate (e.g., class name 'UserService' or method name 'findUser')")
            })).describe("List of code items to query."),
        } as any,
        async (input: any) => {
            const { Items } = input;

            if (!Array.isArray(Items) || Items.length === 0) {
                return {
                    content: [{ type: "text", text: JSON.stringify({ error: "请提供至少一个待查询的代码项" }) }],
                } as any;
            }

            // 并发处理所有请求
            const results = await Promise.all(Items.map(async (item) => {
                const { File, ItemName } = item;

                const resultSnippets: string[] = [];
                const mainSnippet = extractSnippet(File, ItemName);
                resultSnippets.push(mainSnippet.text);
                const mainCallSection = buildCallPathSection(File, mainSnippet.text);
                if (mainCallSection) {
                    resultSnippets.push(mainCallSection);
                }

                const implCandidates = new Set<string>();
                const implFilePath = buildImplFilePath(File);
                if (implFilePath && implFilePath !== File) {
                    implCandidates.add(implFilePath);
                }
                const implClassName = buildImplClassName(File);
                if (implClassName) {
                    const implFiles = findImplFiles(process.cwd(), implClassName);
                    implFiles.forEach(filePath => implCandidates.add(filePath));
                }
                if (implCandidates.size > 0) {
                    const implList = Array.from(implCandidates).filter(filePath => filePath !== File);
                    let implIndex = 1;
                    for (const filePath of implList) {
                        const implSnippet = extractSnippet(filePath, ItemName);
                        if (!implSnippet.found) {
                            continue;
                        }
                        const implHeader = `--- Impl匹配: ${implClassName ?? "未知实现类"} (${implIndex}/${implList.length}) ---`;
                        resultSnippets.push(`${implHeader}\n${implSnippet.text}`);
                        const implCallSection = buildCallPathSection(filePath, implSnippet.text);
                        if (implCallSection) {
                            resultSnippets.push(implCallSection);
                        }
                        implIndex += 1;
                    }
                }

                return resultSnippets.join("\n\n");
            }));

            return {
                content: [
                    {
                        type: "text",
                        text: results.join("\n\n" + "=".repeat(30) + "\n\n"),
                    },
                ],
            } as any;
        }
    );
}
