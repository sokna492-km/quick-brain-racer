# Math Speed Racers

I want to build a web-based math racing game inspired by the gameplay style and visual concept shown in the attached screenshot.
The screenshot is only a gameplay reference. Do not copy its branding, characters, assets, or UI. Create an original KruMath game with the same general feeling: multiple characters racing on a 3D track, with the player's mathematical performance directly affecting their racing speed.
The key principle is:
Click Play → Race immediately → Solve math → Get faster → Win the race.
There should be NO setup screen where the user needs to select grade, operation, number range, difficulty, race length, or other configuration.
1. Instant Play
The landing screen should have a prominent PLAY button.
When the user clicks PLAY:
Start a very short countdown, such as 3 → 2 → 1 → GO.
Immediately start the race.
Automatically generate appropriate math questions.
The game determines question difficulty dynamically.
The user simply plays.
The experience should be extremely low-friction.
Do not ask the player to configure anything before starting.
2. Automatic Math Difficulty
The game should automatically control the mathematics.
Start with simple mental-arithmetic questions and gradually increase or decrease difficulty based on the player's performance.
Initial question pool:
Addition
Subtraction
Multiplication
Division
Later, the system can expand to:
Fractions
Percentages
Integers
Algebra
Powers
Ratios
Geometry
The player should not manually select these categories.
Instead, the game should dynamically decide which question to present.
For example:
Fast + correct answers → gradually increase difficulty.
Slow + correct answers → maintain similar difficulty.
Wrong answers → temporarily reduce difficulty.
Multiple consecutive correct answers → increase challenge.
The objective is to create a natural adaptive difficulty system without interrupting the race.
3. Core Gameplay
The player races against several AI-controlled characters.
During the race, math questions appear.
The player's performance controls their speed:
Correct answer
→ speed boost
→ move forward
→ increase combo
Fast correct answer
→ stronger boost
→ higher reward
Wrong answer
→ slow down
→ lose combo
→ small penalty
The player should constantly make a simple decision:
Solve correctly and quickly to race faster.
4. Track
Create a colourful 3D racing track inspired by the attached reference.
The track should have:
Forward perspective.
Curved sections.
Multiple lanes.
Original game environment.
Mathematical bonus objects.
Mathematical penalty objects.
Finish line.
Strong sense of speed.
Possible track objects:
+1
+5
×2
-2
÷2
These should affect the player's current boost, score, or speed.
The track should not simply be decorative. It should contribute to the gameplay.
5. Characters
Use simple, original, cute racing characters.
Start with:
Player
3–4 AI opponents
Display YOU above the player's character.
Display the current race position prominently:
1st
2nd
3rd
etc.
Characters should have smooth movement and animations.
6. Math Question UI
Questions should appear during the race without stopping the game.
Example:
8 × 7 = ?
[ 54 ] [ 56 ] [ 64 ]
The player taps an answer.
Immediately provide visual feedback.
Correct:
✓ +BOOST
Wrong:
✕ SLOW DOWN
The question system should be fast enough for mental calculation.
Avoid long word problems during the racing gameplay.
7. Adaptive Difficulty
Create a simple adaptive difficulty engine.
Track:
Accuracy
Response time
Consecutive correct answers
Current combo
Recent mistakes
Use these metrics to determine the next question difficulty.
The difficulty should change gradually rather than suddenly.
The player should feel that the game is challenging them naturally rather than explicitly telling them that the difficulty has changed.
8. Race UI
Keep the HUD simple.
Show:
Current position
Current math question
Answer choices
Speed / boost meter
Math combo
Race progress
Score
Do not cover too much of the game screen with UI.
The racing environment should remain visually dominant.
9. Game States
Use a clean game state machine:
Home
Countdown
Racing
Finish
Results
The math question system should operate inside the Racing state.
The race should not stop every time a question appears.
10. Game Feel
This is extremely important.
The game must feel smooth and responsive.
Pay particular attention to:
Character movement.
Acceleration.
Deceleration.
Turning.
Camera movement.
Direction changes.
Collision detection.
Track alignment.
Answer input.
Speed boosting.
AI movement.
Frame-rate independence.
Use delta-time-based movement and a stable game loop.
Avoid movement logic that depends directly on inconsistent browser timing.
There must be no:
Shaking
Jitter
Teleporting
Input lag
Random movement
Inconsistent acceleration
Collision glitches
Characters getting stuck
Camera instability
11. Mobile First
The game should work particularly well on mobile.
Support:
Tap-to-answer.
Swipe or simple touch movement.
Responsive layout.
Large answer buttons.
Desktop keyboard controls as a secondary option.
The player should be able to play comfortably with one hand.
12. Scoring
Scoring should primarily reward mathematical performance.
Reward:
Correct answers.
Fast answers.
Consecutive correct answers.
Combo.
Track bonuses.
Final race position.
Keep scoring deterministic and easy to understand.
13. AI Opponents
AI opponents should automatically answer simulated math questions.
Their behaviour should vary naturally.
For example:
Easy AI → slower and less accurate.
Normal AI → balanced.
Hard AI → faster and more accurate.
The AI should provide competition but should not feel unfair.
Their performance should also vary slightly from race to race so the outcome is not predetermined.
14. Replayability
Every time the user clicks PLAY, generate a new race.
Randomise:
Questions.
Question order.
AI performance.
Track bonuses.
Some track elements.
The player should be able to immediately click PLAY AGAIN after finishing.
Do not force the player through configuration screens between races.
15. KruMath Integration
This should fit into the existing KruMath ecosystem.
KruMath already has AI-powered practice, math curriculum, progress tracking, points, leaderboard functionality, and gamified learning systems.
The existing repository also has KruBattle with a GameEngine and mode-plugin architecture. Before creating a new game engine, inspect the existing implementation and determine whether this racing game can cleanly reuse or extend that architecture.
Do not unnecessarily modify existing learning, payment, authentication, or production scoring flows.
16. Development Approach
Before coding:
Audit the existing repository.
Inspect the existing KruBattle/GameEngine architecture.
Inspect existing math question generation.
Identify reusable scoring, authentication, and Supabase services.
Design the racing game architecture.
Define the game state machine.
Define the adaptive math difficulty system.
Define the racing movement system.
Define the scoring system.
Then implement the MVP.
Do not build unnecessary infrastructure if existing KruMath systems can be reused.
17. MVP
The first playable version should contain only:
PLAY button.
3-second countdown.
3D racing track.
Player character.
3–4 AI opponents.
Automatic math questions.
3 answer choices.
Correct-answer boost.
Wrong-answer slowdown.
Math combo.
Race position.
Finish line.
Results screen.
PLAY AGAIN button.
Responsive mobile experience.
Do not add complicated menus or configuration screens.
18. Main Product Principle
The game should feel like an arcade game first and a math exercise second.
The player should not feel like:
"Now I need to take a math quiz."
They should feel like:
"I need to answer this quickly so my racer can get ahead."
The complete gameplay loop should be:
PLAY → RACE → SOLVE → BOOST → OVERTAKE → WIN → PLAY AGAIN
The ultimate purpose is to improve mental-math speed and accuracy through repeated gameplay without making the experience feel like traditional studying.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://quick-brain-racer.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/3edcf217-a942-44b0-9d9f-1b83b540c3e3).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
