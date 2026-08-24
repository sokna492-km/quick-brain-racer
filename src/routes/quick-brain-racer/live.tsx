import { createFileRoute } from "@tanstack/react-router";

import { RaceGame } from "@/components/RaceGame";

const title = "KruMath Math Racer — Live";
const description =
  "Race live: solve math by steering into the correct answer lane and boost past your rivals.";

export const Route = createFileRoute("/quick-brain-racer/live")({
  head: () => ({
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
    ],
  }),
  component: QuickBrainRacerLive,
});

function QuickBrainRacerLive() {
  return (
    <main>
      <h1 className="sr-only">KruMath Math Racer Live</h1>
      <RaceGame mode="live" />
    </main>
  );
}
