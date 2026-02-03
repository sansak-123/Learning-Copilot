"use client";
import { useState } from "react";

export default function Chatwindow() {
  const [messages, setMessages] = useState([
    { role: "system", text: "Welcome! Let’s start your learning journey." },
  ]);
  const [input, setInput] = useState("");
  const [videos, setVideos] = useState<any[]>([]); // store recommended videos

  const handleSend = async () => {
    if (!input.trim()) return;
    setMessages([...messages, { role: "user", text: input }]);

    // Call YouTube API for recommendations
    try {
      const res = await fetch(
        `/api/youtube?q=${encodeURIComponent(input)}`
      );
      const data = await res.json();
      setVideos(data.items || []);
    } catch (err) {
      console.error("YT fetch error:", err);
    }

    setInput("");
  };

  return (
    <div className="flex flex-col flex-1 border rounded-lg bg-white shadow p-4">
      <div className="flex-1 overflow-y-auto space-y-3 mb-4">
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`p-2 rounded-lg max-w-xs ${
              msg.role === "user"
                ? "bg-blue-100 ml-auto text-right"
                : "bg-gray-100"
            }`}
          >
            {msg.text}
          </div>
        ))}

        {/* YouTube Recommendations */}
        {videos.length > 0 && (
          <div className="mt-4">
            <h3 className="font-semibold mb-2">🎥 Recommended Videos</h3>
            <div className="space-y-2">
              {videos.slice(0, 3).map((video, idx) => (
                <a
                  key={idx}
                  href={`https://www.youtube.com/watch?v=${video.id.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-blue-600 underline"
                >
                  {video.snippet.title}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex">
        <input
          className="flex-1 border rounded-l-lg px-3 py-2"
          placeholder="Type your answer or question..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleSend()}
        />
        <button
          className="bg-blue-600 text-white px-4 rounded-r-lg hover:bg-blue-700"
          onClick={handleSend}
        >
          Send
        </button>
      </div>
    </div>
  );
}
