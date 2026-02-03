import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = searchParams.get("query");
  const apiKey = process.env.YOUTUBE_API_KEY;

  if (!query) {
    return NextResponse.json({ error: "Missing query" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(
        query
      )}&key=${apiKey}&maxResults=5&type=video`
    );

    const data = await res.json();

    const videos = data.items?.map((video: any) => ({
      title: video.snippet.title,
      channel: video.snippet.channelTitle,
      thumbnail: video.snippet.thumbnails.medium.url,
      link: `https://www.youtube.com/watch?v=${video.id.videoId}`,
    }));

    return NextResponse.json({ videos });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Failed to fetch YouTube videos" },
      { status: 500 }
    );
  }
}
