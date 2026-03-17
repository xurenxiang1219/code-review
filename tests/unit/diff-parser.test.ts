import { DiffParser } from '@/lib/git/diff-parser';
import { FileChangeType } from '@/types/git';

describe('DiffParser', () => {
  let parser: DiffParser;

  beforeEach(() => {
    parser = new DiffParser();
  });

  describe('detectLanguage', () => {
    it('应该正确识别 TypeScript 文件', () => {
      expect(parser.detectLanguage('src/utils.ts')).toBe('typescript');
      expect(parser.detectLanguage('components/Button.tsx')).toBe('typescript');
    });

    it('应该正确识别 JavaScript 文件', () => {
      expect(parser.detectLanguage('src/utils.js')).toBe('javascript');
      expect(parser.detectLanguage('components/Button.jsx')).toBe('javascript');
    });

    it('应该正确识别 Python 文件', () => {
      expect(parser.detectLanguage('main.py')).toBe('python');
      expect(parser.detectLanguage('utils.pyx')).toBe('python');
    });

    it('应该正确识别特殊文件名', () => {
      expect(parser.detectLanguage('Dockerfile')).toBe('dockerfile');
      expect(parser.detectLanguage('Dockerfile.prod')).toBe('dockerfile');
      expect(parser.detectLanguage('Makefile')).toBe('makefile');
    });

    it('应该对未知扩展名返回 text', () => {
      expect(parser.detectLanguage('unknown.xyz')).toBe('text');
      expect(parser.detectLanguage('noextension')).toBe('text');
    });
  });

  describe('isBinaryFile', () => {
    it('应该正确识别二进制文件', () => {
      expect(parser.isBinaryFile('image.jpg')).toBe(true);
      expect(parser.isBinaryFile('document.pdf')).toBe(true);
      expect(parser.isBinaryFile('archive.zip')).toBe(true);
      expect(parser.isBinaryFile('font.ttf')).toBe(true);
    });

    it('应该正确识别非二进制文件', () => {
      expect(parser.isBinaryFile('script.js')).toBe(false);
      expect(parser.isBinaryFile('style.css')).toBe(false);
      expect(parser.isBinaryFile('README.md')).toBe(false);
    });
  });

  describe('filterCodeFiles', () => {
    it('应该过滤掉二进制文件和非代码文件', () => {
      const files = [
        {
          path: 'src/utils.ts',
          type: 'modified' as FileChangeType,
          language: 'typescript',
          additions: 10,
          deletions: 5,
          patch: '',
        },
        {
          path: 'image.jpg',
          type: 'added' as FileChangeType,
          language: 'text',
          additions: 0,
          deletions: 0,
          patch: '',
        },
        {
          path: 'README.md',
          type: 'modified' as FileChangeType,
          language: 'markdown',
          additions: 3,
          deletions: 1,
          patch: '',
        },
        {
          path: 'unknown.xyz',
          type: 'added' as FileChangeType,
          language: 'text',
          additions: 5,
          deletions: 0,
          patch: '',
        },
      ];

      const codeFiles = parser.filterCodeFiles(files);
      
      expect(codeFiles).toHaveLength(2);
      expect(codeFiles[0].path).toBe('src/utils.ts');
      expect(codeFiles[1].path).toBe('README.md');
    });
  });

  describe('parseDiff', () => {
    it('应该解析简单的 diff 文本', () => {
      const diffText = `diff --git a/src/utils.ts b/src/utils.ts
index 1234567..abcdefg 100644
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -1,3 +1,4 @@
 export function hello() {
+  console.log('Hello World');
   return 'hello';
 }`;

      const result = parser.parseDiff(diffText, 'abc123');
      
      expect(result.commitHash).toBe('abc123');
      expect(result.files).toHaveLength(1);
      expect(result.files[0].path).toBe('src/utils.ts');
      expect(result.files[0].type).toBe('modified');
      expect(result.files[0].language).toBe('typescript');
      expect(result.files[0].additions).toBe(1);
      expect(result.files[0].deletions).toBe(0);
      expect(result.totalAdditions).toBe(1);
      expect(result.totalDeletions).toBe(0);
      expect(result.totalFiles).toBe(1);
    });

    it('应该解析新增文件的 diff', () => {
      const diffText = `diff --git a/new-file.js b/new-file.js
new file mode 100644
index 0000000..1234567
--- /dev/null
+++ b/new-file.js
@@ -0,0 +1,3 @@
+function test() {
+  return true;
+}`;

      const result = parser.parseDiff(diffText, 'def456');
      
      expect(result.files[0].type).toBe('added');
      expect(result.files[0].additions).toBe(3);
      expect(result.files[0].deletions).toBe(0);
    });

    it('应该解析删除文件的 diff', () => {
      const diffText = `diff --git a/old-file.js b/old-file.js
deleted file mode 100644
index 1234567..0000000
--- a/old-file.js
+++ /dev/null
@@ -1,3 +0,0 @@
-function old() {
-  return false;
-}`;

      const result = parser.parseDiff(diffText, 'ghi789');
      
      expect(result.files[0].type).toBe('deleted');
      expect(result.files[0].additions).toBe(0);
      expect(result.files[0].deletions).toBe(3);
    });
  });

  describe('splitDiff', () => {
    it('应该将大型差异拆分为多个批次', () => {
      const diffInfo = {
        commitHash: 'abc123',
        files: [
          {
            path: 'file1.ts',
            type: 'modified' as FileChangeType,
            language: 'typescript',
            additions: 3000,
            deletions: 1000,
            patch: '',
          },
          {
            path: 'file2.ts',
            type: 'modified' as FileChangeType,
            language: 'typescript',
            additions: 2000,
            deletions: 500,
            patch: '',
          },
          {
            path: 'file3.ts',
            type: 'modified' as FileChangeType,
            language: 'typescript',
            additions: 1000,
            deletions: 200,
            patch: '',
          },
        ],
        totalAdditions: 6000,
        totalDeletions: 1700,
        totalFiles: 3,
      };

      const batches = parser.splitDiff(diffInfo, 3000);
      
      expect(batches).toHaveLength(3);
      expect(batches[0].files).toHaveLength(1);
      expect(batches[0].files[0].path).toBe('file1.ts');
      expect(batches[1].files).toHaveLength(1);
      expect(batches[1].files[0].path).toBe('file2.ts');
      expect(batches[2].files).toHaveLength(1);
      expect(batches[2].files[0].path).toBe('file3.ts');
    });

    it('应该将小文件合并到同一批次', () => {
      const diffInfo = {
        commitHash: 'abc123',
        files: [
          {
            path: 'file1.ts',
            type: 'modified' as FileChangeType,
            language: 'typescript',
            additions: 100,
            deletions: 50,
            patch: '',
          },
          {
            path: 'file2.ts',
            type: 'modified' as FileChangeType,
            language: 'typescript',
            additions: 200,
            deletions: 100,
            patch: '',
          },
        ],
        totalAdditions: 300,
        totalDeletions: 150,
        totalFiles: 2,
      };

      const batches = parser.splitDiff(diffInfo, 1000);
      
      expect(batches).toHaveLength(1);
      expect(batches[0].files).toHaveLength(2);
    });
  });
});