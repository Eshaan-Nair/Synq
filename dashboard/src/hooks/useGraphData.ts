import { useState, useCallback, useRef } from "react";
import { fetchContext, apiClient, extractErrorMessage } from "../api/ArcRift";
import { fetchFullChat } from "../api/rag";
import type { Session, Node, Link, Triple, ChatData } from "../types";

export const useGraphData = () => {
  const [nodes, setNodes] = useState<Node[]>([]);
  const [links, setLinks] = useState<Link[]>([]);
  const [triples, setTriples] = useState<Triple[]>([]);
  const [chatData, setChatData] = useState<ChatData | null>(null);
  const [loadingSession, setLoadingSession] = useState(false);
  const isLoadingSessionRef = useRef(false);

  const loadSessionData = useCallback(async (session: Session, activeSessionId?: string) => {
    const isNewSession = activeSessionId !== session._id;
    if (isNewSession) {
      setLoadingSession(true);
      setChatData(null);
    }
    
    isLoadingSessionRef.current = true;
    try {
      const graphUrl = `/api/graph/session/${session._id}`;
      const [graphRes, contextData, chatResult] = await Promise.all([
        apiClient.get(graphUrl),
        fetchContext(session._id),
        fetchFullChat(session._id),
      ]);
      
      const graphData = graphRes.data;
      
      setNodes(prev => {
        if (prev.length === graphData.nodes.length && !isNewSession) return prev;
        return graphData.nodes;
      });
      
      setLinks(prev => {
        if (prev.length === graphData.links.length && !isNewSession) return prev;
        return graphData.links;
      });

      setTriples(contextData.triples || []);
      
      if (chatResult.found) {
        setChatData({
          rawText: chatResult.rawText || "",
          messageCount: chatResult.messageCount || 0,
          createdAt: chatResult.createdAt || "",
        });
      }
    } catch (err) {
      console.error(`Failed to load session: ${extractErrorMessage(err)}`);
    } finally {
      setLoadingSession(false);
      isLoadingSessionRef.current = false;
    }
  }, []);

  const resetData = useCallback(() => {
    setNodes([]);
    setLinks([]);
    setTriples([]);
    setChatData(null);
  }, []);

  return {
    nodes,
    links,
    triples,
    chatData,
    loadingSession,
    isLoadingSession: isLoadingSessionRef.current,
    loadSessionData,
    resetData,
  };
};
