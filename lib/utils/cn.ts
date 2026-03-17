import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * 合并 Tailwind CSS 类名的工具函数
 * 
 * 使用 clsx 处理条件类名，使用 tailwindcss-merge 解决类名冲突
 * 
 * @param inputs - 类名输入
 * @returns 合并后的类名字符串
 * 
 * @example
 * ```tsx
 * cn('px-2 py-1', 'px-4') // 'py-1 px-4'
 * cn('text-red-500', condition && 'text-blue-500') // 根据条件返回对应类名
 * ```
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}