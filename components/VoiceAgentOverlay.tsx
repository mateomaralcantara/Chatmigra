import React from 'react';

interface VoiceAgentOverlayProps {
  status: 'idle' | 'connecting' | 'listening' | 'speaking' | 'error';
  transcription: { user: string; model: string };
  onClose: () => void;
}

const StatusDisplay: React.FC<{ status: 'idle' | 'connecting' | 'listening' | 'speaking' | 'error' }> = ({ status }) => {
  const statusMap = {
    idle: { text: "Inactivo", color: "bg-gray-500" },
    connecting: { text: "Conectando...", color: "bg-yellow-500 animate-pulse" },
    listening: { text: "Escuchando...", color: "bg-green-500 animate-pulse" },
    speaking: { text: "Agente hablando...", color: "bg-blue-500" },
    error: { text: "Error de conexión", color: "bg-red-500" },
  };

  const { text, color } = statusMap[status];

  return (
    <div className="flex items-center justify-center space-x-2 mb-4">
      <span className={`w-3 h-3 rounded-full ${color}`}></span>
      <span className="font-medium text-lg">{text}</span>
    </div>
  );
};

const VoiceAgentOverlay: React.FC<VoiceAgentOverlayProps> = ({ status, transcription, onClose }) => {
  const isSpeaking = status === 'speaking';
  const isListening = status === 'listening';
  
  return (
    <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col justify-center items-center z-50 text-white p-4">
      <div className="w-full max-w-2xl text-center">
        
        {/* Avatar */}
        <div className={`relative w-32 h-32 mx-auto mb-6 rounded-full flex items-center justify-center transition-all duration-300 ${isListening ? 'bg-green-500/30' : 'bg-blue-500/30'}`}>
           <div className={`absolute inset-0 rounded-full border-4 ${isListening ? 'border-green-400 animate-pulse' : 'border-blue-400'}`}></div>
           <img src="https://i.ibb.co/bF03v7j/agent-avatar.png" alt="Agent Avatar" className="w-28 h-28 rounded-full" />
        </div>

        <StatusDisplay status={status} />
        
        {/* Transcription */}
        <div className="w-full h-48 bg-white/10 rounded-lg p-4 text-left overflow-y-auto space-y-3">
            <div>
                <span className="font-bold text-blue-300">Tú: </span>
                <span className="italic">{transcription.user}</span>
            </div>
             <hr className="border-white/20"/>
            <div>
                <span className="font-bold text-green-300">ChatMig: </span>
                <span>{transcription.model}</span>
            </div>
        </div>
        
        {/* Close Button */}
        <button
          onClick={onClose}
          className="mt-8 px-6 py-3 bg-red-600 hover:bg-red-700 rounded-full font-bold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black/50 focus:ring-red-500"
        >
          Finalizar Conversación de Voz
        </button>
      </div>
    </div>
  );
};

export default VoiceAgentOverlay;
