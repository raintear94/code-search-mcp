[![EN](https://img.shields.io/badge/EN-README-blue)](README.md) [![中文](https://img.shields.io/badge/中文-README_CN-red)](README_CN.md)

# Code Search MCP Server

面向 AI 代理的高性能批量化 MCP（Model Context Protocol）代码理解工具集，**专为 Java 优化**。

旨在解决 AI 在面对大型复杂项目时容易“上下文缺失”或“逻辑迷路”的痛点。本工具专注“深度解析 + 批量并发 + 全景上下文”，以极低的 Token 成本为 AI 提供高质量的代码认知能力，大幅提升代码逻辑查找与理解的速度。


## 适用场景
- **全景理解**：一次性读取多个文件并自动展开依赖结构，拒绝“挤牙膏”式问答。
- **快速导航**：建立带有 Java 注解感知的项目地图，快速理清业务入口。
- **精准手术**：在海量代码中精准定位类、方法或定义块，只看需要的代码。

## 核心工具
| 工具 | 能力 | 说明 |
| --- | --- | --- |
| `view_files_full_context` | 全景上下文 | 批量读取文件并自动展开依赖结构与模型字段，适合跨文件理解 |
| `view_files_outlines` | 结构大纲 | 批量提取文件结构大纲，Java 注解深度感知 |
| `view_code_items` | 精准定位 | 跨文件定位类/方法/定义块并返回完整代码片段 |

## 设计要点
- **stdio 传输**：通过标准输入输出进行 JSON-RPC 2.0 通信
- **确定性调用协议**：所有路径参数必须为绝对路径，不支持路径通配符
- **Java 大纲增强**：对类/接口/方法进行注解回溯，注解会合并进签名

## Java Spring 深度适配
不仅是搜索文本，更是理解业务：
- **分层架构识别**：智能识别并按 Controller → Service → Impl → MQ → Repository 排序，让 AI 一眼看清业务流转逻辑。
- **深度注解感知**：AI 不仅能看到方法签名，还能读取并合并 `@Transactional`、`@PreAuthorize` 等关键元数据，真正理解业务语义。
- **依赖注入 (DI) 解析**：自动扫描并列出核心依赖字段，AI 无需猜测 `userService` 来源，直接掌握组件关系。
- **工程结构支持**：完美支持 `src/main/java` 标准目录结构与多模块 Maven/Gradle 工程。

## 前置要求
- Node.js v18.0.0 或更高版本

## 安装与构建
```bash
npm install
npm run build
```


## 在 AI 工具中使用

```json
{
  "mcpServers": {
    "code-search": {
      "command": "node",
      "args": ["{file}/code-search/index.js"]
    }
  }
}
```

## 使用建议
- **优先使用** `view_files_full_context`，一次获取全景上下文，降低反复跳转成本
- **绝对路径** 是强制要求，提升稳定性与可复现性
- **复杂检索** 优先拆分为多次精准调用，避免模糊匹配

## 开源声明
本项目以 MIT License 开源，欢迎在遵循许可证条款的前提下自由使用、修改与分发。
