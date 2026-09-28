/**
 * YouTube's title and thumbnail test is a Studio control. The Data API can set a
 * thumbnail; it does not start a test. Until a documented test method exists, the
 * pairs stay a manual choice.
 *
 * `YOUTUBE_TITLE_TEST=1` is reserved for the day that method is confirmed. It does
 * not call YouTube.
 */

export type YoutubeTestStatus = { available: false; reason: string } | { available: true };

export function youtubeTitleTest(): YoutubeTestStatus {
  if (process.env.YOUTUBE_TITLE_TEST === "1") {
    return { available: true };
  }
  return {
    available: false,
    reason: "YouTube doesn't offer title testing through the API yet. Pick a title here, then set it in YouTube if you want to test it.",
  };
}
