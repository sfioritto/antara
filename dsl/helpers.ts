import fs from 'fs/promises';

export async function readFile(path: string): Promise<string> {
  if (process.env.NODE_ENV === 'development') {
    const content = await fs.readFile(path, 'utf-8');
    return content;
  }

  throw new Error('readFile is not supported in production environment');
}
