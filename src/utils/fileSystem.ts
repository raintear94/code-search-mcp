/**
 * 文件系统工具类
 * 提供路径处理和文件操作的通用方法
 */

import * as fs from "fs";
import * as path from "path";

/**
 * 检查路径是否存在
 * @param filePath 文件路径
 * @returns 是否存在
 */
export function pathExists(filePath: string): boolean {
    try {
        fs.accessSync(filePath);
        return true;
    } catch {
        return false;
    }
}

/**
 * 检查是否为目录
 * @param filePath 路径
 * @returns 是否为目录
 */
export function isDirectory(filePath: string): boolean {
    try {
        return fs.statSync(filePath).isDirectory();
    } catch {
        return false;
    }
}

/**
 * 检查是否为文件
 * @param filePath 路径
 * @returns 是否为文件
 */
export function isFile(filePath: string): boolean {
    try {
        return fs.statSync(filePath).isFile();
    } catch {
        return false;
    }
}

/**
 * 获取文件大小（字节）
 * @param filePath 文件路径
 * @returns 文件大小
 */
export function getFileSize(filePath: string): number {
    try {
        return fs.statSync(filePath).size;
    } catch {
        return 0;
    }
}

/**
 * 读取文件内容
 * @param filePath 文件路径
 * @param encoding 编码，默认 utf-8
 * @returns 文件内容
 */
export function readFileContent(filePath: string, encoding: BufferEncoding = "utf-8"): string {
    return fs.readFileSync(filePath, encoding);
}

/**
 * 规范化路径
 * @param filePath 原始路径
 * @returns 规范化后的绝对路径
 */
export function normalizePath(filePath: string): string {
    return path.resolve(filePath);
}

/**
 * 获取文件扩展名
 * @param filePath 文件路径
 * @returns 扩展名（不含点号）
 */
export function getExtension(filePath: string): string {
    return path.extname(filePath).slice(1).toLowerCase();
}

/**
 * 获取文件修改时间
 * @param filePath 文件路径
 * @returns ISO 格式的时间字符串
 */
export function getModifiedTime(filePath: string): string {
    try {
        return fs.statSync(filePath).mtime.toISOString();
    } catch {
        return "";
    }
}
