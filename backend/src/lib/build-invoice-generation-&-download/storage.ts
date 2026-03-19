/**
 * Storage Backend Abstraction for Invoice PDFs
 */

import * as fs from 'fs';
import * as path from 'path';

export interface StorageBackend {
  saveFile(invoiceId: string, buffer: Buffer, orgId: string): Promise<string>;
  getFile(invoiceId: string, orgId: string): Promise<Buffer | null>;
  deleteFile(invoiceId: string, orgId: string): Promise<boolean>;
  getDownloadUrl(pathOrKey: string): string;
  fileExists(invoiceId: string, orgId: string): Promise<boolean>;
}

export interface FilesystemStorageOptions {
  basePath: string;
}

export class FilesystemStorageBackend implements StorageBackend {
  private basePath: string;

  constructor(options: FilesystemStorageOptions) {
    this.basePath = options.basePath || path.join(process.cwd(), 'storage', 'invoices');
  }

  private getInvoicePath(invoiceId: string, orgId: string): string {
    return path.join(this.basePath, orgId, `${invoiceId}.pdf`);
  }

  async saveFile(invoiceId: string, buffer: Buffer, orgId: string): Promise<string> {
    const filePath = this.getInvoicePath(invoiceId, orgId);
    const dir = path.dirname(filePath);

    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(filePath, buffer);
    return filePath;
  }

  async getFile(invoiceId: string, orgId: string): Promise<Buffer | null> {
    const filePath = this.getInvoicePath(invoiceId, orgId);
    try {
      return await fs.promises.readFile(filePath);
    } catch (error: any) {
      if (error.code === 'ENOENT') return null;
      throw error;
    }
  }

  async deleteFile(invoiceId: string, orgId: string): Promise<boolean> {
    const filePath = this.getInvoicePath(invoiceId, orgId);
    try {
      await fs.promises.unlink(filePath);
      return true;
    } catch (error: any) {
      if (error.code === 'ENOENT') return false;
      throw error;
    }
  }

  getDownloadUrl(pathOrKey: string): string {
    return `file://${pathOrKey}`;
  }

  async fileExists(invoiceId: string, orgId: string): Promise<boolean> {
    const filePath = this.getInvoicePath(invoiceId, orgId);
    try {
      await fs.promises.access(filePath, fs.constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }
}

let defaultStorage: FilesystemStorageBackend | null = null;

export function getDefaultStorage(): FilesystemStorageBackend {
  if (!defaultStorage) {
    defaultStorage = new FilesystemStorageBackend({
      basePath: path.join(process.cwd(), 'storage', 'invoices'),
    });
  }
  return defaultStorage;
}
