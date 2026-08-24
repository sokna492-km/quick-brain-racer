import { createFileRoute } from "@tanstack/react-router";

import { RaceGame } from "@/components/RaceGame";

const title = "KruMath Math Racer — Solve Fast, Race Faster";
const description =
  "An arcade math racing game: hit PLAY, race four rivals on a 3D track, and boost your racer by steering into the correct answer.";

export const Route = createFileRoute("/quick-brain-racer/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: QuickBrainRacerHome,
});

function QuickBrainRacerHome() {
  return (
    <main>
      <h1 className="sr-only">KruMath Math Racer</h1>
      <RaceGame mode="home" />
    </main>
  );
}
