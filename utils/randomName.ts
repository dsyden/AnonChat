const ADJECTIVES = ['purple', 'happy', 'sunny', 'brave', 'calm', 'swift', 'bright', 'silent', 'misty', 'cool'];
const NOUNS = ['flower', 'mountain', 'river', 'sky', 'ocean', 'forest', 'tiger', 'eagle', 'moon', 'star'];

export const generateRoomName = (): string => {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const num = Math.floor(Math.random() * 100);
  return `${adj}${noun}${num}`;
};