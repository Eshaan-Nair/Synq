import { ManageIndexesApi } from '../pinecone-generated-ts-fetch/db_control';
import type { BackupId } from './types';
/**
 * The string ID of the backup to delete.
 */
export type DeleteBackupOptions = BackupId;
export declare const deleteBackup: (api: ManageIndexesApi) => (backupId: DeleteBackupOptions) => Promise<void>;
