"use client";

import { useState } from "react";
import { getYoutubeVideos } from "../app/utils/getYoutubeVideos";
import type { YoutubeVideo } from "../app/utils/getYoutubeVideos";

interface YoutubeRecsProps {
  topic: string;
}

export default function YoutubeRecs({ topic }: YoutubeRecsProps) {
  const [showModal, setShowModal] = useState(false);
  const [videos, setVideos] = useState<YoutubeVideo[]>([]);
  const [loading, setLoading] = useState(false);

  const handleOpen = async () => {
    setShowModal(true);
    setLoading(true);
    try {
      const results = await getYoutubeVideos(topic);
      setVideos(results);
    } catch (err) {
      console.error(err);
      setVideos([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={handleOpen}
        className="fixed bottom-5 right-5 z-50 bg-red-600 text-white p-3 rounded-full shadow-lg hover:bg-red-700 transition-all"
        title={`Recommended YouTube videos for ${topic}`}
      >
        ▶
      </button>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-neutral-900 text-neutral-100 rounded-xl w-96 max-h-[80vh] overflow-hidden shadow-xl relative">
            {/* Close button */}
            <button
              className="absolute top-2 right-2 text-neutral-400 hover:text-white"
              onClick={() => setShowModal(false)}
            >
              ✖
            </button>

            {/* Header */}
            <div className="p-4 border-b border-neutral-800">
              <h2 className="text-lg font-semibold">YouTube Recommendations</h2>
              <p className="text-sm text-neutral-400 mt-1">Topic: {topic}</p>
            </div>

            {/* Video List */}
            <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
              {loading && (
                <div className="text-center text-neutral-400">Loading...</div>
              )}

              {!loading && videos.length === 0 && (
                <div className="text-center text-neutral-400">
                  No videos found.
                </div>
              )}

              {videos.map((v) => (
                <a
                  key={v.id.videoId}
                  href={`https://www.youtube.com/watch?v=${v.id.videoId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex flex-col bg-neutral-800 rounded-lg p-2 hover:bg-neutral-700 transition"
                >
                  <img
                    src={v.snippet.thumbnails.medium.url}
                    alt={v.snippet.title}
                    className="w-full rounded-md"
                  />
                  <p className="mt-2 text-sm font-medium line-clamp-2">
                    {v.snippet.title}
                  </p>
                  <p className="mt-1 text-xs text-neutral-400 line-clamp-2">
                    {v.snippet.channelTitle}
                  </p>
                </a>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
