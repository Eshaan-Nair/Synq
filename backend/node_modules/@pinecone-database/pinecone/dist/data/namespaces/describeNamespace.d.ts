import { NamespaceDescription } from '../../pinecone-generated-ts-fetch/db_data';
import { NamespaceOperationsProvider } from '../namespaces/namespacesOperationsProvider';
export declare const describeNamespace: (apiProvider: NamespaceOperationsProvider) => (namespace: string) => Promise<NamespaceDescription>;
