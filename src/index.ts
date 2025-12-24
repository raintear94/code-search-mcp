#!/usr/bin/env node
/**
 * 代码搜索 MCP 服务器入口
 * 专注于深度代码理解工具：
 * - view_file_outline: 提取文件结构大纲（支持 Java 注解感知）
 * - view_code_item: 精准查看代码项定义
 * - view_files_full_context: 批量内容读取 + 结构透视 (Java 增强)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerViewFileOutline } from "./tools/viewFileOutline.js";
import { registerViewCodeItem } from "./tools/viewCodeItem.js";
import { registerViewFilesFullContext } from "./tools/viewFilesFullContext.js";

/**
 * 创建并配置 MCP 服务器
 */
async function main() {
    // 创建 MCP 服务器实例
    const server = new McpServer({
        name: "code-search",
        version: "1.2.0",
    });

    // 仅注册核心代码理解工具
    registerViewFileOutline(server);
    registerViewCodeItem(server);
    registerViewFilesFullContext(server);

    // 使用 stdio 传输层启动服务器
    const transport = new StdioServerTransport();
    await server.connect(transport);

    console.error("代码搜索 MCP (Core) 服务器已启动 (stdio 模式)");
}

main().catch((error) => {
    console.error("启动失败:", error);
    process.exit(1);
});
