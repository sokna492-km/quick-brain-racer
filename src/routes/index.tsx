import { createFileRoute } from "@tanstack/react-router";

import { RaceGame } from "@/components/RaceGame";

const title = "KruMath Math Racer — Solve Fast, Race Faster";
const description =
  "An arcade math racing game: hit PLAY, race four rivals on a 3D track, and boost your racer by solving quick mental-math questions.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main>
      <h1 className="sr-only">KruMath Math Racer</h1>
      <RaceGame />
    </main>
  );
}
