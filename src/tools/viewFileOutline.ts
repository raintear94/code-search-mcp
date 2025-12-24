/**
 * view_files_outlines 工具 (批量版)
 * 提取多个文件中的类和方法大纲
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import * as fs from "fs";
import { pathExists, isFile, getExtension } from "../utils/fileSystem.js";

/**
 * 大纲条目
 */
export interface OutlineItem {
    name: string;
    type: "class" | "method" | "function" | "interface" | "field" | "other";
    startLine: number;
    endLine?: number;
    signature?: string;
}

/**
 * 注册 view_files_outlines 工具到 MCP 服务器
 * @param server MCP 服务器实例
 */
export function registerViewFileOutline(server: McpServer): void {
    server.tool(
        "view_files_outlines",
        "[Deep Code Insight] Batch extraction of file structural outlines. The best tool for exploring global project structures, enhanced for Java with Spring annotation parsing (e.g., identifying API routes, Service components). Use this to concurrently fetch outlines for multiple files when building project maps, tracing interface logic, or performing large-scale code reviews.",
        {
            // List of absolute paths for target files
            AbsolutePaths: z.array(z.string()).describe("List of absolute paths for target files."),
        } as any,
        async (input: any) => {
            const { AbsolutePaths } = input;

            if (!Array.isArray(AbsolutePaths) || AbsolutePaths.length === 0) {
                return {
                    content: [{ type: "text", text: JSON.stringify({ error: "请提供至少一个文件路径" }) }],
                } as any;
            }

            // 并发处理所有文件
            const results = await Promise.all(AbsolutePaths.map(async (AbsolutePath) => {
                if (!pathExists(AbsolutePath) || !isFile(AbsolutePath)) {
                    return { path: AbsolutePath, error: "文件不存在或路径无效" };
                }

                try {
                    const content = fs.readFileSync(AbsolutePath, "utf-8");
                    const ext = getExtension(AbsolutePath);
                    const outline = parseOutline(content, ext);

                    return {
                        path: AbsolutePath,
                        language: ext,
                        totalItems: outline.length,
                        outline,
                    };
                } catch (error) {
                    return {
                        path: AbsolutePath,
                        error: `大纲解析失败: ${error instanceof Error ? error.message : String(error)}`,
                    };
                }
            }));

            return {
                content: [
                    {
                        type: "text",
                        text: JSON.stringify(results),
                    },
                ],
            } as any;
        }
    );
}

/**
 * 解析代码大纲 (简单正则表达式实现，增强了起止行号检测)
 * @param content 文件内容
 * @param ext 扩展名
 */
export function parseOutline(content: string, ext: string): OutlineItem[] {
    const lines = content.split("\n");
    const items: OutlineItem[] = [];
    const patterns = getPatternsForExtension(ext);

    lines.forEach((line, index) => {
        for (const pattern of patterns) {
            const match = line.match(pattern.regex);
            if (match) {
                let signature = line.trim();
                let startLine = index + 1;
                let endLine = startLine;

                // 1. Java 特殊处理：向上抓取注解和注释
                if (ext === "java") {
                    const annotations: string[] = [];
                    let j = index - 1;
                    while (j >= 0) {
                        const prevLine = lines[j].trim();
                        if (prevLine.startsWith("@")) {
                            annotations.unshift(prevLine);
                        } else if (prevLine === "" || prevLine.startsWith("*") || prevLine.startsWith("//")) {
                            // 跳过空行或注释内容
                        } else if (prevLine.startsWith("/**") || prevLine.startsWith("/*")) {
                            break;
                        } else {
                            break;
                        }
                        j--;
                    }
                    if (annotations.length > 0) {
                        signature = annotations.join(" ") + " " + signature;
                    }
                }

                // 2. 检测代码块结束位置 (针对类、方法等)
                if (pattern.type !== "field") {
                    let braceCount = 0;
                    let foundOpenBrace = false;
                    for (let k = index; k < lines.length; k++) {
                        const currentLine = lines[k];

                        // 简单的括号匹配
                        const openMatches = (currentLine.match(/{/g) || []).length;
                        const closeMatches = (currentLine.match(/}/g) || []).length;

                        if (openMatches > 0) foundOpenBrace = true;
                        braceCount += openMatches;
                        braceCount -= closeMatches;

                        if (foundOpenBrace && braceCount <= 0) {
                            endLine = k + 1;
                            break;
                        }
                        // 如果到文件末尾还没闭合，或者当前行就是结束符号（如 Python 的缩进，暂不处理 Python 复杂缩进）
                        endLine = k + 1;
                    }
                }

                items.push({
                    name: match[pattern.nameGroup],
                    type: pattern.type,
                    startLine: startLine,
                    endLine: endLine,
                    signature: signature,
                });
                break;
            }
        }
    });

    return items;
}

/**
 * 根据扩展名获取正则模式
 */
export function getPatternsForExtension(ext: string): { regex: RegExp; type: OutlineItem["type"]; nameGroup: number }[] {
    switch (ext) {
        case "ts":
        case "tsx":
        case "js":
        case "jsx":
            return [
                { regex: /class\s+([a-zA-Z0-9_$]+)/, type: "class", nameGroup: 1 },
                { regex: /interface\s+([a-zA-Z0-9_$]+)/, type: "interface", nameGroup: 1 },
                { regex: /(?:async\s+)?function\s+([a-zA-Z0-9_$]+)/, type: "function", nameGroup: 1 },
                { regex: /([a-zA-Z0-9_$]+)\s*(?::\s*[^=]+)?\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/, type: "function", nameGroup: 1 },
                { regex: /^\s*(?:public|private|protected|static|async)*\s*([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*(?::|{)/, type: "method", nameGroup: 1 },
            ];
        case "java":
            return [
                { regex: /(?:public|private|protected|static|final|\s)*class\s+([a-zA-Z0-9_$]+)/, type: "class", nameGroup: 1 },
                { regex: /(?:public|private|protected|static|final|\s)*interface\s+([a-zA-Z0-9_$]+)/, type: "interface", nameGroup: 1 },
                { regex: /(?:public|private|protected|static|final|synchronized|async|\s)+[\w<>[\]]+\s+([a-zA-Z0-9_$]+)\s*\([^)]*\)/, type: "method", nameGroup: 1 },
                // 增加字段匹配：通常是 private 类型 变量名; 或 @注解 类型 变量名;
                { regex: /^\s*(?:private|public|protected|static|final)*\s+[\w<>[\]]+\s+([a-zA-Z0-9_$]+)\s*(?:=\s*[^;]+)?\s*;/, type: "field", nameGroup: 1 },
            ];
        case "py":
            return [
                { regex: /^class\s+([a-zA-Z0-9_$]+)/, type: "class", nameGroup: 1 },
                { regex: /^\s*def\s+([a-zA-Z0-9_$]+)/, type: "function", nameGroup: 1 },
            ];
        case "go":
            return [
                { regex: /^type\s+([a-zA-Z0-9_$]+)\s+struct/, type: "class", nameGroup: 1 },
                { regex: /^type\s+([a-zA-Z0-9_$]+)\s+interface/, type: "interface", nameGroup: 1 },
                { regex: /^func\s+([a-zA-Z0-9_$]+)\s*\(/, type: "function", nameGroup: 1 },
                { regex: /^func\s+\([^)]+\)\s+([a-zA-Z0-9_$]+)\s*\(/, type: "method", nameGroup: 1 },
            ];
        default:
            return [];
    }
}
