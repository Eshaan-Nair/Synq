import { ManageIndexesApi, BackupList } from '../pinecone-generated-ts-fetch/db_control';
/**
 * The options for listing backups.
 */
export interface ListBackupsOptions {
    /**
     * The index name to list backups for. If not provided, all project backups will be listed.
     */
    indexName?: string;
    /**
     * Maximum number of backups to return.
     */
    limit?: number;
    /**
     * Token used for pagination to retrieve the next page of results.
     */
    paginationToken?: string;
}
export declare const listBackups: (api: ManageIndexesApi) => (listBackupOptions?: ListBackupsOptions) => Promise<BackupList>;
