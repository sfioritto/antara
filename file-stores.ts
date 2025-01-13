export interface FileStore {
  readFile(path: string): Promise<string>;
}

export class LocalFileStore implements FileStore {
  async readFile(path: string): Promise<string> {
    const fs = await import('fs/promises');
    return fs.readFile(path, 'utf-8');
  }
}

export class CloudflareFileStore implements FileStore {
  constructor(private files: Map<string, string>) {}

  async readFile(path: string): Promise<string> {
    const content = this.files.get(path);
    if (!content) {
      throw new Error(`File not found: ${path}`);
    }
    return content;
  }
}