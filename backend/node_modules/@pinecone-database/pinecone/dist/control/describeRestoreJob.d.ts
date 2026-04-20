import { ManageIndexesApi, RestoreJobModel } from '../pinecone-generated-ts-fetch/db_control';
import type { RestoreJobId } from './types';
/**
 * The string ID of the restore job to describe.
 */
export type DescribeRestoreJobOptions = RestoreJobId;
export declare const describeRestoreJob: (api: ManageIndexesApi) => (restoreJobId: DescribeRestoreJobOptions) => Promise<RestoreJobModel>;
