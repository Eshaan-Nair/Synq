import { ModelInfo, InferenceApi } from '../pinecone-generated-ts-fetch/inference';
export declare const getModel: (infApi: InferenceApi) => (modelName: string) => Promise<ModelInfo>;
