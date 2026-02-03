"use client";
import { useEffect, useState } from "react";

type Video = {
  title: string;
  channel: string;
  thumbnail: string;
  link: string;
};

export default function VideoRecommendations({ topic }: { topic: string }) {
  const [videos, setVideos] = useState<Video[]>([]);

  useEffect(() => {
    if (!topic) return;

    const fetchVideos = async () => {
      const res = await fetch(`/api/youtube?query=${encodeURIComponent(topic)}`);
      const data = await res.json();
      setVideos(data.videos || []);
    };

    fetchVideos();
  }, [topic]);

  return (
    <div>
      <h3 className="text-lg font-bold mb-2">📺 Recommended Videos</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {videos.map((video, idx) => (
          <div
            key={idx}
            className="p-2 border rounded-md shadow-sm hover:shadow-md transition"
          >
            <a href={video.link} target="_blank" rel="noopener noreferrer">
              <img
                src={video.thumbnail}
                alt={video.title}
                className="rounded-md w-full"
              />
            </a>
            <h4 className="text-sm font-semibold mt-1">{video.title}</h4>
            <p className="text-xs text-gray-500">{video.channel}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
