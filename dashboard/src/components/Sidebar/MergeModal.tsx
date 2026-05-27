import React, { useState } from "react";
import type { Session } from "../../types";

interface MergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: Session[];
  activeSessionId: string;
  onMerge: (sourceId: string) => void;
}

const MergeModal: React.FC<MergeModalProps> = ({ isOpen, onClose, sessions, activeSessionId, onMerge }) => {
  const [selectedSourceId, setSelectedSourceId] = useState<string>("");

  if (!isOpen) return null;

  // Filter out the active session from the options
  const mergeOptions = sessions.filter(s => s._id !== activeSessionId);

  const handleMerge = () => {
    if (selectedSourceId) {
      onMerge(selectedSourceId);
      setSelectedSourceId(""); // reset
    }
  };

  return (
    <div className="modal-overlay" style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, backdropFilter: 'blur(4px)'
    }}>
      <div className="modal-content" style={{
        backgroundColor: '#1a1d24',
        border: '1px solid #2d3340',
        borderRadius: '12px',
        padding: '24px',
        width: '400px',
        maxWidth: '90vw',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
      }}>
        <h2 style={{ margin: '0 0 16px 0', fontSize: '18px', fontWeight: 600, color: '#fff' }}>Merge Session</h2>
        
        <p style={{ color: '#9ca3af', fontSize: '14px', marginBottom: '20px', lineHeight: 1.5 }}>
          Select a project to merge into the current active session. All facts, chunks, and chat history will be combined.
          <br /><br />
          <strong style={{ color: '#ef4444' }}>Warning:</strong> The selected source session will be permanently deleted after merging.
        </p>

        <div style={{ marginBottom: '20px' }}>
          <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px', color: '#cbd5e1' }}>Source Session</label>
          <select 
            className="config-select"
            value={selectedSourceId}
            onChange={(e) => setSelectedSourceId(e.target.value)}
            style={{ width: '100%' }}
          >
            <option value="" disabled>Select a session...</option>
            {mergeOptions.map(s => (
              <option key={s._id} value={s._id}>{s.projectName}</option>
            ))}
          </select>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button 
            className="action-btn" 
            onClick={onClose}
            style={{ padding: '8px 16px', borderRadius: '6px' }}
          >
            Cancel
          </button>
          <button 
            className="chat-submit-btn" 
            onClick={handleMerge}
            disabled={!selectedSourceId}
            style={{ 
              padding: '8px 16px', borderRadius: '6px',
              backgroundColor: selectedSourceId ? '#3b82f6' : '#374151',
              color: '#fff', border: 'none', cursor: selectedSourceId ? 'pointer' : 'not-allowed'
            }}
          >
            Merge
          </button>
        </div>
      </div>
    </div>
  );
};

export default MergeModal;
