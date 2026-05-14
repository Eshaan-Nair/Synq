import * as d3 from "d3";

export interface Session {
  _id: string;
  projectName: string;
  platform: string;
  tripleCount: number;
  topicCount?: number;
  isProcessingGraph?: boolean;
  updatedAt: string;
}

export interface Triple {
  subject: string;
  subjectType: string;
  relation: string;
  object: string;
  objectType: string;
  timestamp: string;
}

export interface Node extends d3.SimulationNodeDatum {
  id: string;
  type: string;
  community?: number;
  firstSeen?: string;
  degree?: number;
}

export interface Link extends d3.SimulationLinkDatum<Node> {
  source: string | Node;
  target: string | Node;
  relation: string;
  timestamp?: string;
}

export interface ChatData {
  rawText: string;
  messageCount: number;
  createdAt: string;
}

export interface JobStatus {
  pending: number;
  processing: number;
  deadLettered: number;
}
