# Massivecraft's Wars

This repository is a static, browser-based implementation of **War System (Osc’ird), Version 1.3** or at least as faithful as I can get it to. I hope you enjoy my I'll keep my mouth shut until you play the game, my author's note is there! Have fun!

## Current playable state

All four computer opponents track which mobile units have entered the fight, value forward pressure and control in the opposing half, and resist repeating the same small group of pieces. After leaving their home rows, units pursue the surviving enemy instead of treating the empty far edge as their objective. Corporal remains reckless, Captain favors direct exchanges, General balances formation play with aggression, and Aristides’ Codex attempts a perfect game.

- Standard solo play with four required computer difficulty choices
- Corporal (Easy): deliberately costly aggression and bad-terrain preference while still pursuing victory
- Captain (Medium): direct, shallow play that favors mutually destructive exchanges
- General (Hard): strategic deployment and formation play, with greedier and less reliable decisions after Round 15
- Aristides’ Codex: deterministic preservation-first search that attempts the strongest available game

- 8 × 8 battle with 16 units per side
- 16 × 16 battle with 32 units per side

- Visual control-pattern and movement-range diagrams for every unit
- Six one-unit practice lessons with immediate explanations for correct and incorrect choices
- A mistake-tolerant final tutorial battle with a 20-round cap, stronger highlights, hints, and a two-round recommended solution in which every unit contributes to a capture
- Random terrain generation or unlimited manual terrain painting before deployment
- Field and unit guides, including the original rules link and implementation clarifications
- Scenario, rules-engine, AI-controller, and interface modules kept separate for eventual online play (BIG MAYBE.)
