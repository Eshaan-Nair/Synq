import { WindowChunk } from "./chunker";

export interface Session {
  _id: string;
  projectName: string;
  platform: string;
  summary?: string;
  tripleCount: number;
  hasFullChat: boolean;
  topicCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FullChat {
  sessionId: string;
  rawText: string;
  messageCount: number;
  platform: string;
  createdAt: Date;
}

export interface Job {
  _id: string;
  type: "triple_extraction";
  payload: any;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
  deadLettered: boolean;
  failedAt?: Date;
  error?: string;
  attempts: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface Triple {
  subject: string;
  subjectType: string;
  relation: string;
  object: string;
  objectType: string;
  sessionId: string;
  timestamp: string;
}

export interface RetrievedChunk {
  chunkIndex: number;
  content: string;
  score: number;
  [key: string]: any; // Allow for extra metadata like sessionId, project, etc.
}

export interface ISessionStore {
  // Session
  createSession(projectName: string, platform: string): Promise<Session>;
  getSessions(): Promise<Session[]>;
  getSession(id: string): Promise<Session | null>;
  updateSession(id: string, update: Partial<Session>): Promise<void>;
  deleteSession(id: string): Promise<void>;
  
  // Active Session
  getActiveSessionId(): Promise<string | null>;
  setActiveSessionId(sessionId: string | null): Promise<void>;
  
  // Full Chat
  saveFullChat(sessionId: string, rawText: string, messageCount: number, platform: string): Promise<void>;
  getFullChat(sessionId: string): Promise<FullChat | null>;
  
  // Jobs
  createJob(type: string, payload: any): Promise<Job>;
  getNextJob(): Promise<Job | null>;
  updateJob(id: string, update: Partial<Job>): Promise<void>;
  getJobStatus(): Promise<{ pending: number; processing: number; deadLettered: number }>;
  clearJobs(): Promise<void>;
}

export interface IGraphStore {
  saveTriple(triple: Triple): Promise<void>;
  getTriplesBySession(sessionId: string): Promise<Triple[]>;
  getGraphData(filters: { sessionId?: string; type?: string; relation?: string; limit?: number }): Promise<{ nodes: any[]; links: any[] }>;
  deleteTriplesBySession(sessionId: string): Promise<void>;
}

export interface IVectorStore {
  storeChunks(chunks: WindowChunk[]): Promise<void>;
  retrieveRelevantChunks(query: string, sessionId: string, topN?: number): Promise<RetrievedChunk[]>;
  retrieveGlobalChunks(query: string, topN?: number): Promise<RetrievedChunk[]>;
  deleteChunksBySession(sessionId: string): Promise<void>;
}
