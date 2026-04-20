import { ModelInfoList, InferenceApi } from '../pinecone-generated-ts-fetch/inference';
/**
 * The options for listing models.
 */
export interface ListModelsOptions {
    /**
     * Filter to limit the models returned. ('embed' or 'rerank')
     */
    type?: string;
    /**
     * Filter embedding models by vector type ('dense' or 'sparse'). Only relevant when type is 'embed'.
     */
    vectorType?: string;
}
export declare const listModels: (infApi: InferenceApi) => (options?: ListModelsOptions) => Promise<ModelInfoList>;
