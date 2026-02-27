import React, { useState, useRef, useEffect } from "react";
import { API_BASE, getAuthHeaders } from "../utils/api";

const RecordingModal = ({ onClose, onTranscript }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState("");
  const [stream, setStream] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Cleanup function to stop tracks
  const stopMediaStream = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  useEffect(() => {
    return () => stopMediaStream();
  }, [stream]);

  const startRecording = async () => {
    setError("");
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
      });
      setStream(mediaStream);

      const mediaRecorder = new MediaRecorder(mediaStream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      setError("Could not access microphone. Please allow permissions.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, {
          type: "audio/wav",
        });
        await sendAudioToBackend(audioBlob);
        stopMediaStream();
      };
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const handleCancel = () => {
    // Abort recording if active
    if (isRecording && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop(); // Stop recorder but don't process
    }
    stopMediaStream();
    onClose();
  };

  const sendAudioToBackend = async (audioBlob) => {
    setIsProcessing(true);
    try {
      const formData = new FormData();
      formData.append("audio", audioBlob, "recording.wav");

      const headers = getAuthHeaders();
      delete headers["Content-Type"]; // Let browser set multipart/form-data with boundary

      const res = await fetch(`${API_BASE}/nurse/transcribe-audio`, {
        method: "POST",
        headers: headers,
        body: formData,
      });

      const data = await res.json();
      if (data.success) {
        onTranscript(data.transcript);
        onClose();
      } else {
        setError(data.error || "Transcription failed");
      }
    } catch (err) {
      setError("Failed to send audio for transcription.");
    }
    setIsProcessing(false);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[200] p-4">
      <div className="bg-surface border border-border rounded-2xl shadow-2xl max-w-md w-full p-6 text-foreground animate-fade-in-up">
        <h3 className="text-xl font-bold mb-6 flex items-center gap-2 text-white">
          <span className="p-2 bg-error-soft rounded-lg text-error">🎤</span>{" "}
          Voice Recording
        </h3>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-error p-4 rounded-xl mb-6 text-sm flex items-center gap-2">
            <span>⚠️</span> {error}
          </div>
        )}

        <div className="flex flex-col items-center justify-center py-8 space-y-6">
          {/* Recording Visualizer (Simple Pulse) */}
          <div
            className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${isRecording ? "bg-error-soft scale-110" : "bg-card"}`}
          >
            {isRecording && (
              <>
                <div className="absolute inset-0 rounded-full bg-error-soft animate-ping"></div>
                <div className="absolute inset-0 rounded-full bg-red-500/10 animate-pulse delay-75"></div>
              </>
            )}
            <button
              onClick={isRecording ? stopRecording : startRecording}
              disabled={isProcessing}
              className={`relative z-10 w-16 h-16 rounded-full flex items-center justify-center transition-all transform active:scale-95 shadow-lg ${
                isRecording
                  ? "bg-red-600 hover:bg-red-700 text-white"
                  : "bg-primary hover:bg-primary text-white shadow-teal-500/30"
              } ${isProcessing ? "opacity-50 cursor-not-allowed" : ""}`}
            >
              {isProcessing ? (
                <svg
                  className="animate-spin h-8 w-8 text-white"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
              ) : isRecording ? (
                <div className="w-6 h-6 bg-surface rounded-md"></div> // Icon for toggling
              ) : (
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                  <line x1="12" y1="19" x2="12" y2="23"></line>
                  <line x1="8" y1="23" x2="16" y2="23"></line>
                </svg>
              )}
            </button>
          </div>

          <p className="text-center font-medium text-lg">
            {isProcessing
              ? "Transcribing..."
              : isRecording
                ? "Recording... Tap icon to Stop"
                : "Tap to Start Recording"}
          </p>

          {/* Explicit Stop Button for User Clarity */}
          {isRecording && !isProcessing && (
            <button
              onClick={stopRecording}
              className="flex items-center gap-2 px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold shadow-lg animate-fade-in-up"
            >
              <div className="w-3 h-3 bg-surface rounded-sm"></div>
              Stop & Save Transcript
            </button>
          )}

          {!isRecording && !isProcessing && (
            <p className="text-muted-foreground text-sm text-center max-w-xs">
              Speak clearly. The audio will be transcribed and formatted
              automatically.
            </p>
          )}
        </div>

        <div className="flex justify-center mt-4">
          <button
            onClick={handleCancel}
            disabled={isProcessing}
            className="px-6 py-2 text-muted-foreground hover:text-white transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default RecordingModal;
