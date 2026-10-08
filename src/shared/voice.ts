// Claptrap's voice for the UI. All lines are original — inspired by the character's
// over-eager energy, not quoted from the games.

export const pick = <T>(lines: readonly T[]): T => lines[Math.floor(Math.random() * lines.length)]

export const voice = {
  watching: [
    'Eyes on the prize! The prize is you!',
    'Observing! Documenting! Being incredibly helpful!',
    'Watching you work. You are doing GREAT, probably!',
    'Recording history as it happens, minion!'
  ],
  paused: [
    'Napping. Do not poke the robot.',
    'Taking a well-deserved break. I earned it!',
    'Eye closed. Totally not peeking.'
  ],
  idle: [
    'Hello? Is anyone there? ...Hello?',
    'You went quiet. I will wait. Patiently. Very patiently.',
    'Standing by! Standing by SO hard!'
  ],
  blind: [
    "I can't see ANYTHING! Help me, minion!",
    'My eye! My beautiful eye! It needs permission!'
  ],
  needsKey: [
    'My brain is unplugged! Feed me an API key!',
    'No brain, no notes. Settings, please!'
  ],
  excluded: [
    'Averting my eye. Privacy is my middle name! My first name is Claptrap.',
    'Not looking! I promised! Robot honor!'
  ],
  error: [
    'Ow. Something went wrong in my circuits.',
    'Minor malfunction! Nothing to worry about! Probably!'
  ],
  saved: ['SAVED! Totally saved!', 'Got it! Writing that down in my memory banks!', 'Configuration accepted! I feel different already!'],
  daySummary: ['Day summary written! I am SO proud of us!', 'Another glorious day, documented!']
} as const
