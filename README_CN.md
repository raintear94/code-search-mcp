# Code Search MCP Server

面向 AI 代理的高性能批量化 MCP（Model Context Protocol）代码理解工具集，专注“深度解析 + 批量并发 + 全景上下文”，用于快速探索大型代码库并降低多次往返的上下文成本。

---

## 适用场景
- 一次性读取多个文件并自动补全依赖上下文
- 快速建立项目结构大纲（含 Java 注解感知）
- 精准定位类、方法或定义块并批量返回

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

## Java Spring 适用性
- **分层识别**：按 Controller → Service → Impl → MQ → Mapper/Repository/DAO 的角色权重排序输出
- **注解感知**：Java 大纲解析会向上回溯注解，合并进签名
- **依赖注入解析**：自动识别并列出常见注入字段
- **工程结构支持**：支持 `src/main/java` 与多模块 Java 工程路径解析

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
[English](README.md) | [中文](README_CN.md)
