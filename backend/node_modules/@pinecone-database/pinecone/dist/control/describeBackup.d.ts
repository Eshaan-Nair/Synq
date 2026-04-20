import { ManageIndexesApi, BackupModel } from '../pinecone-generated-ts-fetch/db_control';
import type { BackupId } from './types';
/**
 * The string ID of the backup to describe.
 */
export type DescribeBackupOptions = BackupId;
export declare const describeBackup: (api: ManageIndexesApi) => (backupId: DescribeBackupOptions) => Promise<BackupModel>;
